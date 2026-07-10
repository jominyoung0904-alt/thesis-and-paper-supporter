/**
 * IPC handlers for saved chat session management (`chat-history:list`,
 * `chat-history:load`, `chat-history:new`, `chat-history:remove`) plus the
 * `recordChatTurn` autosave hook consumed by `chat:send` (FR-CHM-001~004).
 *
 * Split out of `chatHandlers.ts` (T53, SPEC-TSA-002) so the autosave/history
 * domain stays independent of the turn-sending domain. This module owns the
 * `ActiveChatSession` tracker: which saved session (if any) the CURRENT
 * `ConversationManager` transcript belongs to. `chatHandlers.ts` calls
 * `recordChatTurn` right after a successful `chat:send` turn; a project
 * switch must reset the tracker (see `ActiveChatSession.clear()` doc comment)
 * — wired from `handlers.ts` via `projectContext.onSwitch`, same pattern as
 * the existing ConversationManager reset there.
 */

import { ipcMain } from 'electron';

import type { ChatMessage } from '../../core/chat/types';
import { ChatSessionStore } from '../../core/chat/sessionStore';
import { ChatHistoryChannels } from '../../shared/ipc/chatHistory';
import type {
  ChatHistoryListResult,
  ChatHistoryLoadRequest,
  ChatHistoryLoadResult,
  ChatHistoryNewResult,
  ChatHistoryRemoveRequest,
  ChatHistoryRemoveResult,
  IpcChatMessage,
  IpcChatSessionSummary,
} from '../../shared/ipc/chatHistory';
import type { ConversationManagerHolder } from './guards';
import { isBoundedString } from './guards';

/** Session ids are UUIDs; this bound just rejects obviously-malformed payloads before a filesystem lookup. */
const MAX_SESSION_ID_LENGTH = 200;

/**
 * Mutable holder for "which saved session (if any) the live conversation
 * transcript currently belongs to". A brand-new/never-loaded conversation has
 * no active session (`get()` returns `null`) — the next `recordChatTurn` call
 * creates one. Reset to `null` on `chat-history:new` and on a project switch
 * (a different project's session ids are meaningless for the new project).
 */
// @AX:ANCHOR: [AUTO] cross-module contract — mutated by chatHandlers.ts and reset via projectContext.onSwitch; keep the null-means-unsaved invariant. Related: SPEC-TSA-002 T53
export interface ActiveChatSession {
  get(): string | null;
  set(id: string): void;
  clear(): void;
}

/** Plain in-memory `ActiveChatSession`. One instance backs the single active conversation, same lifetime as `ConversationManagerHolder`'s instance. */
export function createActiveChatSession(): ActiveChatSession {
  let currentId: string | null = null;
  return {
    get: () => currentId,
    set: (id) => {
      currentId = id;
    },
    clear: () => {
      currentId = null;
    },
  };
}

export interface ChatHistoryHandlerDeps {
  /** Returns the ACTIVE project's chats directory. Re-invoked on every call — same pattern as `getMemoryStore` in `chatHandlers.ts`. */
  getChatsDir: () => string;
  conversation: ConversationManagerHolder;
  activeSession: ActiveChatSession;
}

function toIpcSummary(summary: {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}): IpcChatSessionSummary {
  return { id: summary.id, title: summary.title, updatedAt: summary.updatedAt, messageCount: summary.messageCount };
}

function toIpcMessages(messages: readonly ChatMessage[]): IpcChatMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content, at: m.at }));
}

function isValidId(value: unknown): value is string {
  return isBoundedString(value, MAX_SESSION_ID_LENGTH);
}

/** Registers `chat-history:list`, `chat-history:load`, `chat-history:new`, `chat-history:remove`. */
export function registerChatHistoryHandlers(deps: ChatHistoryHandlerDeps): void {
  const { getChatsDir, conversation, activeSession } = deps;

  ipcMain.handle(ChatHistoryChannels.CHAT_HISTORY_LIST, async (): Promise<ChatHistoryListResult> => {
    const store = new ChatSessionStore(getChatsDir());
    return { sessions: store.listSummaries().map(toIpcSummary) };
  });

  ipcMain.handle(
    ChatHistoryChannels.CHAT_HISTORY_LOAD,
    async (_event, payload: ChatHistoryLoadRequest): Promise<ChatHistoryLoadResult> => {
      if (!isValidId(payload?.id)) {
        return { ok: false, reason: 'not_found' };
      }

      const store = new ChatSessionStore(getChatsDir());
      const session = store.get(payload.id);
      if (!session) {
        return { ok: false, reason: 'not_found' };
      }

      try {
        // Lazily build, mirroring chat:send — a saved session may be loaded
        // before any LLM key is registered on a fresh install.
        let manager = conversation.get();
        if (!manager) {
          manager = conversation.build();
          conversation.set(manager);
        }
        manager.restoreHistory(session.messages);
      } catch (err) {
        // No key registered yet / build failed — the transcript is still
        // returned so the UI can render it; the next chat:send lazily
        // rebuilds the manager and this restore is simply skipped.
        console.error('[chatHistoryHandlers] failed to restore history into conversation manager:', err);
      }

      activeSession.set(session.id);
      return { ok: true, id: session.id, title: session.title, messages: toIpcMessages(session.messages) };
    },
  );

  ipcMain.handle(ChatHistoryChannels.CHAT_HISTORY_NEW, async (): Promise<ChatHistoryNewResult> => {
    activeSession.clear();
    const manager = conversation.get();
    if (manager) {
      manager.restoreHistory([]);
    }
    return { ok: true };
  });

  ipcMain.handle(
    ChatHistoryChannels.CHAT_HISTORY_REMOVE,
    async (_event, payload: ChatHistoryRemoveRequest): Promise<ChatHistoryRemoveResult> => {
      if (!isValidId(payload?.id)) {
        return { ok: false, reason: 'not_found' };
      }

      const store = new ChatSessionStore(getChatsDir());
      const removed = store.remove(payload.id);
      if (!removed) {
        return { ok: false, reason: 'not_found' };
      }

      if (activeSession.get() === payload.id) {
        activeSession.clear();
      }
      return { ok: true };
    },
  );
}

/**
 * Autosave hook: called right after a successful `chat:send` turn with the
 * ConversationManager's full post-turn `getHistory()` snapshot.
 *
 * No active session yet -> creates one, deriving its title from the first
 * user turn, then writes the full history into it. An active session already
 * exists -> replaces its transcript wholesale (`appendTurn`, per
 * `ChatSessionStore`'s whole-history-replacement design). If the active
 * session id turns out stale (file missing/corrupted), a fresh session is
 * created instead of silently dropping the turn.
 *
 * Never throws — a save failure must not break the chat response the user is
 * already looking at; failures are logged only.
 */
export function recordChatTurn(chatsDir: string, activeSession: ActiveChatSession, history: ChatMessage[]): void {
  try {
    const store = new ChatSessionStore(chatsDir);
    const currentId = activeSession.get();

    if (currentId) {
      const updated = store.appendTurn(currentId, history);
      if (updated) return;
      // Stale id (file missing/corrupted) — fall through and create fresh.
    }

    const firstUserText = history.find((m) => m.role === 'user')?.content;
    const session = store.createSession(firstUserText);
    store.appendTurn(session.id, history);
    activeSession.set(session.id);
  } catch (err) {
    console.error('[chatHistoryHandlers] recordChatTurn failed (chat response unaffected):', err);
  }
}
