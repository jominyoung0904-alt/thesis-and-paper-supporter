/**
 * Mock peer-review core — single-model Reviewer 2 role-play (FR-WRT-011, T21 continuation).
 *
 * `runMockReview` sends the full manuscript to the LLM playing an adversarial
 * "Reviewer 2" and asks for anticipated questions, weaknesses, and an overall
 * comment. Design decision 3 (decisions-2026-07-10.md) fixes this as a
 * *single*-model role-play, not a multi-model debate — one call, one retry.
 * The LLM-call / JSON-parse / defensive-parsing shape mirrors polish.ts as
 * closely as possible, including its fail-closed `ok` discriminated union:
 * a mock review that could not be parsed must never be silently presented as
 * an empty-but-successful review.
 *
 * The review is always written in Korean regardless of manuscript language
 * (the user is a Korean graduate student) — unlike polish.ts, which mirrors
 * the input language back.
 */

import type { LlmAdapter } from '../llm/types';
import type { SerializedMemory } from '../memory/serializer';
import { buildSystemPrompt } from '../memory/serializer';

/** Minimum/maximum number of anticipated questions the reviewer must produce. */
const MIN_QUESTIONS = 3;
const MAX_QUESTIONS = 7;
/** Minimum/maximum number of weaknesses the reviewer must produce. */
const MIN_WEAKNESSES = 2;
const MAX_WEAKNESSES = 5;

/** One anticipated committee/reviewer question, with the reasoning behind it. */
export interface MockReviewQuestion {
  question: string;
  /** Why this question is likely to come up, in Korean. */
  basis: string;
}

/** One flagged weakness in the manuscript. */
export interface MockReviewWeakness {
  weakness: string;
  severity: 'minor' | 'major';
  suggestion: string;
}

/** Successful mock-review outcome. */
export interface MockReviewSuccess {
  ok: true;
  questions: MockReviewQuestion[];
  weaknesses: MockReviewWeakness[];
  /** One-paragraph overall assessment, in Korean. */
  overallComment: string;
}

/** Failure outcome — fail-closed: never falls back to an empty/partial review. */
export interface MockReviewFailure {
  ok: false;
  reason: string;
}

export type MockReviewOutcome = MockReviewSuccess | MockReviewFailure;

/** Dependencies injected into `runMockReview` (same shape as PolishDeps/QualityGateDeps for consistency). */
export interface MockReviewDeps {
  llm: LlmAdapter;
  model: string;
  memory?: SerializedMemory;
}

/** Shown when both attempts to obtain a usable response fail. */
const FALLBACK_REASON = '자동 모의 심사에 실패했어요. 다시 시도해 주세요';

const MOCK_REVIEW_TASK =
  '너는 논문 심사에서 가장 비판적인 태도로 임하는 "Reviewer 2"다. 주어진 원고 전체를 꼼꼼히 읽고, ' +
  '심사위원 또는 발표 청중이 실제로 던질 법한 예상 질문 3~7개와, 원고의 약점 2~5개를 찾아낸다. ' +
  '원고가 국문이든 영문이든 심사 결과는 항상 한국어 존댓말로 작성한다(사용자는 한국인 대학원생이다). ' +
  '각 예상 질문에는 그 질문이 왜 나올 수 있는지 근거를 한 문장으로 함께 제시한다. ' +
  '각 약점에는 심각도(minor 또는 major)와 구체적인 보완 제안을 함께 제시한다. ' +
  '마지막으로 원고 전체에 대한 총평을 한 문단으로 작성한다. 비판은 건설적이고 구체적이어야 하며, ' +
  '근거 없이 트집만 잡지 않는다. 응답은 지정된 JSON 형식으로만 출력하고, JSON 앞뒤에 다른 텍스트나 ' +
  '코드펜스를 붙이지 않는다.';

/** Builds the user-turn prompt: the manuscript plus the required JSON response shape. */
function buildMockReviewPrompt(text: string): string {
  return [
    '## 심사 대상 원고',
    text,
    '## 응답 형식',
    '아래 JSON 형식으로만 응답하라. JSON 앞뒤에 다른 텍스트나 코드펜스를 붙이지 않는다. ' +
      `questions는 ${MIN_QUESTIONS}~${MAX_QUESTIONS}개, weaknesses는 ${MIN_WEAKNESSES}~${MAX_WEAKNESSES}개 포함해야 한다.`,
    '{"questions":[{"question":"...","basis":"..."}],' +
      '"weaknesses":[{"weakness":"...","severity":"major","suggestion":"..."}],' +
      '"overallComment":"..."}',
  ].join('\n\n');
}

/** Extracts the first `{...}` JSON object substring from arbitrary text (tolerates code fences / stray prose). */
function extractJsonObject(text: string): string | undefined {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return undefined;
  return trimmed.slice(start, end + 1);
}

interface ParsedMockReviewResponse {
  questions: MockReviewQuestion[];
  weaknesses: MockReviewWeakness[];
  overallComment: string;
}

/** Structural check for one `questions[]` entry. */
function isMockReviewQuestion(value: unknown): value is MockReviewQuestion {
  if (typeof value !== 'object' || value === null) return false;
  const q = value as Record<string, unknown>;
  return typeof q.question === 'string' && q.question.trim().length > 0 && typeof q.basis === 'string';
}

/** Structural check for one `weaknesses[]` entry, including the severity enum. */
function isMockReviewWeakness(value: unknown): value is MockReviewWeakness {
  if (typeof value !== 'object' || value === null) return false;
  const w = value as Record<string, unknown>;
  return (
    typeof w.weakness === 'string' &&
    w.weakness.trim().length > 0 &&
    (w.severity === 'minor' || w.severity === 'major') &&
    typeof w.suggestion === 'string'
  );
}

/**
 * Parses and structurally validates the LLM's JSON response. Returns
 * undefined on any failure — malformed JSON, wrong field types, an
 * out-of-range question/weakness count, an invalid severity value, or a
 * malformed array entry all count as a failed parse (fail-closed, no partial
 * acceptance).
 */
function parseMockReviewResponse(text: string): ParsedMockReviewResponse | undefined {
  const candidate = extractJsonObject(text);
  if (!candidate) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const rec = parsed as Record<string, unknown>;

  if (typeof rec.overallComment !== 'string' || rec.overallComment.trim().length === 0) return undefined;
  if (!Array.isArray(rec.questions) || !Array.isArray(rec.weaknesses)) return undefined;
  if (rec.questions.length < MIN_QUESTIONS || rec.questions.length > MAX_QUESTIONS) return undefined;
  if (rec.weaknesses.length < MIN_WEAKNESSES || rec.weaknesses.length > MAX_WEAKNESSES) return undefined;

  const questions: MockReviewQuestion[] = [];
  for (const item of rec.questions) {
    if (!isMockReviewQuestion(item)) return undefined;
    questions.push(item);
  }

  const weaknesses: MockReviewWeakness[] = [];
  for (const item of rec.weaknesses) {
    if (!isMockReviewWeakness(item)) return undefined;
    weaknesses.push(item);
  }

  return { questions, weaknesses, overallComment: rec.overallComment };
}

/** Runs one LLM call and returns a validated parse, or undefined. */
async function requestMockReviewOnce(text: string, deps: MockReviewDeps): Promise<ParsedMockReviewResponse | undefined> {
  const system = deps.memory ? buildSystemPrompt(deps.memory, MOCK_REVIEW_TASK) : MOCK_REVIEW_TASK;
  const userMessage = buildMockReviewPrompt(text);

  const response = await deps.llm.chat({
    model: deps.model,
    system,
    messages: [{ role: 'user', content: userMessage }],
  });

  return parseMockReviewResponse(response.text);
}

/**
 * Runs a single-model Reviewer 2 role-play against `text` (FR-WRT-011,
 * design decision 3: single-model, not multi-model debate). Retries once on
 * a malformed/empty/out-of-range response; if both attempts fail to parse,
 * the result is `{ ok: false, reason }` — never a silent fallback to an
 * empty or partial review.
 */
// @AX:ANCHOR: [AUTO] mock-review entry point, fail-closed on unparseable LLM output. Related: FR-WRT-011
export async function runMockReview(text: string, deps: MockReviewDeps): Promise<MockReviewOutcome> {
  let parsed = await requestMockReviewOnce(text, deps);
  if (!parsed) {
    parsed = await requestMockReviewOnce(text, deps);
  }

  if (!parsed) {
    return { ok: false, reason: FALLBACK_REASON };
  }

  return { ok: true, questions: parsed.questions, weaknesses: parsed.weaknesses, overallComment: parsed.overallComment };
}
