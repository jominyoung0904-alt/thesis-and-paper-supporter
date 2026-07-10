/**
 * Detailed-mode second pass for the deep-research pipeline ("상세검색").
 *
 * Paid-mode-only feature (gated in `researchGateHandlers.ts`): after the
 * standard first pass (query-gen → search → screen) completes, one extra LLM
 * call proposes *augmentation* search terms aimed at the angles the first pass
 * under-covered, runs a second search with them, keeps ONLY papers the first
 * pass never collected (title dedup against the first set), screens just those,
 * and merges the verdicts. Everything degrades gracefully to the first-pass
 * result: a parse miss on the augmentation terms, an empty second search, or a
 * dead source never fails the run.
 *
 * LLM-call budget (hard bound): augmentation query-gen = exactly 1 call (no
 * retry), screening of new papers = 1~2 calls (new papers are capped at
 * {@link MAX_NEW_PAPERS} = two screening batches). Additional cost is therefore
 * never more than 3 LLM calls beyond the standard pass.
 */

import type { AcademicClient, PaperMetadata } from '../academic-api/types';
import type { LlmAdapter } from '../llm';
import type { SerializedMemory } from '../memory/serializer';
import { buildSystemPrompt } from '../memory/serializer';
import { BATCH_SIZE, screenPapers } from './screening';
import { dedupeAgainst, dedupePapers, runSearches } from './search';
import type { FailedSource, GeneratedQueries, PipelineStage, ScreenedPaper, UsageTotals } from './types';
import { addUsage, parseJsonLoose } from './types';

/** Korean prefix stamped onto progress `detail` so the (unchanged) renderer shows detailed-pass stages. */
export const DETAILED_PREFIX = '상세검색:';

/** Max new papers screened in the second pass — two {@link BATCH_SIZE} batches, bounding screening to ≤2 calls. */
const MAX_NEW_PAPERS = BATCH_SIZE * 2;

/** Titles from the first pass used to steer augmentation (bounded so the prompt stays small). */
const CONTEXT_TITLE_LIMIT = 12;

const AUGMENT_INSTRUCTION =
  '아래는 사용자의 연구 질문에 대해 1차로 이미 찾은 논문들과 1차 검색어야. ' +
  '1차에서 충분히 다루지 못한 각도나 부족한 부분을 보강하기 위한 추가 검색어를 만들어라. ' +
  '국문 검색어 2개와 영문 검색어 2개를 만들되, 1차 검색어와 의미가 겹치지 않는 새로운 관점이어야 한다. ' +
  '반드시 아래 JSON 형식만 출력하고 다른 설명은 붙이지 마라.\n' +
  '{"ko": ["국문검색어1", "국문검색어2"], "en": ["english term 1", "english term 2"]}';

/** Everything the detailed pass needs; `emit` reuses the pipeline's progress channel. */
export interface DetailedPassInput {
  question: string;
  memory: SerializedMemory;
  llm: LlmAdapter;
  model: string;
  screeningLlm: LlmAdapter;
  screeningModel: string;
  clients: AcademicClient[];
  firstQueries: GeneratedQueries;
  firstPapers: PaperMetadata[];
  firstScreened: ScreenedPaper[];
  firstFailedSources: FailedSource[];
  usage: UsageTotals;
  emit: (stage: PipelineStage, detail?: string) => void;
}

/** Merged artifacts after the detailed pass (each superset of the first pass, or equal to it on graceful skip). */
export interface DetailedPassResult {
  queries: GeneratedQueries;
  papers: PaperMetadata[];
  screened: ScreenedPaper[];
  failedSources: FailedSource[];
}

/**
 * Runs the detailed second pass. Never throws a recoverable condition: any
 * step that cannot add value (no augmentation terms, no new papers) returns the
 * first-pass artifacts unchanged so the caller proceeds straight to report.
 */
export async function runDetailedPass(input: DetailedPassInput): Promise<DetailedPassResult> {
  const firstResult: DetailedPassResult = {
    queries: input.firstQueries,
    papers: input.firstPapers,
    screened: input.firstScreened,
    failedSources: input.firstFailedSources,
  };

  const augment = await generateAugmentQueries(input);
  if (augment === null) return firstResult;

  input.emit('searching', `${DETAILED_PREFIX} 보강 검색 중(2/2단계)`);
  const secondSearch = await runSearches(input.clients, augment);
  const newPapers = dedupeAgainst(input.firstPapers, dedupePapers(secondSearch.papers)).slice(0, MAX_NEW_PAPERS);

  const mergedQueries: GeneratedQueries = {
    ko: [...input.firstQueries.ko, ...augment.ko],
    en: [...input.firstQueries.en, ...augment.en],
  };
  const mergedFailed = mergeFailedSources(input.firstFailedSources, secondSearch.failedSources);

  if (newPapers.length === 0) {
    return { queries: mergedQueries, papers: input.firstPapers, screened: input.firstScreened, failedSources: mergedFailed };
  }

  input.emit('screening', `${DETAILED_PREFIX} 새로 찾은 ${newPapers.length}편 확인 중(2/2단계)`);
  const newScreened = await screenPapers(
    input.question,
    newPapers,
    input.memory,
    input.screeningLlm,
    input.screeningModel,
    input.usage,
  );

  return {
    queries: mergedQueries,
    papers: [...input.firstPapers, ...newPapers],
    screened: [...input.firstScreened, ...newScreened],
    failedSources: mergedFailed,
  };
}

/**
 * One LLM call for augmentation terms. Returns `null` — signalling "skip the
 * second pass" — when the JSON cannot be parsed OR when every proposed term
 * merely duplicates a first-pass term. Never retries (the retry is what would
 * break the ≤3-call budget).
 */
async function generateAugmentQueries(input: DetailedPassInput): Promise<GeneratedQueries | null> {
  const system = buildSystemPrompt(input.memory, AUGMENT_INSTRUCTION);
  const userContent = buildAugmentContext(input.question, input.firstQueries, input.firstScreened);

  const response = await input.llm.chat({ model: input.model, system, messages: [{ role: 'user', content: userContent }] });
  addUsage(input.usage, response);

  const coerced = coerceQueries(parseJsonLoose(response.text));
  if (coerced === null) return null;

  const excluded = new Set([...input.firstQueries.ko, ...input.firstQueries.en].map(normalizeTerm));
  const ko = coerced.ko.filter((term) => !excluded.has(normalizeTerm(term)));
  const en = coerced.en.filter((term) => !excluded.has(normalizeTerm(term)));
  if (ko.length === 0 && en.length === 0) return null;
  return { ko, en };
}

/** Builds the augmentation prompt body: the question, first-pass terms, and a sample of found titles. */
function buildAugmentContext(question: string, firstQueries: GeneratedQueries, firstScreened: ScreenedPaper[]): string {
  const relevantTitles = firstScreened
    .filter((item) => item.relevance !== 'low')
    .slice(0, CONTEXT_TITLE_LIMIT)
    .map((item) => `- ${item.paper.title}`)
    .join('\n');
  const firstTerms = [...firstQueries.ko, ...firstQueries.en].join(', ');
  return (
    `연구 질문: ${question}\n\n` +
    `1차 검색어: ${firstTerms}\n\n` +
    `1차에서 찾은 주요 논문 제목:\n${relevantTitles || '(관련 논문 없음)'}`
  );
}

/** Validates parsed JSON into two term arrays, capped at 2 per language; `null` when unusable. */
function coerceQueries(value: unknown): GeneratedQueries | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const ko = cleanTerms(record.ko);
  const en = cleanTerms(record.en);
  if (ko.length === 0 && en.length === 0) return null;
  return { ko, en };
}

/** Keeps non-empty trimmed string terms, capped at 2 per language. */
function cleanTerms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const terms: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed.length > 0) terms.push(trimmed);
    if (terms.length >= 2) break;
  }
  return terms;
}

/** Case/space-insensitive term key for overlap detection against first-pass terms. */
function normalizeTerm(term: string): string {
  return term.toLowerCase().replace(/\s+/gu, '');
}

/** Unions two failure lists, keeping the first reason recorded per source. */
function mergeFailedSources(first: FailedSource[], second: FailedSource[]): FailedSource[] {
  const seen = new Set(first.map((f) => f.source));
  const merged = [...first];
  for (const failure of second) {
    if (!seen.has(failure.source)) {
      seen.add(failure.source);
      merged.push(failure);
    }
  }
  return merged;
}
