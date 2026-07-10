/**
 * Pure scroll-intent resolution for the chat screen (실사용 피드백 #3/#4).
 * Split out of `chatUiLogic.ts` (file-size-limit) — `chatUiLogic.ts`'s
 * `chatReducer` is the only caller, stamping the resulting `ScrollSignal`
 * onto `ChatState.scrollSignal` after every action.
 *
 * `scrollSignal` is the single source of truth for where `ChatScreen.tsx`'s
 * auto-scroll effect should point after each action — it replaced an effect
 * that depended directly on derived values (`messages.length`,
 * `research.active`, `research.result`, `research.errorMessage`). That
 * derived-value approach had two problems: (1) it always scrolled to the
 * bottom, even when a long research report had just finished (the reader
 * should land at the TOP of that block instead — 실사용 피드백 #3), and (2) —
 * the likely cause of 실사용 피드백 #4's "핸드오프 대화에서 메시지 전송 시 화면이
 * 위로 튐" report — comparing scalar/derived values across renders is
 * fragile: two different actions can leave every one of those tracked
 * fields at values that are individually unchanged or coincidentally equal
 * to a prior render (e.g. a wholesale message-array replacement like
 * `LOAD_HISTORY_SESSION` followed shortly after by a
 * `SEND_CHAT_START`/`SUCCESS` pair, where the browser's native scroll
 * anchoring can also fight an in-flight `smooth` scroll targeting a moving
 * DOM position), silently skipping the intended re-scroll or scrolling to a
 * stale target. `scrollSignal` fixes this class of bug structurally: the
 * reducer decides the scroll *intent* directly from the action type via
 * `resolveScrollIntent` (pure, unit-tested below) and stamps a
 * monotonically increasing `seq` on every scroll-worthy action, so the
 * effect's dependency (the whole `scrollSignal` object, a fresh reference
 * every time `seq` increments) always re-fires exactly once per intended
 * scroll — never skipped by incidental equality of unrelated derived
 * values.
 */

/**
 * 실사용 피드백 #4 재발 — why commit 251eec1 (the `scrollSignal` rewrite)
 * did NOT fix the "핸드오프 대화에서 전송 시 화면이 맨 위로 튐" report:
 *
 * That fix only corrected the scroll *intent* (making `LOAD_HISTORY_SESSION`
 * and every post-handoff `SEND_CHAT_*` resolve to `'bottom'`) and proved it
 * with pure `resolveScrollIntent` tests. But the intent was never wrong —
 * the handoff→send path already resolved to `'bottom'`. The regression lives
 * one layer down, in how that intent is *executed*: `ChatScreen.tsx` scrolled
 * by calling `scrollAnchorRef.current.scrollIntoView({ block: 'end' })` on the
 * **zero-height** `.chat-scroll-anchor` (`chat.css`: `height: 0`) inside a
 * post-paint `useEffect`. Three things make that unreliable *specifically*
 * after a handoff:
 *   1. `LOAD_HISTORY_SESSION` replaces the ENTIRE message array (every React
 *      key changes), so the browser tears down and rebuilds `.chat-scroll-area`'s
 *      children. Native scroll anchoring loses its anchor and the container's
 *      `scrollTop` is left at 0 (the top).
 *   2. `Element.scrollIntoView` on a zero-height box is a no-op when the box
 *      is already considered "in view", so it never pulls `scrollTop` back
 *      down — the view stays pinned at the top the rebuild left it at.
 *   3. Running in `useEffect` (after paint) means step 1's reset and step 2's
 *      no-op race each other frame-to-frame.
 * `resolveScrollIntent`'s pure tests can't see any of this — they only assert
 * the string `'bottom'`, which was always correct. So the fix passed CI and
 * failed in the field.
 *
 * The real fix (this module's `resolveScrollTop` + `ChatScreen.tsx`'s
 * `useLayoutEffect`): compute an explicit target `scrollTop` from the scroll
 * container's own metrics and set it directly with `scrollArea.scrollTo`,
 * pre-paint. A numeric target can't no-op, can't be undone by native
 * anchoring, and never walks up to scroll unrelated ancestors — so a
 * handed-off conversation follows its own turns to the bottom deterministically.
 */

/** Where the chat screen's auto-scroll effect should point after a given action. */
export type ScrollIntent = 'bottom' | 'research-top' | 'none';

export interface ScrollSignal {
  intent: ScrollIntent;
  /**
   * Monotonically increasing — guarantees `ChatScreen.tsx`'s auto-scroll
   * effect re-fires even when two consecutive scroll-worthy actions resolve
   * to the same `intent` value (e.g. two ordinary chat replies in a row),
   * instead of relying on derived-value comparisons that can coincidentally
   * match across renders. See this module's doc comment for the full
   * rationale.
   */
  seq: number;
}

/**
 * Maps a chat action's type to where the screen should auto-scroll
 * afterward (실사용 피드백 #3/#4). `research-top` is the one exception to
 * "always scroll to the bottom": a finished deep-research report can be
 * long, so the reader should land at the TOP of that block instead of the
 * bottom of the whole scroll area. Every other message-adding action —
 * including a handed-off conversation's own follow-up turns — scrolls to
 * the bottom, same as an ordinary chat reply. Progress ticks, decision-card
 * actions, and `NEW_CHAT_SESSION` (an empty transcript has nothing to
 * scroll to) never scroll.
 *
 * Takes a plain `string` (not `ChatAction['type']`) so this module never
 * needs to import from `chatUiLogic.ts`, avoiding a circular dependency
 * between the two files — the `default: 'none'` branch safely absorbs any
 * action type this function doesn't recognize.
 */
export function resolveScrollIntent(actionType: string): ScrollIntent {
  switch (actionType) {
    case 'SEND_CHAT_START':
    case 'SEND_CHAT_SUCCESS':
    case 'SEND_CHAT_FAILURE':
    case 'RESEARCH_START':
    case 'RESEARCH_FAILURE':
    case 'ADD_SUMMARY_MESSAGE':
    case 'LOAD_HISTORY_SESSION':
      return 'bottom';
    case 'RESEARCH_SUCCESS':
      return 'research-top';
    // NEW_CHAT_SESSION resets to an empty transcript — nothing to scroll
    // to, and `chatReducerCore` already returns `createInitialChatState()`
    // verbatim for it, which existing tests rely on staying byte-for-byte
    // equal to a fresh initial state.
    case 'NEW_CHAT_SESSION':
    default:
      return 'none';
  }
}

/**
 * Scroll-container metrics `ChatScreen.tsx`'s layout effect reads off
 * `.chat-scroll-area` (and the research panel) to turn a `ScrollIntent` into
 * an explicit target `scrollTop`. Kept as a plain data object so
 * `resolveScrollTop` stays pure and unit-testable without a DOM.
 */
export interface ScrollMetrics {
  /**
   * `scrollHeight - clientHeight` of `.chat-scroll-area` — the maximum
   * `scrollTop` (i.e. the position that pins the container to its bottom).
   */
  maxScrollTop: number;
  /**
   * Absolute `scrollTop` at which the research result panel's top edge sits
   * flush with the scrollport's top — computed by the effect as
   * `area.scrollTop + (panelRect.top - areaRect.top)`. Only consulted for the
   * `'research-top'` intent.
   */
  researchTopOffset: number;
}

/**
 * Turns a resolved `ScrollIntent` into the exact `scrollTop` the container
 * should be set to (or `null` for `'none'` — leave the scroll position
 * untouched). Replaces the old `Element.scrollIntoView` approach, whose
 * zero-height-anchor no-ops and native-scroll-anchoring races are what let
 * 실사용 피드백 #4 regress after the intent-only fix (see this module's top
 * doc comment).
 *
 * - `'bottom'` → always `maxScrollTop`: follow the conversation to its end,
 *   deterministically, regardless of how much the transcript just grew or was
 *   wholesale-replaced by a handoff.
 * - `'research-top'` → the panel's top offset, clamped to `[0, maxScrollTop]`
 *   so a short report that already fits never over-scrolls (실사용 피드백 #3
 *   preserved: land at the START of a long report).
 */
export function resolveScrollTop(intent: ScrollIntent, metrics: ScrollMetrics): number | null {
  if (intent === 'none') {
    return null;
  }
  const max = Math.max(0, metrics.maxScrollTop);
  if (intent === 'research-top') {
    return Math.max(0, Math.min(metrics.researchTopOffset, max));
  }
  return max;
}
