/**
 * Pure view-logic helpers for `PolishView` (T59, SPEC-TSA-002, FR-WRT-010).
 * Deliberately framework-free so it can be unit tested without a DOM
 * environment — same pattern as `./writingCheckLogic.ts` / `./gateViewLogic.ts`.
 */

/**
 * Whether the "다듬기" action can currently run: there is non-whitespace text
 * to polish and no run is already in flight.
 */
export function canRunPolish(text: string, running: boolean): boolean {
  return !running && text.trim().length > 0;
}

/** Extracts a Korean-language error message from an unknown thrown value (IPC/network failure). */
export function toDisplayErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : '문장을 다듬는 중 문제가 생겼어요. 다시 시도해 주세요.';
}
