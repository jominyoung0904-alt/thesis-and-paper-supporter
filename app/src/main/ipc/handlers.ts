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
import { runQualityGate } from '../../core/writing/qualityGate';
import { introductionGateDefinition } from '../../core/writing/gateDefinitions';
import type { SectionGateDefinition } from '../../core/writing/gateDefinitions';
import { isAllowedExternalUrl } from '../../shared/externalUrlPolicy';
import { IpcChannels } from '../../shared/ipc-channels';
import type {
  ChatSendRequest,
  ChatSendResult,
  OpenExternalRequest,
  QualityGateRunRequest,
  QualityGateRunResult,
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

// Security (audit H1): TypeScript types on IPC payloads are compile-time
// only. A compromised renderer can invoke handlers with arbitrary values, so
// every handler re-validates its payload at runtime before use.
const VALID_PROVIDERS = ['claude', 'gemini', 'openai'] as const;
const VALID_MODES = ['free', 'paid'] as const;
const MAX_KEY_LENGTH = 512;
const MAX_CHAT_TEXT_LENGTH = 20_000;
const MAX_QUESTION_LENGTH = 2_000;
const MAX_DECISION_FIELD_LENGTH = 2_000;
const MAX_GATE_TEXT_LENGTH = 50_000;
const INVALID_REQUEST_MESSAGE = '잘못된 요청이에요. 앱을 다시 시작한 뒤 시도해 주세요.';

// Only 'introduction' ships in phase 1 (FR-WRT-001) — extend this map, not
// the handler below, when future sections (body, conclusion) are added.
const GATE_DEFINITIONS: Record<string, SectionGateDefinition> = {
  introduction: introductionGateDefinition,
};
const VALID_GATE_SECTIONS = Object.keys(GATE_DEFINITIONS);

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
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

      if (
        !(VALID_PROVIDERS as readonly string[]).includes(provider) ||
        !(VALID_MODES as readonly string[]).includes(mode) ||
        !isBoundedString(key, MAX_KEY_LENGTH)
      ) {
        return { ok: false, message: INVALID_REQUEST_MESSAGE };
      }

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
    if (typeof payload?.url !== 'string' || !isAllowedExternalUrl(payload.url)) {
      return;
    }
    await shell.openExternal(payload.url);
  });

  ipcMain.handle(IpcChannels.CHAT_SEND, async (_event, payload: ChatSendRequest): Promise<ChatSendResult> => {
    if (!isBoundedString(payload?.text, MAX_CHAT_TEXT_LENGTH)) {
      throw new Error(INVALID_REQUEST_MESSAGE);
    }
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
      if (!isBoundedString(payload?.question, MAX_QUESTION_LENGTH)) {
        throw new Error(INVALID_REQUEST_MESSAGE);
      }
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
    if (
      !isBoundedString(payload?.what, MAX_DECISION_FIELD_LENGTH) ||
      !isBoundedString(payload?.why, MAX_DECISION_FIELD_LENGTH)
    ) {
      throw new Error(INVALID_REQUEST_MESSAGE);
    }
    memoryStore.addDecision({ what: payload.what, why: payload.why, source: 'chat' });
    memoryStore.save();
  });

  ipcMain.handle(
    IpcChannels.QUALITY_GATE_RUN,
    async (_event, payload: QualityGateRunRequest): Promise<QualityGateRunResult> => {
      const definition = VALID_GATE_SECTIONS.includes(payload?.sectionId)
        ? GATE_DEFINITIONS[payload.sectionId]
        : undefined;
      if (!definition || !isBoundedString(payload?.text, MAX_GATE_TEXT_LENGTH)) {
        throw new Error(INVALID_REQUEST_MESSAGE);
      }
      if (!llmService.hasKey()) {
        throw new Error(NO_KEY_MESSAGE);
      }

      try {
        return await runQualityGate(definition, payload.text, {
          llm: llmService.getAdapter(),
          model: llmService.getModel(),
          memory: serializeMemoryForPrompt(memoryStore.getSnapshot()),
        });
      } catch (err) {
        throw new Error(translateLlmError(err).message);
      }
    },
  );
}
