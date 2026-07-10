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

import { IpcChannels } from '../shared/ipc-channels';
import type {
  ChatSendResult,
  IpcGateSectionId,
  IpcLlmMode,
  IpcLlmProvider,
  OpenExternalRequest,
  QualityGateRunRequest,
  QualityGateRunResult,
  ResearchProgressPayload,
  ResearchRunResult,
  SaveDecisionRequest,
  SaveProviderAndKeyRequest,
  SaveProviderAndKeyResult,
  StartupState,
} from '../shared/ipc-channels';
import type { ThesisApi } from '../shared/thesisApi';

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
};

contextBridge.exposeInMainWorld('thesisApi', thesisApi);
