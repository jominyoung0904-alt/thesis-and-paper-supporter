/**
 * Pure logic for `ChatHistoryPanel` (T54, SPEC-TSA-002 FR-CHM-002~004).
 *
 * Framework-free (no React) so it is unit-testable without a DOM, following
 * the same split used by `chatUiLogic.ts` / `projectSwitcherHelpers.ts`.
 * `ChatHistoryPanel.tsx` wires these into rendering; it never reimplements
 * date formatting or ordering itself.
 */
import type {
  ChatHistoryLoadFailureReason,
  ChatHistoryRemoveFailureReason,
  IpcChatMessage,
  IpcChatSessionSummary,
} from '../../shared/ipc/chatHistory';
import type { ChatMessage } from './chatTypes';

/**
 * Converts a loaded session's transcript into renderer bubbles.
 * `IpcChatMessage` has no stable id (only `role`/`content`/`at`) — this
 * derives one from the session id + index, which is fine because a loaded
 * transcript is always rendered wholesale (never patched entry-by-entry).
 */
export function mapIpcMessagesToChatMessages(sessionId: string, messages: readonly IpcChatMessage[]): ChatMessage[] {
  return messages.map((message, index) => {
    const parsed = Date.parse(message.at);
    return {
      id: `${sessionId}-${index}`,
      role: message.role,
      text: message.content,
      createdAt: Number.isNaN(parsed) ? 0 : parsed,
    };
  });
}

/** Korean, locale-formatted date for a session's `updatedAt` (falls back to the raw string if unparseable). */
export function formatSessionUpdatedAt(updatedAt: string): string {
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) return updatedAt;
  return parsed.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Subtitle line shown under a session's title: date + message count. */
export function buildSessionSubtitle(session: Pick<IpcChatSessionSummary, 'updatedAt' | 'messageCount'>): string {
  return `${formatSessionUpdatedAt(session.updatedAt)} · 메시지 ${session.messageCount}개`;
}

/**
 * Defensive descending sort by `updatedAt` — the backend already returns
 * most-recently-updated first (FR-CHM-002), but the panel does not assume
 * that ordering is preserved through every future backend change.
 */
export function sortSessionsByRecency(sessions: readonly IpcChatSessionSummary[]): IpcChatSessionSummary[] {
  return [...sessions].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

/** Confirm-dialog copy for deleting a saved session (FR-CHM-004). */
export function buildRemoveSessionConfirmMessage(title: string): string {
  return `'${title}' 대화를 삭제할까요?\n삭제하면 되돌릴 수 없어요.`;
}

const LOAD_FAILURE_MESSAGES: Record<ChatHistoryLoadFailureReason, string> = {
  not_found: '대화를 찾을 수 없어요. 목록을 새로고침했어요.',
};

/** Translates a `chat-history:load` failure reason into user-facing Korean copy. */
export function resolveLoadFailureMessage(reason: ChatHistoryLoadFailureReason): string {
  return LOAD_FAILURE_MESSAGES[reason] ?? '대화를 불러오지 못했어요. 다시 시도해 주세요.';
}

const REMOVE_FAILURE_MESSAGES: Record<ChatHistoryRemoveFailureReason, string> = {
  not_found: '이미 삭제된 대화예요. 목록을 새로고침했어요.',
};

/** Translates a `chat-history:remove` failure reason into user-facing Korean copy. */
export function resolveRemoveFailureMessage(reason: ChatHistoryRemoveFailureReason): string {
  return REMOVE_FAILURE_MESSAGES[reason] ?? '삭제하지 못했어요. 다시 시도해 주세요.';
}
