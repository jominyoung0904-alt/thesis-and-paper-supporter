/**
 * `research-history:*` IPC channel names + request/result shapes
 * (FR-RSH-001/002).
 *
 * Kept as its own file — not appended to `channels.ts` / `research.ts` —
 * because `main/ipc/researchHistoryHandlers.ts` imports the channel
 * constant directly from here rather than through the central
 * `shared/ipc/index.ts` barrel. That keeps this domain's handler module
 * compilable in isolation before the central wiring (channels.ts, index.ts,
 * handlers.ts, preload.ts) is updated by the integration pass; see the T48
 * task's "배선 명세" report for the exact snippets that fold this into the
 * central files.
 *
 * Mirrors (rather than imports) `core/research-history/model.ts`'s
 * `ResearchRecord`/`ResearchRecordSummary` — the same shared/core
 * decoupling pattern used across this codebase (see `shared/ipc/project.ts`'s
 * doc comment). Paper/failed-source shapes reuse the existing
 * `ResearchPaperPayload`/`ResearchFailedSourcePayload` from `research.ts`
 * (already the renderer-facing projection of `ScreenedPaper`/`FailedSource`).
 */

import type { ResearchFailedSourcePayload, ResearchPaperPayload } from './research';

export const ResearchHistoryChannels = {
  /** Lists every saved research record (summary view) for the active project. */
  RESEARCH_HISTORY_LIST: 'research-history:list',
  /** Loads a single full research record by id. */
  RESEARCH_HISTORY_GET: 'research-history:get',
  /** Deletes a single research record by id. */
  RESEARCH_HISTORY_REMOVE: 'research-history:remove',
} as const;

export type ResearchHistoryChannelName = (typeof ResearchHistoryChannels)[keyof typeof ResearchHistoryChannels];

// --- research-history:list ---

/** Lightweight list-view projection of a saved research record. */
export interface ResearchHistorySummary {
  id: string;
  question: string;
  ranAt: string;
  citedCount: number;
}

export interface ResearchHistoryListResult {
  records: ResearchHistorySummary[];
}

// --- research-history:get ---

export interface ResearchHistoryGetRequest {
  id: string;
}

/** Full saved research record, mapped to renderer-facing paper/failed-source payloads. */
export interface ResearchHistoryRecord {
  id: string;
  question: string;
  ranAt: string;
  report: string;
  citedPapers: ResearchPaperPayload[];
  relatedPapers: ResearchPaperPayload[];
  failedSources: ResearchFailedSourcePayload[];
}

/** `null` when the id is unknown or the stored record is corrupted. */
export type ResearchHistoryGetResult = ResearchHistoryRecord | null;

// --- research-history:remove ---

export interface ResearchHistoryRemoveRequest {
  id: string;
}

export interface ResearchHistoryRemoveResult {
  ok: boolean;
}
