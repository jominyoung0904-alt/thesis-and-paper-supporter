/**
 * Serializes a ProjectMemory snapshot into LLM-ready prompt text (FR-MEM-003).
 *
 * The output is deterministic given the same snapshot: every collection is
 * sorted by its own timestamp field then by id (plain string comparison, not
 * locale-aware, to stay stable across environments/ICU settings), and
 * timestamps are rendered as fixed YYYY-MM-DD labels sliced directly out of
 * the ISO 8601 source. That keeps the serialized text byte-identical across
 * repeated calls on the same snapshot, which is what makes it usable as a
 * stable prompt-cache prefix (FR-MEM-005).
 */

import type {
  AdvisorFeedback,
  Hypothesis,
  ProjectMemory,
  ResearchDecision,
  ResearchQuestion,
  TermDefinition,
} from './model';

export interface SerializeOptions {
  /** Max number of research decisions to include, most recent first. Default 10. */
  maxDecisions?: number;
  /** Max number of pending advisor feedback items to include. Default 5. */
  maxFeedback?: number;
}

export interface SerializedMemory {
  /** Fixed-order, deterministic Korean prompt text built from the snapshot. */
  text: string;
  /** True when no collection contributed any content beyond the overview section. */
  isEmpty: boolean;
  /** Rough token estimate (character-count heuristic), useful for context budgeting. */
  approxTokens: number;
}

const DEFAULT_MAX_DECISIONS = 10;
const DEFAULT_MAX_FEEDBACK = 5;

/** Approximate characters-per-token used for the token heuristic (mixed ko/en text). */
const APPROX_CHARS_PER_TOKEN = 2.5;

/**
 * Fixed Korean system preamble. This string never changes based on memory
 * content — it is the stable cache-prefix anchor described by FR-MEM-005.
 */
const SYSTEM_PREAMBLE =
  '너는 논문 작성 서포터의 연구 보조 AI다. 아래 프로젝트 메모리를 참고하여 사용자의 논문 작성을 돕는다. ' +
  '메모리에 없는 내용은 추측하지 말고, 필요하면 사용자에게 확인을 요청한다.';

/** Plain (non-locale) string comparison, used for deterministic ordering of ISO strings and ids. */
function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Slices the fixed YYYY-MM-DD prefix out of an ISO 8601 timestamp string. */
function toDateLabel(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}

/** Sorts a collection ascending by its own timestamp field, then by id, for stable ordering. */
function sortByTimeThenId<T>(items: readonly T[], timeOf: (item: T) => string, idOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const timeCompare = compareStrings(timeOf(a), timeOf(b));
    if (timeCompare !== 0) return timeCompare;
    return compareStrings(idOf(a), idOf(b));
  });
}

function buildOverviewSection(memory: Readonly<ProjectMemory>): string {
  return `## 프로젝트 개요\n제목: ${memory.project.title}`;
}

function buildQuestionsSection(questions: readonly ResearchQuestion[]): string | undefined {
  if (questions.length === 0) return undefined;
  const sorted = sortByTimeThenId(
    questions,
    (q) => q.createdAt,
    (q) => q.id,
  );
  const lines = sorted.map((q) => `- ${q.text}${q.status === 'archived' ? ' [보류]' : ''}`);
  return `## 연구 질문\n${lines.join('\n')}`;
}

function buildHypothesesSection(
  hypotheses: readonly Hypothesis[],
  questions: readonly ResearchQuestion[],
): string | undefined {
  if (hypotheses.length === 0) return undefined;
  const questionTextById = new Map(questions.map((q) => [q.id, q.text]));
  const sorted = sortByTimeThenId(
    hypotheses,
    (h) => h.createdAt,
    (h) => h.id,
  );
  const lines = sorted.map((h) => {
    const relatedText = h.relatedQuestionId ? questionTextById.get(h.relatedQuestionId) : undefined;
    return `- ${h.text}${relatedText ? ` (관련 연구 질문: ${relatedText})` : ''}`;
  });
  return `## 가설\n${lines.join('\n')}`;
}

function buildTermsSection(terms: readonly TermDefinition[]): string | undefined {
  if (terms.length === 0) return undefined;
  const sorted = sortByTimeThenId(
    terms,
    (t) => t.createdAt,
    (t) => t.id,
  );
  const lines = sorted.map((t) => `- ${t.term}: ${t.definition}${t.source ? ` (출처: ${t.source})` : ''}`);
  return `## 용어 정의\n${lines.join('\n')}`;
}

function buildDecisionsSection(decisions: readonly ResearchDecision[], maxDecisions: number): string | undefined {
  if (decisions.length === 0 || maxDecisions <= 0) return undefined;
  const ascending = sortByTimeThenId(
    decisions,
    (d) => d.decidedAt,
    (d) => d.id,
  );
  const mostRecentFirst = [...ascending].reverse().slice(0, maxDecisions);
  if (mostRecentFirst.length === 0) return undefined;
  const lines = mostRecentFirst.map((d) => `- [${toDateLabel(d.decidedAt)}] 무엇: ${d.what} / 왜: ${d.why}`);
  return `## 최근 연구 결정\n${lines.join('\n')}`;
}

function buildFeedbackSection(feedback: readonly AdvisorFeedback[], maxFeedback: number): string | undefined {
  const pending = feedback.filter((f) => f.status === 'pending');
  if (pending.length === 0 || maxFeedback <= 0) return undefined;
  const sorted = sortByTimeThenId(
    pending,
    (f) => f.receivedAt,
    (f) => f.id,
  ).slice(0, maxFeedback);
  if (sorted.length === 0) return undefined;
  const lines = sorted.map((f) => `- [${toDateLabel(f.receivedAt)}] ${f.content}`);
  return `## 지도교수 피드백 미대응 항목\n${lines.join('\n')}`;
}

/**
 * Serializes a memory snapshot into a fixed-order, deterministic prompt text
 * (FR-MEM-003). Sections are emitted in a stable order and empty sections are
 * omitted entirely. Same snapshot + same options always yields byte-identical
 * text, which is required for prompt-caching (FR-MEM-005).
 */
export function serializeMemoryForPrompt(
  memory: Readonly<ProjectMemory>,
  options: SerializeOptions = {},
): SerializedMemory {
  const maxDecisions = options.maxDecisions ?? DEFAULT_MAX_DECISIONS;
  const maxFeedback = options.maxFeedback ?? DEFAULT_MAX_FEEDBACK;

  const contentSections = [
    buildQuestionsSection(memory.researchQuestions),
    buildHypothesesSection(memory.hypotheses, memory.researchQuestions),
    buildTermsSection(memory.termDefinitions),
    buildDecisionsSection(memory.decisions, maxDecisions),
    buildFeedbackSection(memory.advisorFeedback, maxFeedback),
  ].filter((section): section is string => section !== undefined);

  const sections = [buildOverviewSection(memory), ...contentSections];
  const text = sections.join('\n\n');

  return {
    text,
    isEmpty: contentSections.length === 0,
    approxTokens: Math.ceil(text.length / APPROX_CHARS_PER_TOKEN),
  };
}

/**
 * Builds the final system prompt for an LLM call: fixed Korean preamble
 * (stable cache prefix) + serialized memory context + task-specific
 * instruction, in that order.
 */
export function buildSystemPrompt(serialized: SerializedMemory, taskInstruction: string): string {
  return [SYSTEM_PREAMBLE, serialized.text, `## 작업 지시\n${taskInstruction.trim()}`].join('\n\n');
}
