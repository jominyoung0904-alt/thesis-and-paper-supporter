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
