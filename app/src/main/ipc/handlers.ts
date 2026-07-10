/**
 * Central IPC service assembly (Wave 4.5 integration / SPEC-TSA-001).
 *
 * Wires Wave 1~4 core modules (LLM adapters, memory store, chat conversation
 * manager, research pipeline, academic clients) into the IPC channels
 * declared in `src/shared/ipc-channels.ts`. This module only ever *consumes*
 * core public contracts — no core file's exported signature is changed here.
 *
 * T40 (SPEC-TSA-002): per-domain handler registration was split out into
 * settingsHandlers.ts / chatHandlers.ts / researchGateHandlers.ts /
 * academicKeyHandlers.ts to stay under the project's 300-line file limit as
 * new IPC domains are added this sprint (see plan.md "선행 리팩터링 메모").
 * This file now only assembles shared state (memory store, LLM service, the
 * lazily-built conversation manager) and wires each domain's
 * `register*Handlers` into the app.
 */

import type { AppSettings } from '../config/defaultSettings';
import type { KeyStore } from '../config/keyStore';
import { ConversationManager } from '../../core/chat/conversation';
import { MemoryStore } from '../../core/memory/store';
import { serializeMemoryForPrompt } from '../../core/memory/serializer';
import type { ConversationManagerHolder } from './guards';
import { registerAcademicKeyHandlers } from './academicKeyHandlers';
import { registerChatHandlers } from './chatHandlers';
import { createLlmService } from './llmService';
import { registerResearchGateHandlers } from './researchGateHandlers';
import { registerSettingsHandlers } from './settingsHandlers';

export interface IpcHandlerDeps {
  keyStore: KeyStore;
  settingsFile: string;
  getSettings: () => AppSettings;
  setSettings: (settings: AppSettings) => void;
  /** Absolute path to the single (MVP) project's memory JSON file. */
  memoryFilePath: string;
}

/** Registers every IPC handler this app exposes. Call once during bootstrap. */
// @AX:ANCHOR: [AUTO] central IPC wiring — composition root registering every channel handler. Related: SPEC-TSA-001
export function registerIpcHandlers(deps: IpcHandlerDeps): void {
  const { keyStore, settingsFile, getSettings, setSettings, memoryFilePath } = deps;

  registerAcademicKeyHandlers({ keyStore, getSettings });

  const memoryStore = new MemoryStore(memoryFilePath);
  memoryStore.load();

  const llmService = createLlmService(getSettings, keyStore);

  function buildConversationManager(): ConversationManager {
    return new ConversationManager({
      llm: llmService.getAdapter(),
      model: llmService.getModel(),
      getMemory: () => serializeMemoryForPrompt(memoryStore.getSnapshot()),
    });
  }

  // Shared across settingsHandlers.ts (rebuilds on provider/key change) and
  // chatHandlers.ts (lazily builds on first chat turn) — see guards.ts's
  // `ConversationManagerHolder` doc comment for why this lives here.
  let conversationManager: ConversationManager | null = null;
  const conversation: ConversationManagerHolder = {
    get: () => conversationManager,
    build: buildConversationManager,
    set: (manager) => {
      conversationManager = manager;
    },
  };

  registerSettingsHandlers({ keyStore, settingsFile, getSettings, setSettings, llmService, conversation });
  registerChatHandlers({ llmService, memoryStore, conversation });
  registerResearchGateHandlers({ llmService, memoryStore, keyStore, getSettings });
}
