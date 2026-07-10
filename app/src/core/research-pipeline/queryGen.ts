/**
 * Query-generation step (FR-RES-001): one LLM call turns the user's question
 * into two Korean and two English search terms.
 *
 * Robustness is the whole point here: the pipeline MUST NOT die if the model
 * returns malformed JSON. We ask for structured output, retry once on a parse
 * miss, and — if that also fails — fall back to using the raw question as both
 * the Korean and English search term. Search always proceeds.
 */

import type { LlmAdapter } from '../llm';
import type { SerializedMemory } from '../memory/serializer';
import { buildSystemPrompt } from '../memory/serializer';
import type { GeneratedQueries, UsageTotals } from './types';
import { addUsage, parseJsonLoose } from './types';

/** Max terms kept per language, even if the model returns more. */
const MAX_TERMS_PER_LANG = 2;

export interface QueryGenResult {
  queries: GeneratedQueries;
  /** True when JSON parsing failed twice and the raw question was used. */
  usedFallback: boolean;
}

const TASK_INSTRUCTION =
  '사용자의 연구 질문을 학술 데이터베이스에서 검색하기 좋은 검색어로 변환하라. ' +
  '국문 검색어 2개와 영문 검색어 2개를 만들어라. 각 검색어는 핵심 개념을 담은 짧은 구절이어야 한다. ' +
  '반드시 아래 JSON 형식만 출력하고 다른 설명은 붙이지 마라.\n' +
  '{"ko": ["국문검색어1", "국문검색어2"], "en": ["english term 1", "english term 2"]}';

const RETRY_SUFFIX =
  '\n\n앞선 응답이 JSON 형식이 아니었다. 반드시 위 JSON 객체 하나만 출력하라. 코드블록이나 설명 문장을 넣지 마라.';

/**
 * Generates Korean + English search terms for `question`. Never throws; on
 * repeated parse failure it returns the raw question as the sole term in each
 * language and sets {@link QueryGenResult.usedFallback}.
 */
export async function generateQueries(
  question: string,
  memory: SerializedMemory,
  llm: LlmAdapter,
  model: string,
  usage: UsageTotals,
): Promise<QueryGenResult> {
  const system = buildSystemPrompt(memory, TASK_INSTRUCTION);

  const first = await llm.chat({ model, system, messages: [{ role: 'user', content: question }] });
  addUsage(usage, first);
  const parsedFirst = coerceQueries(parseJsonLoose(first.text));
  if (parsedFirst) {
    return { queries: parsedFirst, usedFallback: false };
  }

  const second = await llm.chat({
    model,
    system: system + RETRY_SUFFIX,
    messages: [{ role: 'user', content: question }],
  });
  addUsage(usage, second);
  const parsedSecond = coerceQueries(parseJsonLoose(second.text));
  if (parsedSecond) {
    return { queries: parsedSecond, usedFallback: false };
  }

  // Final fallback: the pipeline never dies here (FR-RES-001).
  const fallbackTerm = question.trim();
  return { queries: { ko: [fallbackTerm], en: [fallbackTerm] }, usedFallback: true };
}

/**
 * Validates a parsed JSON value into {@link GeneratedQueries}. Returns `null`
 * when the shape is unusable (missing arrays or no non-empty term in either
 * language) so the caller falls through to a retry / raw-question fallback.
 */
function coerceQueries(value: unknown): GeneratedQueries | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const ko = cleanTerms(record.ko);
  const en = cleanTerms(record.en);
  if (ko.length === 0 || en.length === 0) return null;
  return { ko, en };
}

/** Keeps non-empty string terms, trims them, and caps the count per language. */
function cleanTerms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const terms: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed.length > 0) terms.push(trimmed);
    if (terms.length >= MAX_TERMS_PER_LANG) break;
  }
  return terms;
}
