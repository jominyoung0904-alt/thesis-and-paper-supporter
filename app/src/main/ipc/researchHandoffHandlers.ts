/**
 * IPC handler for `research-handoff:start` (FR-RSH-003, T51 / SPEC-TSA-002)
 * — "이 결과로 회의하기": loads a saved research record's report + reference
 * lists as the opening turns of a brand-new chat.
 *
 * Follows the same domain-handler-file split as `chatHistoryHandlers.ts` /
 * `researchHistoryHandlers.ts` (T40, SPEC-TSA-002). `ResearchHandoffChannels`
 * is imported directly from `shared/ipc/researchHandoff.ts` rather than the
 * central `ipc-channels.ts` barrel, so this module compiles independently of
 * the central wiring pass (see that file's doc comment).
 *
 * Deliberately reuses the SAME `ConversationManagerHolder` / `ActiveChatSession`
 * collaborators `chatHandlers.ts` / `chatHistoryHandlers.ts` already share
 * (owned by `handlers.ts`, the composition root) — a handoff is, from the
 * conversation manager's point of view, just another "replace the live
 * transcript" operation, identical in shape to `chat-history:load`.
 */

import { ipcMain } from 'electron';

import type { ConversationManager } from '../../core/chat/conversation';
import { buildHandoffPreview, buildResearchHandoffHistory } from '../../core/chat/researchHandoff';
import type { ChatMessage } from '../../core/chat/types';
import { ResearchHistoryStore } from '../../core/research-history/store';
import type { IpcChatMessage } from '../../shared/ipc/chatHistory';
import {
  ResearchHandoffChannels,
  type ResearchHandoffStartRequest,
  type ResearchHandoffStartResult,
} from '../../shared/ipc/researchHandoff';
import type { ActiveChatSession } from './chatHistoryHandlers';
import type { ConversationManagerHolder } from './guards';
import { isBoundedString } from './guards';

/** UUIDs are 36 chars; generous bound mirrors `researchHistoryHandlers.ts`'s MAX_ID_LENGTH. */
const MAX_ID_LENGTH = 200;

export interface ResearchHandoffHandlerDeps {
  /**
   * Returns the ACTIVE project's research history directory. Re-invoked on
   * every call — mirrors `getResearchDir` in `researchHistoryHandlers.ts`
   * (T39/T41, FR-PRJ-002).
   */
  getResearchDir: () => string;
  conversation: ConversationManagerHolder;
  /** Tracks which saved session (if any) the live transcript belongs to (T53, FR-CHM-*). */
  activeSession: ActiveChatSession;
}

function toIpcMessages(messages: readonly ChatMessage[]): IpcChatMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content, at: m.at }));
}

/** Registers `research-handoff:start`. */
export function registerResearchHandoffHandlers(deps: ResearchHandoffHandlerDeps): void {
  const { getResearchDir, conversation, activeSession } = deps;

  ipcMain.handle(
    ResearchHandoffChannels.RESEARCH_HANDOFF_START,
    async (_event, payload: ResearchHandoffStartRequest): Promise<ResearchHandoffStartResult> => {
      if (!isBoundedString(payload?.researchId, MAX_ID_LENGTH)) {
        return { ok: false, reason: 'not_found' };
      }

      const store = new ResearchHistoryStore(getResearchDir());
      const record = store.get(payload.researchId);
      if (!record) {
        return { ok: false, reason: 'not_found' };
      }

      const handoff = buildResearchHandoffHistory(record);

      // Lazily (re)built exactly like `chat-history:load` — a fresh install
      // may reach this handoff before any LLM key is registered, in which
      // case `conversation.build()` throws synchronously (see
      // `llmService.ts`'s NO_KEY_MESSAGE) rather than returning a rejected
      // promise. Reported as `no_key` instead of an unhandled error.
      let manager: ConversationManager;
      try {
        manager = conversation.build();
      } catch (err) {
        console.error('[researchHandoffHandlers] failed to build conversation manager (no key registered?):', err);
        return { ok: false, reason: 'no_key' };
      }

      manager.restoreHistory(handoff);
      conversation.set(manager);
      // The next `chat:send` starts a brand-new saved session (same reset
      // `chat-history:new` performs — see `chatHistoryHandlers.ts`), whose
      // autosaved transcript naturally includes these injected turns.
      activeSession.clear();

      return { ok: true, preview: buildHandoffPreview(record), messages: toIpcMessages(handoff) };
    },
  );
}
