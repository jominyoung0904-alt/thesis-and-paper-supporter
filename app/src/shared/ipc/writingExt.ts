/**
 * `writing:polish` / `writing:mock-review` /
 * `writing:mock-review-history:list|get|remove` IPC channel names +
 * request/result shapes (FR-WRT-009/010/011).
 *
 * Kept as its own file, self-contained (`WritingExtChannels`) — not appended
 * to `channels.ts` / `gate.ts` / `gateHistory.ts` — because
 * `main/ipc/writingExtHandlers.ts` imports the channel constant directly from
 * here rather than through the central `shared/ipc/index.ts` barrel. That
 * keeps this domain's handler module compilable in isolation before the
 * central wiring (channels.ts, index.ts, handlers.ts, preload.ts,
 * thesisApi.ts) is updated by the integration pass; see this task's "배선
 * 명세" report for the exact snippets that fold this into the central files.
 * Mirrors the same split used by `shared/ipc/gateHistory.ts` (T56) /
 * `shared/ipc/researchHistory.ts` (T48, SPEC-TSA-002).
 *
 * Mirrors (rather than imports) `core/writing/polish.ts`'s
 * `PolishChange`/`PolishResult` and `core/writing/mockReview.ts`'s
 * `MockReviewQuestion`/`MockReviewWeakness`/`MockReviewOutcome` — same
 * shared/core decoupling pattern used across this codebase (see
 * `shared/ipc/gate.ts`'s doc comment). `MockReviewHistory*` shapes similarly
 * mirror `core/writing/mockReviewStore.ts`'s
 * `MockReviewRecord`/`MockReviewRecordSummary`.
 */

export const WritingExtChannels = {
  /** Runs the academic sentence-polishing engine against user-supplied text (FR-WRT-010). */
  WRITING_POLISH: 'writing:polish',
  /** Runs the single-model "Reviewer 2" mock peer review against user-supplied text (FR-WRT-011). */
  WRITING_MOCK_REVIEW: 'writing:mock-review',
  /** Lists every saved mock-review record (summary view) for the active project. */
  MOCK_REVIEW_HISTORY_LIST: 'writing:mock-review-history:list',
  /** Loads a single full mock-review record (checked text + full outcome) by id. */
  MOCK_REVIEW_HISTORY_GET: 'writing:mock-review-history:get',
  /** Deletes a single mock-review record by id. */
  MOCK_REVIEW_HISTORY_REMOVE: 'writing:mock-review-history:remove',
} as const;

export type WritingExtChannelName = (typeof WritingExtChannels)[keyof typeof WritingExtChannels];

// --- writing:polish ---

export interface WritingPolishRequest {
  text: string;
}

/** One tracked edit within the polished text. `reason` is always Korean, user-facing. */
export interface WritingPolishChange {
  before: string;
  after: string;
  reason: string;
}

export interface WritingPolishSuccess {
  ok: true;
  polishedText: string;
  changes: WritingPolishChange[];
  language: 'ko' | 'en';
}

/** Fail-closed: never a silent fallback to the original text relabeled as "polished". */
export interface WritingPolishFailure {
  ok: false;
  reason: string;
}

export type WritingPolishResult = WritingPolishSuccess | WritingPolishFailure;

// --- writing:mock-review ---

export interface WritingMockReviewRequest {
  text: string;
}

/** One anticipated committee/reviewer question, with the reasoning behind it. */
export interface WritingMockReviewQuestion {
  question: string;
  basis: string;
}

/** One flagged weakness in the manuscript. */
export interface WritingMockReviewWeakness {
  weakness: string;
  severity: 'minor' | 'major';
  suggestion: string;
}

export interface WritingMockReviewSuccess {
  ok: true;
  questions: WritingMockReviewQuestion[];
  weaknesses: WritingMockReviewWeakness[];
  overallComment: string;
}

/** Fail-closed: never a silent fallback to an empty/partial review. */
export interface WritingMockReviewFailure {
  ok: false;
  reason: string;
}

export type WritingMockReviewResult = WritingMockReviewSuccess | WritingMockReviewFailure;

// --- writing:mock-review-history:list ---

/** Lightweight list-view projection of a saved mock-review record. */
export interface MockReviewHistorySummary {
  id: string;
  ranAt: string;
  /** Mirrors `result.ok` — false when the LLM response could not be parsed (fail-closed run). */
  ok: boolean;
  /** First ~60 characters of the reviewed text. */
  textPreview: string;
}

export interface MockReviewHistoryListResult {
  records: MockReviewHistorySummary[];
}

// --- writing:mock-review-history:get ---

export interface MockReviewHistoryGetRequest {
  id: string;
}

/** Full saved mock-review record: the exact manuscript text checked, plus its full outcome. */
export interface MockReviewHistoryRecord {
  id: string;
  ranAt: string;
  text: string;
  result: WritingMockReviewResult;
}

/** `null` when the id is unknown or the stored record is corrupted. */
export type MockReviewHistoryGetResult = MockReviewHistoryRecord | null;

// --- writing:mock-review-history:remove ---

export interface MockReviewHistoryRemoveRequest {
  id: string;
}

export interface MockReviewHistoryRemoveResult {
  ok: boolean;
}
