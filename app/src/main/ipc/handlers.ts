/**
 * Central IPC service assembly (Wave 4.5 integration / SPEC-TSA-001).
 *
 * Wires Wave 1~4 core modules (LLM adapters, memory store, chat conversation
 * manager, research pipeline, academic clients) into the seven IPC channels
 * declared in `src/shared/ipc-channels.ts`. This module only ever *consumes*
 * core public contracts — no core file's exported signature is changed here.
 */

import { ipcMain, shell, type IpcMainInvokeEvent } from 'electron';

import type { AppSettings } from '../config/defaultSettings';
import type { KeyStore } from '../config/keyStore';
import { DEFAULT_MODELS } from '../config/defaultModels';
import { saveSettings } from '../config/settingsLoader';
import { createAdapter } from '../../core/llm';
import { translateLlmError } from '../../core/llm/errorTranslator';
import { ConversationManager } from '../../core/chat/conversation';
import { MemoryStore } from '../../core/memory/store';
import { serializeMemoryForPrompt } from '../../core/memory/serializer';
import { runDeepResearch } from '../../core/research-pipeline/pipeline';
import { isAllowedExternalUrl } from '../../shared/externalUrlPolicy';
import { IpcChannels } from '../../shared/ipc-channels';
import type {
  ChatSendRequest,
  ChatSendResult,
  OpenExternalRequest,
  ResearchProgressPayload,
  ResearchRunRequest,
  ResearchRunResult,
  SaveDecisionRequest,
  SaveProviderAndKeyRequest,
  SaveProviderAndKeyResult,
  StartupState,
} from '../../shared/ipc-channels';
import { buildAcademicClients } from './academicClients';
import { createLlmService, NO_KEY_MESSAGE } from './llmService';
import { mapDeepResearchResult } from './researchMapper';

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

  // Lazily built on first real chat turn — building eagerly would throw when
  // no key is registered yet (first run, before the wizard completes).
  let conversationManager: ConversationManager | null = null;

  ipcMain.handle(IpcChannels.APP_GET_STARTUP_STATE, async (): Promise<StartupState> => {
    return { firstRun: keyStore.listStoredProviders().length === 0 };
  });

  ipcMain.handle(
    IpcChannels.SETTINGS_SAVE_PROVIDER_AND_KEY,
    async (_event, payload: SaveProviderAndKeyRequest): Promise<SaveProviderAndKeyResult> => {
      const { provider, key, mode } = payload;

      const updatedSettings: AppSettings = { ...getSettings(), llm: { provider, mode } };

      // Verify the key against the live endpoint BEFORE persisting anything,
      // so a failed connectivity check never leaves an unverified key behind.
      try {
        // @AX:TODO: [AUTO] DEFAULT_MODELS[provider] is hardcoded — load model ids from remote config instead. Related: NFR-RISK-009, T27
        const testAdapter = createAdapter(provider, { baseUrl: updatedSettings.endpoints[provider], apiKey: key });
        await testAdapter.chat({
          model: DEFAULT_MODELS[provider],
          messages: [{ role: 'user', content: '안녕' }],
          maxTokens: 16,
        });
      } catch (err) {
        return { ok: false, message: translateLlmError(err).message };
      }

      const saveResult = keyStore.saveKey(provider, key);
      if (!saveResult.ok) {
        return { ok: false, message: saveResult.userMessage };
      }

      saveSettings(settingsFile, updatedSettings);
      setSettings(updatedSettings);
      llmService.invalidate();

      // Provider/model changed — rebuild the conversation manager so its
      // fixed `model` field stays in sync, carrying the transcript over.
      const previousHistory = conversationManager?.getHistory() ?? [];
      conversationManager = buildConversationManager();
      conversationManager.restoreHistory(previousHistory);

      return { ok: true };
    },
  );

  ipcMain.handle(IpcChannels.SHELL_OPEN_EXTERNAL, async (_event, payload: OpenExternalRequest): Promise<void> => {
    if (!isAllowedExternalUrl(payload.url)) {
      return;
    }
    await shell.openExternal(payload.url);
  });

  ipcMain.handle(IpcChannels.CHAT_SEND, async (_event, payload: ChatSendRequest): Promise<ChatSendResult> => {
    if (!llmService.hasKey()) {
      throw new Error(NO_KEY_MESSAGE);
    }
    conversationManager ??= buildConversationManager();

    try {
      const result = await conversationManager.send(payload.text);
      return { reply: result.reply, suggestedDecision: result.suggestedDecision };
    } catch (err) {
      throw new Error(translateLlmError(err).message);
    }
  });

  ipcMain.handle(
    IpcChannels.RESEARCH_RUN,
    async (event: IpcMainInvokeEvent, payload: ResearchRunRequest): Promise<ResearchRunResult> => {
      if (!llmService.hasKey()) {
        throw new Error(NO_KEY_MESSAGE);
      }

      const clients = buildAcademicClients(getSettings(), keyStore);

      try {
        const result = await runDeepResearch({
          question: payload.question,
          memory: serializeMemoryForPrompt(memoryStore.getSnapshot()),
          llm: llmService.getAdapter(),
          clients,
          model: llmService.getModel(),
          onProgress: (progressEvent: ResearchProgressPayload) => {
            event.sender.send(IpcChannels.RESEARCH_PROGRESS, progressEvent);
          },
        });
        return mapDeepResearchResult(result);
      } catch (err) {
        throw new Error(translateLlmError(err).message);
      }
    },
  );

  ipcMain.handle(IpcChannels.MEMORY_SAVE_DECISION, async (_event, payload: SaveDecisionRequest): Promise<void> => {
    memoryStore.addDecision({ what: payload.what, why: payload.why, source: 'chat' });
    memoryStore.save();
  });
}
