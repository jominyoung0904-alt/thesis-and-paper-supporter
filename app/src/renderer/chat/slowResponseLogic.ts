/**
 * Pure timing logic for the "response is taking a while" banner shown above
 * `MessageInput` when a chat/research turn (`isBusy` = `sending ||
 * research.active`, see `chatUiLogic.ts`) stays busy for a long stretch.
 *
 * Follow-up to the field debugger's investigation into an intermittent
 * chat/research stall (root cause not conclusively identified in that
 * report) — this does not fix the underlying cause, it only surfaces a
 * plausible explanation (free-tier LLM rate limiting) so the user doesn't
 * assume the app has hung.
 *
 * Framework-free like `chatUiLogic.ts` so the threshold and message text can
 * be unit tested without a DOM. `ChatScreen.tsx` wires this into a
 * `useEffect` + `setTimeout` pair that flips a boolean after
 * `SLOW_RESPONSE_DELAY_MS` of continuous busy time, clearing it the instant
 * busy ends.
 */

/** How long `isBusy` must stay true before the slow-response banner appears. Exported for tests. */
export const SLOW_RESPONSE_DELAY_MS = 30_000;

/** Banner copy — shared by `ChatScreen.tsx` and its tests so they never drift. */
export const SLOW_RESPONSE_MESSAGE =
  '응답이 평소보다 오래 걸리고 있어요. 무료 등급 속도 제한 때문일 수 있어요 — 그대로 기다리시면 순서대로 처리돼요. (급하시면 앱을 껐다 켜면 초기화돼요)';

/**
 * Whether the slow-response banner should be visible given how long the
 * current busy stretch has lasted. `busyElapsedMs` is `null` whenever the
 * screen isn't busy at all — the banner never shows while idle.
 */
export function shouldShowSlowResponseBanner(busyElapsedMs: number | null): boolean {
  return busyElapsedMs !== null && busyElapsedMs >= SLOW_RESPONSE_DELAY_MS;
}
