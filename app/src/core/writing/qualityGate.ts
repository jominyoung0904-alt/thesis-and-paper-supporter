/**
 * Generic section quality-gate engine (FR-WRT-001, FR-WRT-002, FR-WRT-007).
 *
 * `runQualityGate` evaluates a `SectionGateDefinition` against a section's
 * text: rule-based criteria run as local, deterministic checks; llm-based
 * criteria are batched into a single LLM call to keep cost/latency down.
 * The gate never fails open — if the LLM response cannot be parsed after one
 * retry, every unresolved llm criterion is marked failed (FR-WRT-002: a
 * broken evaluation must block section completion, never silently pass it).
 */

import type { LlmAdapter } from '../llm/types';
import type { SerializedMemory } from '../memory/serializer';
import { buildSystemPrompt } from '../memory/serializer';
import type { GateCriterion, SectionGateDefinition } from './gateDefinitions';

/** Per-criterion evaluation outcome. `feedback` is always Korean, user-facing. */
export interface CriterionResult {
  criterionId: string;
  passed: boolean;
  feedback: string;
}

/** Overall gate outcome for one section. */
export interface GateResult {
  sectionId: string;
  passed: boolean;
  results: CriterionResult[];
  summary: string;
}

/** Dependencies injected into `runQualityGate` (kept minimal + easily mockable in tests). */
export interface QualityGateDeps {
  llm: LlmAdapter;
  model: string;
  memory?: SerializedMemory;
}

/** Shown for any 'llm' criterion whose result could not be obtained after retrying once. */
const FALLBACK_FEEDBACK = '자동 검사에 실패했어요. 다시 시도해 주세요';

const EVALUATOR_TASK =
  '너는 논문 작성 품질 게이트 평가자다. 주어진 섹션 글이 각 평가 기준을 충족하는지 판단하고, ' +
  '기준마다 한국어로 1~2문장의 피드백을 작성한다. 응답은 지정된 JSON 형식으로만 출력하고, ' +
  'JSON 앞뒤에 다른 텍스트나 코드펜스를 붙이지 않는다.';

/** Registry of rule-based (non-LLM) criterion checkers, keyed by criterion id. */
const RULE_CHECKERS: Record<string, (criterionId: string, sectionText: string) => CriterionResult> = {
  'citation-presence': checkCitationPresence,
};

/** Splits text into non-empty, blank-line-separated paragraphs. Never returns less than 1. */
function countParagraphs(sectionText: string): number {
  const paragraphs = sectionText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return Math.max(1, paragraphs.length);
}

/** Counts citation-like markers: (Author, Year), [n]/[n, m], and [^n] footnotes. */
function countCitations(sectionText: string): number {
  const authorYear = sectionText.match(/\([^()]{0,80}?\d{4}[a-z]?\)/g) ?? [];
  const numeric = sectionText.match(/\[\d+(?:\s*,\s*\d+)*\]/g) ?? [];
  const footnote = sectionText.match(/\[\^\d+\]/g) ?? [];
  return authorYear.length + numeric.length + footnote.length;
}

/**
 * Rule check for the 'citation-presence' criterion (FR-WRT-001): a section
 * needs at least one citation, and at least one citation per paragraph.
 */
export function checkCitationPresence(criterionId: string, sectionText: string): CriterionResult {
  const citations = countCitations(sectionText);
  const paragraphs = countParagraphs(sectionText);

  if (citations === 0) {
    return {
      criterionId,
      passed: false,
      feedback: '인용 표기를 찾을 수 없어요. 주장 문장마다 출처를 추가해 주세요.',
    };
  }
  if (citations < paragraphs) {
    return {
      criterionId,
      passed: false,
      feedback: `인용 표기가 부족해요 (${citations}개, 문단 ${paragraphs}개 대비 최소 ${paragraphs}개 필요해요).`,
    };
  }
  return {
    criterionId,
    passed: true,
    feedback: `인용 표기가 충분히 포함되어 있어요 (${citations}개 확인).`,
  };
}

/** Runs every 'rule' criterion locally; unknown criterion ids fail closed rather than being skipped. */
function runRuleCriteria(criteria: GateCriterion[], sectionText: string): CriterionResult[] {
  return criteria.map((c) => {
    const checker = RULE_CHECKERS[c.id];
    if (!checker) {
      return { criterionId: c.id, passed: false, feedback: `규칙 기반 검사를 찾을 수 없어요: ${c.id}` };
    }
    return checker(c.id, sectionText);
  });
}

function buildEvaluationPrompt(def: SectionGateDefinition, llmCriteria: GateCriterion[], sectionText: string): string {
  const criteriaLines = llmCriteria.map((c) => `- id: ${c.id} / 항목: ${c.label} — ${c.description}`).join('\n');
  return [
    `## 평가 대상 섹션: ${def.sectionLabel}`,
    sectionText,
    '## 평가 기준',
    criteriaLines,
    '## 응답 형식',
    '아래 JSON 형식으로만 응답하라. results 배열은 위 기준 각각에 대해 정확히 하나씩 포함해야 한다.',
    '{"results":[{"criterionId":"...","passed":true,"feedback":"..."}]}',
  ].join('\n\n');
}

interface ParsedCriterionResult {
  criterionId: string;
  passed: boolean;
  feedback: string;
}

/** Extracts the first `{...}` JSON object substring from arbitrary text (tolerates code fences / stray prose). */
function extractJsonObject(text: string): string | undefined {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return undefined;
  return trimmed.slice(start, end + 1);
}

/** Parses and structurally validates the LLM's JSON response. Returns undefined on any failure. */
function parseGateResponse(text: string): ParsedCriterionResult[] | undefined {
  const candidate = extractJsonObject(text);
  if (!candidate) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null || !('results' in parsed)) return undefined;
  const results = (parsed as { results: unknown }).results;
  if (!Array.isArray(results)) return undefined;

  const valid: ParsedCriterionResult[] = [];
  for (const item of results) {
    const rec = item as { criterionId?: unknown; passed?: unknown; feedback?: unknown } | null;
    if (
      typeof rec !== 'object' ||
      rec === null ||
      typeof rec.criterionId !== 'string' ||
      typeof rec.passed !== 'boolean' ||
      typeof rec.feedback !== 'string'
    ) {
      return undefined;
    }
    valid.push({ criterionId: rec.criterionId, passed: rec.passed, feedback: rec.feedback });
  }
  return valid;
}

/** Runs one LLM call and returns a criterionId->result map covering all requested criteria, or undefined. */
async function evaluateLlmCriteriaOnce(
  def: SectionGateDefinition,
  llmCriteria: GateCriterion[],
  sectionText: string,
  deps: QualityGateDeps,
): Promise<Map<string, CriterionResult> | undefined> {
  const system = deps.memory ? buildSystemPrompt(deps.memory, EVALUATOR_TASK) : EVALUATOR_TASK;
  const userMessage = buildEvaluationPrompt(def, llmCriteria, sectionText);

  const response = await deps.llm.chat({
    model: deps.model,
    system,
    messages: [{ role: 'user', content: userMessage }],
  });

  const parsed = parseGateResponse(response.text);
  if (!parsed) return undefined;

  const requiredIds = new Set(llmCriteria.map((c) => c.id));
  const map = new Map<string, CriterionResult>();
  for (const item of parsed) {
    if (requiredIds.has(item.criterionId)) map.set(item.criterionId, item);
  }
  // Every requested criterion must be present in the response, or it is unusable as a whole.
  for (const id of requiredIds) {
    if (!map.has(id)) return undefined;
  }
  return map;
}

/** Evaluates all 'llm' criteria in a single batched call, with one retry; never fails open. */
async function runLlmCriteria(
  def: SectionGateDefinition,
  llmCriteria: GateCriterion[],
  sectionText: string,
  deps: QualityGateDeps,
): Promise<CriterionResult[]> {
  if (llmCriteria.length === 0) return [];

  let map = await evaluateLlmCriteriaOnce(def, llmCriteria, sectionText, deps);
  if (!map) {
    map = await evaluateLlmCriteriaOnce(def, llmCriteria, sectionText, deps);
  }

  return llmCriteria.map((c) => map?.get(c.id) ?? { criterionId: c.id, passed: false, feedback: FALLBACK_FEEDBACK });
}

/** Builds a short Korean summary, naming the first unmet criterion when the gate did not fully pass. */
function buildSummary(def: SectionGateDefinition, results: CriterionResult[]): string {
  const total = results.length;
  const passedCount = results.filter((r) => r.passed).length;
  if (passedCount === total) {
    return `${def.sectionLabel} 섹션이 ${total}개 기준을 모두 충족했어요.`;
  }
  const firstFailed = results.find((r) => !r.passed);
  const criterion = def.criteria.find((c) => c.id === firstFailed?.criterionId);
  const hint = criterion ? ` ${criterion.label}을(를) 보완해 주세요.` : '';
  return `${total}개 기준 중 ${passedCount}개를 충족했어요.${hint}`;
}

/**
 * Evaluates `sectionText` against `def` (FR-WRT-001, reusable for any future
 * section per FR-WRT-007). Rule criteria run locally; llm criteria are
 * judged in one batched call with a single retry on malformed JSON. The
 * gate never passes silently on failure (FR-WRT-002).
 */
export async function runQualityGate(
  def: SectionGateDefinition,
  sectionText: string,
  deps: QualityGateDeps,
): Promise<GateResult> {
  const ruleCriteria = def.criteria.filter((c) => c.check === 'rule');
  const llmCriteria = def.criteria.filter((c) => c.check === 'llm');

  const ruleResults = runRuleCriteria(ruleCriteria, sectionText);
  const llmResults = await runLlmCriteria(def, llmCriteria, sectionText, deps);

  const resultById = new Map<string, CriterionResult>();
  for (const r of [...ruleResults, ...llmResults]) resultById.set(r.criterionId, r);
  // Preserve the definition's declared criterion order in the output, regardless of evaluation order.
  const results = def.criteria.map((c) => resultById.get(c.id)!);

  return {
    sectionId: def.sectionId,
    passed: results.every((r) => r.passed),
    results,
    summary: buildSummary(def, results),
  };
}
