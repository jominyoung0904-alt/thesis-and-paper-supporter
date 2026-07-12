/**
 * Adapts `window.thesisApi` (the generic, IPC-shaped preload bridge) into
 * the domain-specific callback contracts `Wizard`, `ChatScreen`, and
 * `WritingCheckScreen` expect (`WizardCallbacks`, `ChatScreenCallbacks`,
 * `WritingCheckCallbacks`). This is the "type mirror adapter" boundary:
 * `window.thesisApi` speaks `shared/ipc-channels.ts` shapes, these factories
 * translate 1:1 into the renderer's own local types.
 *
 * Note: `ChatMessage` (core `{content, at}` vs renderer `{text, createdAt}`)
 * never needs mapping here — the chat/research IPC results only ever carry
 * a single reply/report string; the renderer builds its own message bubbles
 * locally in `chatUiLogic.ts`. Chat transcript persistence across app
 * restarts is out of scope for this sprint (known gap, see completion report).
 */
import type { WizardCallbacks } from './settings/wizard';
import type { SettingsScreenCallbacks } from './settings/SettingsScreen';
import type { ChatScreenCallbacks } from './chat';
import type { WritingCheckCallbacks } from './writing/WritingCheckScreen';
import type { GateHistoryScreenCallbacks } from './writing/GateHistoryScreen';
import type { PolishViewCallbacks } from './writing/PolishView';
import type { MockReviewViewCallbacks } from './writing/MockReviewView';
import type { WritingScreenCallbacks } from './writing/WritingScreen';
import type {
  ChatHistoryListResult,
  ChatHistoryLoadResult,
  ChatHistoryNewResult,
  ChatHistoryRemoveResult,
  IpcPaperMetadata,
  LibraryListResult,
  LibraryRemoveResult,
  LibrarySaveResult,
  LibraryUpdateMemoResult,
  ProjectArchiveResult,
  ProjectCreateResult,
  ProjectListResult,
  ProjectRenameResult,
  ProjectSwitchResult,
  ResearchHistoryGetResult,
  ResearchHistoryListResult,
  ResearchHistoryRemoveResult,
} from '../shared/ipc-channels';

export function createWizardCallbacks(): WizardCallbacks {
  return {
    saveProviderAndKey: (provider, key, mode) => window.thesisApi.saveProviderAndKey(provider, key, mode),
    // The wizard's naverDoc step only ever registers naverdoc (실사용 피드백
    // #1) — the provider is hardcoded here rather than threaded through
    // `WizardCallbacks`, which never needs to know about other providers.
    saveAcademicKey: (key) => window.thesisApi.saveAcademicKey('naverdoc', key),
    openExternal: (url) => window.thesisApi.openExternal(url),
    readClipboardText: () => window.thesisApi.readClipboardText(),
  };
}

export function createChatScreenCallbacks(): ChatScreenCallbacks {
  return {
    async sendChat(text) {
      const result = await window.thesisApi.sendChat(text);
      return { reply: result.reply, suggestedDecision: result.suggestedDecision };
    },

    async runResearch(question, onProgress, detailed) {
      const result = await window.thesisApi.runResearch(
        question,
        (event) => {
          onProgress({ stage: event.stage, detail: event.detail });
        },
        detailed,
      );
      const mapPaper = (paper: (typeof result.papers)[number]) => ({
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        url: paper.url,
        source: paper.source,
        // Raw metadata rides along so `ResearchProgress`'s library-save
        // button (Task T45, FR-LIB-001) can call `saveToLibrary` with the
        // paper's `source`+`externalId` duplicate-detection key.
        metadata: paper.metadata,
      });
      return {
        report: result.report,
        papers: result.papers.map(mapPaper),
        citedPapers: result.citedPapers.map(mapPaper),
        relatedPapers: result.relatedPapers.map(mapPaper),
        failedSources: result.failedSources.map((failed) => ({
          source: failed.source,
          reason: failed.reason,
        })),
      };
    },

    async saveDecision(what, why) {
      await window.thesisApi.saveDecision(what, why);
    },

    openLink: (url) => window.thesisApi.openExternal(url),

    startResearchHandoff: (researchId) => window.thesisApi.startResearchHandoff(researchId),

    // Gates the naverdoc-connect info banner in research mode (실사용 피드백 #2).
    getAcademicKeyStatus: () => window.thesisApi.getAcademicKeyStatus(),

    // Gates the "🔍+ 상세검색" toggle — selectable only on paid mode.
    getLlmStatus: () => window.thesisApi.getLlmStatus(),
  };
}

export function createWritingCheckCallbacks(): WritingCheckCallbacks {
  return {
    runQualityGate: (sectionId, text) => window.thesisApi.runQualityGate(sectionId, text),
  };
}

export function createSettingsScreenCallbacks(): SettingsScreenCallbacks {
  return {
    saveAcademicKey: (provider, key) => window.thesisApi.saveAcademicKey(provider, key),
    getAcademicKeyStatus: () => window.thesisApi.getAcademicKeyStatus(),
    openExternal: (url) => window.thesisApi.openExternal(url),
    getLlmStatus: () => window.thesisApi.getLlmStatus(),
    saveProviderAndKey: (provider, key, mode) => window.thesisApi.saveProviderAndKey(provider, key, mode),
    readClipboardText: () => window.thesisApi.readClipboardText(),
  };
}

/**
 * Bridge-only callback contract for multi-project management screens
 * (FR-PRJ-001~006). No renderer UI consumes this yet — T42 owns the actual
 * project-switcher/management screen and may either import this factory
 * directly or define its own screen-local `ProjectScreenCallbacks` type that
 * matches this shape (same "type mirror adapter" pattern as the other
 * `create*Callbacks` factories in this file).
 */
export interface ProjectScreenCallbacks {
  listProjects(): Promise<ProjectListResult>;
  createProject(name?: string): Promise<ProjectCreateResult>;
  renameProject(id: string, name: string): Promise<ProjectRenameResult>;
  switchProject(id: string): Promise<ProjectSwitchResult>;
  archiveProject(id: string): Promise<ProjectArchiveResult>;
}

export function createProjectScreenCallbacks(): ProjectScreenCallbacks {
  return {
    listProjects: () => window.thesisApi.listProjects(),
    createProject: (name) => window.thesisApi.createProject(name),
    renameProject: (id, name) => window.thesisApi.renameProject(id, name),
    switchProject: (id) => window.thesisApi.switchProject(id),
    archiveProject: (id) => window.thesisApi.archiveProject(id),
  };
}

/** Bridge-only callback contract for the literature library screen (FR-LIB-001/002, T45). */
export interface LibraryScreenCallbacks {
  saveToLibrary(paper: IpcPaperMetadata, sourceResearchId?: string): Promise<LibrarySaveResult>;
  listLibrary(): Promise<LibraryListResult>;
  updateLibraryMemo(id: string, memo: string): Promise<LibraryUpdateMemoResult>;
  removeFromLibrary(id: string): Promise<LibraryRemoveResult>;
  /** Opens a URL in the user's default external browser (same `openLink` pattern as `ChatScreenCallbacks`). */
  openLink(url: string): void;
}

export function createLibraryScreenCallbacks(): LibraryScreenCallbacks {
  return {
    saveToLibrary: (paper, sourceResearchId) => window.thesisApi.saveToLibrary(paper, sourceResearchId),
    listLibrary: () => window.thesisApi.listLibrary(),
    updateLibraryMemo: (id, memo) => window.thesisApi.updateLibraryMemo(id, memo),
    removeFromLibrary: (id) => window.thesisApi.removeFromLibrary(id),
    openLink: (url) => window.thesisApi.openExternal(url),
  };
}

/** Bridge-only callback contract for a research-history list/detail screen (FR-RSH-002, T49). */
export interface ResearchHistoryScreenCallbacks {
  listResearchHistory(): Promise<ResearchHistoryListResult>;
  getResearchHistoryRecord(id: string): Promise<ResearchHistoryGetResult>;
  removeResearchHistoryRecord(id: string): Promise<ResearchHistoryRemoveResult>;
}

export function createResearchHistoryScreenCallbacks(): ResearchHistoryScreenCallbacks {
  return {
    listResearchHistory: () => window.thesisApi.listResearchHistory(),
    getResearchHistoryRecord: (id) => window.thesisApi.getResearchHistoryRecord(id),
    removeResearchHistoryRecord: (id) => window.thesisApi.removeResearchHistoryRecord(id),
  };
}

/** Bridge-only callback contract for the chat session sidebar (FR-CHM-002~004, T54). */
export interface ChatHistoryCallbacks {
  listChatHistory(): Promise<ChatHistoryListResult>;
  loadChatHistory(id: string): Promise<ChatHistoryLoadResult>;
  newChatHistory(): Promise<ChatHistoryNewResult>;
  removeChatHistory(id: string): Promise<ChatHistoryRemoveResult>;
}

export function createChatHistoryCallbacks(): ChatHistoryCallbacks {
  return {
    listChatHistory: () => window.thesisApi.listChatHistory(),
    loadChatHistory: (id) => window.thesisApi.loadChatHistory(id),
    newChatHistory: () => window.thesisApi.newChatHistory(),
    removeChatHistory: (id) => window.thesisApi.removeChatHistory(id),
  };
}

export function createPolishViewCallbacks(): PolishViewCallbacks {
  return { runPolish: (text) => window.thesisApi.runPolish(text) };
}

export function createMockReviewViewCallbacks(): MockReviewViewCallbacks {
  return {
    runMockReview: (text) => window.thesisApi.runMockReview(text),
    listMockReviewHistory: async () => (await window.thesisApi.listMockReviewHistory()).records,
    getMockReviewRecord: (id) => window.thesisApi.getMockReviewRecord(id),
    removeMockReviewRecord: async (id) => (await window.thesisApi.removeMockReviewRecord(id)).ok,
  };
}

/** Assembles the four sub-view callback sets consumed by `WritingScreen` (T59, T62). */
export function createWritingScreenCallbacks(): WritingScreenCallbacks {
  return {
    check: createWritingCheckCallbacks(),
    polish: createPolishViewCallbacks(),
    mockReview: createMockReviewViewCallbacks(),
    history: createGateHistoryScreenCallbacks(),
  };
}

export function createGateHistoryScreenCallbacks(): GateHistoryScreenCallbacks {
  return {
    listGateHistory: async () => (await window.thesisApi.listGateHistory()).records,
    getGateRecord: (id) => window.thesisApi.getGateRecord(id),
    removeGateRecord: async (id) => (await window.thesisApi.removeGateRecord(id)).ok,
  };
}
