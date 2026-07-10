/**
 * Pure view-logic helpers for `MockReviewView` / `MockReviewHistoryPanel`
 * (T59, SPEC-TSA-002, FR-WRT-011). Deliberately framework-free so they can be
 * unit tested without a DOM environment — same pattern as
 * `./polishViewLogic.ts` / `./gateViewLogic.ts`.
 */

/**
 * Whether the "모의 심사 받기" action can currently run: there is
 * non-whitespace manuscript text and no run is already in flight.
 */
export function canRunMockReview(text: string, running: boolean): boolean {
  return !running && text.trim().length > 0;
}

/** Extracts a Korean-language error message from an unknown thrown value (IPC/network failure). */
export function toDisplayErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : '모의 심사 중 문제가 생겼어요. 다시 시도해 주세요.';
}

/** Korean label for a weakness severity badge. */
export function severityLabel(severity: 'minor' | 'major'): string {
  return severity === 'major' ? '중대' : '경미';
}

/** Same "medium-full" Korean locale date formatting used by `GateHistoryScreen`. */
export function formatRanAt(ranAt: string): string {
  const parsed = new Date(ranAt);
  if (Number.isNaN(parsed.getTime())) return ranAt;
  return parsed.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}
