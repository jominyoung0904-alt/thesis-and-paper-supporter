/**
 * Pure view-logic helpers for `ResearchHistoryScreen` (Task T49 / SPEC-TSA-002,
 * FR-RSH-002). Deliberately framework-free — no React, no DOM — so it stays
 * unit-testable without a DOM environment, matching the pattern in
 * `../writing/gateViewLogic.ts` / `../writing/writingCheckLogic.ts`.
 *
 * `toResearchRunState` adapts a saved `ResearchHistoryRecord` into the
 * `ResearchRunState` shape `ResearchProgress` (chat/ResearchProgress.tsx)
 * already knows how to render, so the detail view reuses that component
 * as-is (report markdown + citation jump links + reference lists) instead
 * of re-implementing report rendering here. `papers` (every screened
 * paper, high/medium/low) isn't part of a saved record — `ResearchProgress`
 * never actually reads that field when rendering a finished result, so an
 * empty array is a safe stand-in.
 */

import type { ResearchRunState } from '../chat/chatUiLogic';
import type { ResearchHistoryRecord, ResearchHistorySummary } from '../../shared/ipc/researchHistory';

/** Formats an ISO timestamp for Korean, non-technical readers. Falls back to the raw string if unparsable. */
export function formatRanAt(ranAt: string): string {
  const parsed = new Date(ranAt);
  if (Number.isNaN(parsed.getTime())) return ranAt;
  return parsed.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}

/** One-line Korean summary of how many papers a research run cited. */
export function summarizeCitedCount(citedCount: number): string {
  return citedCount > 0 ? `인용 문헌 ${citedCount}건` : '인용 문헌 없음';
}

/**
 * Defensive most-recent-first sort. `ResearchHistoryStore.listSummaries()`
 * already returns records in this order server-side, but sorting again here
 * keeps the screen correct even if a future caller feeds in unsorted data,
 * and keeps this behavior independently testable.
 */
export function sortSummariesByRecency(records: ResearchHistorySummary[]): ResearchHistorySummary[] {
  return [...records].sort((a, b) => b.ranAt.localeCompare(a.ranAt));
}

/** Extracts a user-facing Korean error message, with a safe fallback for non-Error throws. */
export function toDisplayErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : '기록을 불러오지 못했어요. 다시 시도해 주세요.';
}

/** Adapts a saved research record into the shape `ResearchProgress` renders. */
export function toResearchRunState(record: ResearchHistoryRecord): ResearchRunState {
  return {
    active: false,
    stage: null,
    detail: null,
    errorMessage: null,
    result: {
      report: record.report,
      papers: [],
      citedPapers: record.citedPapers,
      relatedPapers: record.relatedPapers,
      failedSources: record.failedSources,
    },
  };
}
