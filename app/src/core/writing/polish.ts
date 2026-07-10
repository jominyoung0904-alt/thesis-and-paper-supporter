/**
 * Academic sentence-polishing core (FR-WRT-010, T20 continuation).
 *
 * `runPolish` sends a paragraph to the LLM for academic-style polishing —
 * language (Korean/English) is LLM-detected, not caller-specified — and
 * returns the polished text together with a per-edit change log. The
 * LLM-call / JSON-parse / defensive-parsing shape mirrors qualityGate.ts as
 * closely as possible, but the outcome is a single fail-closed `ok`
 * discriminated union (matching the codebase-wide `{ ok: true; ... } |
 * { ok: false; reason }` convention, e.g. src/core/project/projectStore.ts)
 * rather than qualityGate's per-criterion fallback: polishing produces one
 * coherent text, so there is no meaningful "partially polished" result to
 * hand back when the LLM response cannot be parsed — the caller must never
 * receive the original text silently relabeled as "polished".
 */

import type { LlmAdapter } from '../llm/types';
import type { SerializedMemory } from '../memory/serializer';
import { buildSystemPrompt } from '../memory/serializer';

/** One tracked edit within the polished text. `reason` is always Korean, user-facing. */
export interface PolishChange {
  before: string;
  after: string;
  reason: string;
}

/** Successful polish outcome. */
export interface PolishSuccess {
  ok: true;
  polishedText: string;
  changes: PolishChange[];
  language: 'ko' | 'en';
}

/** Failure outcome — fail-closed: never falls back to returning the original text as "polished". */
export interface PolishFailure {
  ok: false;
  reason: string;
}

export type PolishResult = PolishSuccess | PolishFailure;

/** Dependencies injected into `runPolish` (same shape as QualityGateDeps for consistency). */
export interface PolishDeps {
  llm: LlmAdapter;
  model: string;
  memory?: SerializedMemory;
}

/** Shown when both attempts to obtain a usable response fail. */
const FALLBACK_REASON = '자동 문장 다듬기에 실패했어요. 다시 시도해 주세요';

const POLISH_TASK =
  '너는 대학원 논문 문장을 다듬는 학술 문체 교정 전문가다. 입력된 문단의 언어(국문/영문)를 스스로 판별하고, ' +
  '원문의 의미를 절대 바꾸지 않는 범위에서 학술적 문체로 다듬는다. 국문이면 구어체 표현을 제거하고 ' +
  '주어-서술어 호응을 바로잡으며 어색한 번역투를 완화한다. 영문이면 관사, 시제, 헤징(hedging) 표현을 학술 ' +
  '논문 관례에 맞게 다듬는다. 변경이 필요 없으면 changes를 빈 배열로 둔다. 변경 사항마다 사유를 한국어로 ' +
  '한 문장씩 작성한다. 응답은 지정된 JSON 형식으로만 출력하고, JSON 앞뒤에 다른 텍스트나 코드펜스를 붙이지 않는다.';

/** Builds the user-turn prompt: the paragraph to polish plus the required JSON response shape. */
function buildPolishPrompt(text: string): string {
  return [
    '## 다듬을 문단',
    text,
    '## 응답 형식',
    '아래 JSON 형식으로만 응답하라. JSON 앞뒤에 다른 텍스트나 코드펜스를 붙이지 않는다.',
    '{"polishedText":"...","changes":[{"before":"...","after":"...","reason":"..."}],"language":"ko"}',
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

interface ParsedPolishResponse {
  polishedText: string;
  changes: PolishChange[];
  language: 'ko' | 'en';
}

/** Structural check for one `changes[]` entry. */
function isPolishChange(value: unknown): value is PolishChange {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return typeof c.before === 'string' && typeof c.after === 'string' && typeof c.reason === 'string';
}

/**
 * Parses and structurally validates the LLM's JSON response. Returns
 * undefined on any failure — malformed JSON, wrong field types, an
 * unrecognized `language`, or a malformed `changes[]` entry all count as a
 * failed parse (fail-closed, no partial acceptance).
 */
function parsePolishResponse(text: string): ParsedPolishResponse | undefined {
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

  if (typeof rec.polishedText !== 'string' || rec.polishedText.trim().length === 0) return undefined;
  if (rec.language !== 'ko' && rec.language !== 'en') return undefined;
  if (!Array.isArray(rec.changes)) return undefined;

  const changes: PolishChange[] = [];
  for (const item of rec.changes) {
    if (!isPolishChange(item)) return undefined;
    changes.push(item);
  }

  return { polishedText: rec.polishedText, changes, language: rec.language };
}

/** Runs one LLM call and returns a validated parse, or undefined. */
async function requestPolishOnce(text: string, deps: PolishDeps): Promise<ParsedPolishResponse | undefined> {
  const system = deps.memory ? buildSystemPrompt(deps.memory, POLISH_TASK) : POLISH_TASK;
  const userMessage = buildPolishPrompt(text);

  const response = await deps.llm.chat({
    model: deps.model,
    system,
    messages: [{ role: 'user', content: userMessage }],
  });

  return parsePolishResponse(response.text);
}

/**
 * Polishes `text` into academic Korean/English prose (FR-WRT-010). Retries
 * once on a malformed/empty response; if both attempts fail to parse, the
 * result is `{ ok: false, reason }` — never a silent fallback to the
 * original text.
 */
// @AX:ANCHOR: [AUTO] sentence-polishing entry point, fail-closed on unparseable LLM output. Related: FR-WRT-010
export async function runPolish(text: string, deps: PolishDeps): Promise<PolishResult> {
  let parsed = await requestPolishOnce(text, deps);
  if (!parsed) {
    parsed = await requestPolishOnce(text, deps);
  }

  if (!parsed) {
    return { ok: false, reason: FALLBACK_REASON };
  }

  return { ok: true, polishedText: parsed.polishedText, changes: parsed.changes, language: parsed.language };
}
