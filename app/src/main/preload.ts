/**
 * Preload script (Wave 4.5 integration / SPEC-TSA-001).
 *
 * Runs in an isolated context (contextIsolation: true, sandbox: true — see
 * `window.ts`) and exposes exactly one global, `window.thesisApi`, matching
 * the {@link ThesisApi} contract in `src/shared/thesisApi.ts`. The renderer
 * never touches `ipcRenderer` directly; every channel name and payload shape
 * comes from `src/shared/ipc-channels.ts`.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import type {
  AcademicKeyStatus,
  ChatSendResult,
  IpcAcademicKeyProvider,
  IpcGateSectionId,
  IpcLlmMode,
  IpcLlmProvider,
  OpenExternalRequest,
  QualityGateRunRequest,
  QualityGateRunResult,
  ResearchProgressPayload,
  ResearchRunResult,
  SaveAcademicKeyRequest,
  SaveAcademicKeyResult,
  SaveDecisionRequest,
  SaveProviderAndKeyRequest,
  SaveProviderAndKeyResult,
  StartupState,
} from '../shared/ipc-channels';
import type { ThesisApi } from '../shared/thesisApi';

/**
 * Sandboxed preloads (sandbox: true) can only require 'electron' and a few
 * Node builtins — a relative `require('../shared/ipc-channels')` throws at
 * load time and silently kills the whole bridge (2026-07-11 field bug:
 * white screen on packaged builds). Channel names are therefore inlined
 * here as literals. They MUST stay in sync with `src/shared/ipc-channels.ts`;
 * `test/unit/preloadChannels.test.ts` enforces that. Type-only imports above
 * are safe — they are fully erased at compile time.
 */
const IpcChannels = {
  APP_GET_STARTUP_STATE: 'app:get-startup-state',
  SETTINGS_SAVE_PROVIDER_AND_KEY: 'settings:save-provider-and-key',
  SHELL_OPEN_EXTERNAL: 'shell:open-external',
  CHAT_SEND: 'chat:send',
  RESEARCH_RUN: 'research:run',
  RESEARCH_PROGRESS: 'research:progress',
  MEMORY_SAVE_DECISION: 'memory:save-decision',
  QUALITY_GATE_RUN: 'quality-gate:run',
  SETTINGS_SAVE_ACADEMIC_KEY: 'settings:save-academic-key',
  SETTINGS_GET_ACADEMIC_KEY_STATUS: 'settings:get-academic-key-status',
} as const;

const thesisApi: ThesisApi = {
  getStartupState(): Promise<StartupState> {
    return ipcRenderer.invoke(IpcChannels.APP_GET_STARTUP_STATE) as Promise<StartupState>;
  },

  saveProviderAndKey(
    provider: IpcLlmProvider,
    key: string,
    mode: IpcLlmMode,
  ): Promise<SaveProviderAndKeyResult> {
    const req: SaveProviderAndKeyRequest = { provider, key, mode };
    return ipcRenderer.invoke(IpcChannels.SETTINGS_SAVE_PROVIDER_AND_KEY, req) as Promise<SaveProviderAndKeyResult>;
  },

  openExternal(url: string): void {
    const req: OpenExternalRequest = { url };
    void ipcRenderer.invoke(IpcChannels.SHELL_OPEN_EXTERNAL, req);
  },

  sendChat(text: string): Promise<ChatSendResult> {
    return ipcRenderer.invoke(IpcChannels.CHAT_SEND, { text }) as Promise<ChatSendResult>;
  },

  runResearch(question: string, onProgress: (event: ResearchProgressPayload) => void): Promise<ResearchRunResult> {
    return new Promise<ResearchRunResult>((resolve, reject) => {
      const listener = (_event: IpcRendererEvent, progress: ResearchProgressPayload): void => {
        onProgress(progress);
      };
      ipcRenderer.on(IpcChannels.RESEARCH_PROGRESS, listener);

      ipcRenderer
        .invoke(IpcChannels.RESEARCH_RUN, { question })
        .then((result: ResearchRunResult) => resolve(result))
        .catch((err: unknown) => reject(err))
        .finally(() => {
          ipcRenderer.removeListener(IpcChannels.RESEARCH_PROGRESS, listener);
        });
    });
  },

  saveDecision(what: string, why: string): Promise<void> {
    const req: SaveDecisionRequest = { what, why };
    return ipcRenderer.invoke(IpcChannels.MEMORY_SAVE_DECISION, req) as Promise<void>;
  },

  runQualityGate(sectionId: IpcGateSectionId, text: string): Promise<QualityGateRunResult> {
    const req: QualityGateRunRequest = { sectionId, text };
    return ipcRenderer.invoke(IpcChannels.QUALITY_GATE_RUN, req) as Promise<QualityGateRunResult>;
  },

  saveAcademicKey(provider: IpcAcademicKeyProvider, key: string): Promise<SaveAcademicKeyResult> {
    const req: SaveAcademicKeyRequest = { provider, key };
    return ipcRenderer.invoke(IpcChannels.SETTINGS_SAVE_ACADEMIC_KEY, req) as Promise<SaveAcademicKeyResult>;
  },

  getAcademicKeyStatus(): Promise<AcademicKeyStatus> {
    return ipcRenderer.invoke(IpcChannels.SETTINGS_GET_ACADEMIC_KEY_STATUS) as Promise<AcademicKeyStatus>;
  },
};

contextBridge.exposeInMainWorld('thesisApi', thesisApi);
