/**
 * `chat-history:*` request/result shapes for saved idea-meeting chat session
 * management (FR-CHM-001~004): auto-saved conversations, list/load/new/remove.
 *
 * Mirrors (rather than imports) `core/chat/sessionModel.ts`'s `ChatSession` /
 * `ChatSessionSummary` and `core/chat/types.ts`'s `ChatMessage` — same
 * shared/core decoupling pattern already used by `project.ts` (see its doc
 * comment) so `shared/` never depends on `main/`/`core/` internals.
 */

export const ChatHistoryChannels = {
  /** Lists saved chat session summaries for the active project (FR-CHM-002). */
  CHAT_HISTORY_LIST: 'chat-history:list',
  /** Loads one saved session's full transcript and makes it the active session (FR-CHM-003). */
  CHAT_HISTORY_LOAD: 'chat-history:load',
  /** Clears the active session so the next `chat:send` starts a brand-new one (FR-CHM-004). */
  CHAT_HISTORY_NEW: 'chat-history:new',
  /** Deletes a saved session (FR-CHM-004). */
  CHAT_HISTORY_REMOVE: 'chat-history:remove',
} as const;

export type ChatHistoryChannelName = (typeof ChatHistoryChannels)[keyof typeof ChatHistoryChannels];

// --- shared shapes ---

export type IpcChatMessageRole = 'user' | 'assistant' | 'summary';

/** One transcript entry, suitable for UI rendering after a `chat-history:load`. */
export interface IpcChatMessage {
  role: IpcChatMessageRole;
  content: string;
  at: string;
}

/** Lightweight listing entry — excludes the full transcript (FR-CHM-002). */
export interface IpcChatSessionSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

// --- chat-history:list ---

export interface ChatHistoryListResult {
  /** Most recently updated first (FR-CHM-002). */
  sessions: IpcChatSessionSummary[];
}

// --- chat-history:load ---

export interface ChatHistoryLoadRequest {
  id: string;
}

export type ChatHistoryLoadFailureReason = 'not_found';

export type ChatHistoryLoadResult =
  | { ok: true; id: string; title: string; messages: IpcChatMessage[] }
  | { ok: false; reason: ChatHistoryLoadFailureReason };

// --- chat-history:new ---

export interface ChatHistoryNewResult {
  ok: true;
}

// --- chat-history:remove ---

export interface ChatHistoryRemoveRequest {
  id: string;
}

export type ChatHistoryRemoveFailureReason = 'not_found';

export type ChatHistoryRemoveResult = { ok: true } | { ok: false; reason: ChatHistoryRemoveFailureReason };
