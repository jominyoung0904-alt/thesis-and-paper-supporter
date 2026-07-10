/**
 * IPC handlers for chat turns and memory decisions (`chat:send`,
 * `memory:save-decision`).
 *
 * Split out of `handlers.ts` (T40, SPEC-TSA-002) to keep each domain's
 * handler registration under the project's per-file line limit. Still
 * registered from `registerIpcHandlers`, the single composition root for all
 * channels.
 */

import { ipcMain } from 'electron';

import { translateLlmError } from '../../core/llm/errorTranslator';
import type { MemoryStore } from '../../core/memory/store';
import { IpcChannels } from '../../shared/ipc-channels';
import type { ChatSendRequest, ChatSendResult, SaveDecisionRequest } from '../../shared/ipc-channels';
import type { ConversationManagerHolder } from './guards';
import { INVALID_REQUEST_MESSAGE, isBoundedString } from './guards';
import { NO_KEY_MESSAGE } from './llmService';
import type { LlmService } from './llmService';

export interface ChatHandlerDeps {
  llmService: LlmService;
  /**
   * Returns the ACTIVE project's memory store. Re-invoked on every call
   * (rather than captured once) so a project switch is reflected on the very
   * next channel invocation — see `projectContext.ts` (T39/T41, FR-PRJ-002).
   */
  getMemoryStore: () => MemoryStore;
  conversation: ConversationManagerHolder;
}

const MAX_CHAT_TEXT_LENGTH = 20_000;
const MAX_DECISION_FIELD_LENGTH = 2_000;

/** Registers `chat:send` and `memory:save-decision`. */
export function registerChatHandlers(deps: ChatHandlerDeps): void {
  const { llmService, getMemoryStore, conversation } = deps;

  ipcMain.handle(IpcChannels.CHAT_SEND, async (_event, payload: ChatSendRequest): Promise<ChatSendResult> => {
    if (!isBoundedString(payload?.text, MAX_CHAT_TEXT_LENGTH)) {
      throw new Error(INVALID_REQUEST_MESSAGE);
    }
    if (!llmService.hasKey()) {
      throw new Error(NO_KEY_MESSAGE);
    }

    // Lazily built on first real chat turn — building eagerly would throw
    // when no key is registered yet (first run, before the wizard completes).
    let manager = conversation.get();
    if (!manager) {
      manager = conversation.build();
      conversation.set(manager);
    }

    try {
      const result = await manager.send(payload.text);
      return { reply: result.reply, suggestedDecision: result.suggestedDecision };
    } catch (err) {
      throw new Error(translateLlmError(err).message);
    }
  });

  ipcMain.handle(IpcChannels.MEMORY_SAVE_DECISION, async (_event, payload: SaveDecisionRequest): Promise<void> => {
    if (
      !isBoundedString(payload?.what, MAX_DECISION_FIELD_LENGTH) ||
      !isBoundedString(payload?.why, MAX_DECISION_FIELD_LENGTH)
    ) {
      throw new Error(INVALID_REQUEST_MESSAGE);
    }
    const memoryStore = getMemoryStore();
    memoryStore.addDecision({ what: payload.what, why: payload.why, source: 'chat' });
    memoryStore.save();
  });
}
