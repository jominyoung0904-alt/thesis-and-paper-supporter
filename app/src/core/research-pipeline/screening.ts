/**
 * Screening step (FR-RES-003): a (typically lighter) model labels each paper
 * high / medium / low against the research question.
 *
 * Papers are sent in batches of at most {@link BATCH_SIZE}, each entry carrying
 * the title plus the first {@link ABSTRACT_CHARS} characters of the abstract to
 * keep token use bounded. If a batch's JSON cannot be parsed, every paper in
 * that batch is conservatively labelled `medium` — we never silently drop a
 * paper because the model misbehaved.
 */

import type { LlmAdapter } from '../llm';
import type { SerializedMemory } from '../memory/serializer';
import { buildSystemPrompt } from '../memory/serializer';
import type { PaperMetadata, RelevanceLabel, ScreenedPaper, UsageTotals } from './types';
import { addUsage, parseJsonLoose } from './types';

/** Max papers per LLM screening call. */
export const BATCH_SIZE = 20;
/** Abstract prefix length included per paper. */
const ABSTRACT_CHARS = 300;

const VALID_LABELS: ReadonlySet<string> = new Set<RelevanceLabel>(['high', 'medium', 'low']);

const TASK_INSTRUCTION =
  '아래 번호가 매겨진 논문 목록 각각이 사용자의 연구 질문과 얼마나 관련 있는지 평가하라. ' +
  '관련도는 high(직접 관련), medium(부분 관련), low(거의 무관) 중 하나로 판정한다. ' +
  '반드시 아래 JSON 배열 형식만 출력하라.\n' +
  '[{"index": 1, "relevance": "high"}, {"index": 2, "relevance": "low"}]';

/**
 * Screens all `papers` against `question`. Order of the input is preserved in
 * the output. Never throws.
 */
export async function screenPapers(
  question: string,
  papers: PaperMetadata[],
  memory: SerializedMemory,
  llm: LlmAdapter,
  model: string,
  usage: UsageTotals,
): Promise<ScreenedPaper[]> {
  const results: ScreenedPaper[] = [];
  for (let offset = 0; offset < papers.length; offset += BATCH_SIZE) {
    const batch = papers.slice(offset, offset + BATCH_SIZE);
    const labels = await screenBatch(question, batch, memory, llm, model, usage);
    batch.forEach((paper, index) => {
      results.push({ paper, relevance: labels[index] ?? 'medium' });
    });
  }
  return results;
}

/** Screens a single batch, returning one label per paper (index-aligned). */
async function screenBatch(
  question: string,
  batch: PaperMetadata[],
  memory: SerializedMemory,
  llm: LlmAdapter,
  model: string,
  usage: UsageTotals,
): Promise<RelevanceLabel[]> {
  const system = buildSystemPrompt(memory, TASK_INSTRUCTION);
  const userContent = `연구 질문: ${question}\n\n논문 목록:\n${renderBatch(batch)}`;

  const response = await llm.chat({ model, system, messages: [{ role: 'user', content: userContent }] });
  addUsage(usage, response);

  const parsed = extractLabels(parseJsonLoose(response.text), batch.length);
  // Conservative fallback: an unparseable batch is treated as all-medium.
  return parsed ?? batch.map(() => 'medium');
}

/** Renders a batch as a numbered list of "title + abstract snippet" lines. */
function renderBatch(batch: PaperMetadata[]): string {
  return batch
    .map((paper, index) => {
      const snippet = (paper.abstract ?? '').slice(0, ABSTRACT_CHARS);
      const abstractLine = snippet.length > 0 ? `\n   초록: ${snippet}` : '';
      return `${index + 1}. ${paper.title}${abstractLine}`;
    })
    .join('\n');
}

/**
 * Coerces parsed JSON into an index-aligned label array of length `count`.
 * Accepts either a bare array or `{ "ratings": [...] }`. Returns `null` when
 * the value is not array-shaped so the caller applies the all-medium fallback.
 * Entries with an out-of-range index or invalid label are ignored (that slot
 * defaults to `medium`).
 */
function extractLabels(value: unknown, count: number): RelevanceLabel[] | null {
  const array = Array.isArray(value)
    ? value
    : typeof value === 'object' && value !== null && Array.isArray((value as Record<string, unknown>).ratings)
      ? ((value as Record<string, unknown>).ratings as unknown[])
      : null;
  if (array === null) return null;

  const labels: RelevanceLabel[] = new Array<RelevanceLabel>(count).fill('medium');
  for (const entry of array) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const index = typeof record.index === 'number' ? record.index - 1 : -1;
    const label = record.relevance;
    if (index < 0 || index >= count) continue;
    if (typeof label === 'string' && VALID_LABELS.has(label)) {
      labels[index] = label as RelevanceLabel;
    }
  }
  return labels;
}
