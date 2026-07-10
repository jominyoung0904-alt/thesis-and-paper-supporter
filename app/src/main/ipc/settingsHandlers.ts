/**
 * IPC handlers for app startup state, provider/key settings, and external
 * links (`app:get-startup-state`, `settings:save-provider-and-key`,
 * `shell:open-external`).
 *
 * Split out of `handlers.ts` (T40, SPEC-TSA-002) to keep each domain's
 * handler registration under the project's per-file line limit. Still
 * registered from `registerIpcHandlers`, the single composition root for all
 * channels.
 */

import { ipcMain, shell } from 'electron';

import type { AppSettings } from '../config/defaultSettings';
import type { KeyStore } from '../config/keyStore';
import { DEFAULT_MODELS } from '../config/defaultModels';
import { saveSettings } from '../config/settingsLoader';
import { createAdapter } from '../../core/llm';
import { translateLlmError } from '../../core/llm/errorTranslator';
import { isAllowedExternalUrl } from '../../shared/externalUrlPolicy';
import { IpcChannels } from '../../shared/ipc-channels';
import type {
  LlmStatusResult,
  OpenExternalRequest,
  SaveProviderAndKeyRequest,
  SaveProviderAndKeyResult,
  StartupState,
} from '../../shared/ipc-channels';
import type { ConversationManagerHolder } from './guards';
import { INVALID_REQUEST_MESSAGE, isBoundedString } from './guards';
import type { LlmService } from './llmService';

export interface SettingsHandlerDeps {
  keyStore: KeyStore;
  settingsFile: string;
  getSettings: () => AppSettings;
  setSettings: (settings: AppSettings) => void;
  llmService: LlmService;
  conversation: ConversationManagerHolder;
}

// Security (audit H1): see guards.ts doc comment — every handler
// re-validates its payload at runtime before use.
const VALID_PROVIDERS = ['claude', 'gemini', 'openai'] as const;
const VALID_MODES = ['free', 'paid'] as const;
const MAX_KEY_LENGTH = 512;

/** Registers `app:get-startup-state`, `settings:save-provider-and-key`, `shell:open-external`. */
export function registerSettingsHandlers(deps: SettingsHandlerDeps): void {
  const { keyStore, settingsFile, getSettings, setSettings, llmService, conversation } = deps;

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
      const previousHistory = conversation.get()?.getHistory() ?? [];
      const rebuilt = conversation.build();
      rebuilt.restoreHistory(previousHistory);
      conversation.set(rebuilt);

      return { ok: true };
    },
  );

  ipcMain.handle(IpcChannels.SETTINGS_GET_LLM_STATUS, async (): Promise<LlmStatusResult> => {
    const settings = getSettings();
    return {
      provider: settings.llm.provider,
      mode: settings.llm.mode,
      // Never returns the key itself — only whether one is registered for
      // the currently active provider (a stale key for a *different*
      // provider must not read as "connected").
      hasKey: keyStore.listStoredProviders().includes(settings.llm.provider),
    };
  });

  ipcMain.handle(IpcChannels.SHELL_OPEN_EXTERNAL, async (_event, payload: OpenExternalRequest): Promise<void> => {
    if (typeof payload?.url !== 'string' || !isAllowedExternalUrl(payload.url)) {
      return;
    }
    await shell.openExternal(payload.url);
  });
}
