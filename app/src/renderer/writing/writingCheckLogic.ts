/**
 * Pure view-logic helpers for `WritingCheckScreen` (Task: TSA review-fix
 * HIGH#1, SPEC-TSA-001 FR-WRT-001/002). Deliberately framework-free so it
 * can be unit tested without a DOM environment (same pattern as
 * `./gateViewLogic.ts` and `../settings/wizard/wizardLogic.ts`).
 */

/**
 * Whether the "검사하기" action can currently run: there is non-whitespace
 * text to check and no check is already in flight. `QualityGateView` itself
 * only disables its button based on `checking` (it has no knowledge of the
 * textarea contents), so the caller must also gate on `hasText` before
 * invoking the IPC call.
 */
export function canRunQualityCheck(text: string, checking: boolean): boolean {
  return !checking && text.trim().length > 0;
}

/** Extracts a Korean-language error message from an unknown thrown value. */
export function toDisplayErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : '검사 중 문제가 생겼어요. 다시 시도해 주세요.';
}
