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
  ChatHistoryListResult,
  ChatHistoryLoadResult,
  ChatHistoryNewResult,
  ChatHistoryRemoveResult,
  ChatSendResult,
  GateHistoryGetResult,
  GateHistoryListResult,
  GateHistoryRemoveResult,
  IpcAcademicKeyProvider,
  IpcGateSectionId,
  IpcLlmMode,
  IpcLlmProvider,
  IpcPaperMetadata,
  LibraryListResult,
  LibraryRemoveRequest,
  LibraryRemoveResult,
  LibrarySaveRequest,
  LibrarySaveResult,
  LibraryUpdateMemoRequest,
  LibraryUpdateMemoResult,
  OpenExternalRequest,
  ProjectArchiveRequest,
  ProjectArchiveResult,
  ProjectCreateRequest,
  ProjectCreateResult,
  ProjectListResult,
  ProjectRenameRequest,
  ProjectRenameResult,
  ProjectSwitchRequest,
  ProjectSwitchResult,
  QualityGateRunRequest,
  QualityGateRunResult,
  ResearchHistoryGetResult,
  ResearchHistoryListResult,
  ResearchHistoryRemoveResult,
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
  PROJECT_LIST: 'project:list',
  PROJECT_CREATE: 'project:create',
  PROJECT_RENAME: 'project:rename',
  PROJECT_SWITCH: 'project:switch',
  PROJECT_ARCHIVE: 'project:archive',
  LIBRARY_SAVE: 'library:save',
  LIBRARY_LIST: 'library:list',
  LIBRARY_UPDATE_MEMO: 'library:update-memo',
  LIBRARY_REMOVE: 'library:remove',
  RESEARCH_HISTORY_LIST: 'research-history:list',
  RESEARCH_HISTORY_GET: 'research-history:get',
  RESEARCH_HISTORY_REMOVE: 'research-history:remove',
  CHAT_HISTORY_LIST: 'chat-history:list',
  CHAT_HISTORY_LOAD: 'chat-history:load',
  CHAT_HISTORY_NEW: 'chat-history:new',
  CHAT_HISTORY_REMOVE: 'chat-history:remove',
  GATE_HISTORY_LIST: 'gate-history:list',
  GATE_HISTORY_GET: 'gate-history:get',
  GATE_HISTORY_REMOVE: 'gate-history:remove',
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

  listProjects(): Promise<ProjectListResult> {
    return ipcRenderer.invoke(IpcChannels.PROJECT_LIST) as Promise<ProjectListResult>;
  },

  createProject(name?: string): Promise<ProjectCreateResult> {
    const req: ProjectCreateRequest = { name };
    return ipcRenderer.invoke(IpcChannels.PROJECT_CREATE, req) as Promise<ProjectCreateResult>;
  },

  renameProject(id: string, name: string): Promise<ProjectRenameResult> {
    const req: ProjectRenameRequest = { id, name };
    return ipcRenderer.invoke(IpcChannels.PROJECT_RENAME, req) as Promise<ProjectRenameResult>;
  },

  switchProject(id: string): Promise<ProjectSwitchResult> {
    const req: ProjectSwitchRequest = { id };
    return ipcRenderer.invoke(IpcChannels.PROJECT_SWITCH, req) as Promise<ProjectSwitchResult>;
  },

  archiveProject(id: string): Promise<ProjectArchiveResult> {
    const req: ProjectArchiveRequest = { id };
    return ipcRenderer.invoke(IpcChannels.PROJECT_ARCHIVE, req) as Promise<ProjectArchiveResult>;
  },

  saveToLibrary(paper: IpcPaperMetadata, sourceResearchId?: string): Promise<LibrarySaveResult> {
    const req: LibrarySaveRequest = { paper, sourceResearchId };
    return ipcRenderer.invoke(IpcChannels.LIBRARY_SAVE, req) as Promise<LibrarySaveResult>;
  },

  listLibrary(): Promise<LibraryListResult> {
    return ipcRenderer.invoke(IpcChannels.LIBRARY_LIST) as Promise<LibraryListResult>;
  },

  updateLibraryMemo(id: string, memo: string): Promise<LibraryUpdateMemoResult> {
    const req: LibraryUpdateMemoRequest = { id, memo };
    return ipcRenderer.invoke(IpcChannels.LIBRARY_UPDATE_MEMO, req) as Promise<LibraryUpdateMemoResult>;
  },

  removeFromLibrary(id: string): Promise<LibraryRemoveResult> {
    const req: LibraryRemoveRequest = { id };
    return ipcRenderer.invoke(IpcChannels.LIBRARY_REMOVE, req) as Promise<LibraryRemoveResult>;
  },

  listResearchHistory(): Promise<ResearchHistoryListResult> {
    return ipcRenderer.invoke(IpcChannels.RESEARCH_HISTORY_LIST) as Promise<ResearchHistoryListResult>;
  },

  getResearchHistoryRecord(id: string): Promise<ResearchHistoryGetResult> {
    return ipcRenderer.invoke(IpcChannels.RESEARCH_HISTORY_GET, { id }) as Promise<ResearchHistoryGetResult>;
  },

  removeResearchHistoryRecord(id: string): Promise<ResearchHistoryRemoveResult> {
    return ipcRenderer.invoke(IpcChannels.RESEARCH_HISTORY_REMOVE, { id }) as Promise<ResearchHistoryRemoveResult>;
  },

  listChatHistory(): Promise<ChatHistoryListResult> {
    return ipcRenderer.invoke(IpcChannels.CHAT_HISTORY_LIST) as Promise<ChatHistoryListResult>;
  },

  loadChatHistory(id: string): Promise<ChatHistoryLoadResult> {
    return ipcRenderer.invoke(IpcChannels.CHAT_HISTORY_LOAD, { id }) as Promise<ChatHistoryLoadResult>;
  },

  newChatHistory(): Promise<ChatHistoryNewResult> {
    return ipcRenderer.invoke(IpcChannels.CHAT_HISTORY_NEW) as Promise<ChatHistoryNewResult>;
  },

  removeChatHistory(id: string): Promise<ChatHistoryRemoveResult> {
    return ipcRenderer.invoke(IpcChannels.CHAT_HISTORY_REMOVE, { id }) as Promise<ChatHistoryRemoveResult>;
  },

  listGateHistory(): Promise<GateHistoryListResult> {
    return ipcRenderer.invoke(IpcChannels.GATE_HISTORY_LIST) as Promise<GateHistoryListResult>;
  },

  getGateRecord(id: string): Promise<GateHistoryGetResult> {
    return ipcRenderer.invoke(IpcChannels.GATE_HISTORY_GET, { id }) as Promise<GateHistoryGetResult>;
  },

  removeGateRecord(id: string): Promise<GateHistoryRemoveResult> {
    return ipcRenderer.invoke(IpcChannels.GATE_HISTORY_REMOVE, { id }) as Promise<GateHistoryRemoveResult>;
  },
};

contextBridge.exposeInMainWorld('thesisApi', thesisApi);
