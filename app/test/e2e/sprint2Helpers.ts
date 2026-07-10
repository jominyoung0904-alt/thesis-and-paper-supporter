/**
 * T63 (SPEC-TSA-002, Wave 8 최종) — shared, mock-free helpers for
 * `sprint2.spec.ts`'s cross-cutting E2E suite. Assembles the FULL
 * `registerIpcHandlers` composition root against a temp workspace, exactly
 * like `projectManagementIpc.spec.ts`'s `assemble()`, plus small fixtures
 * (paper metadata, fixed LLM script strings) reused across scenarios.
 *
 * `vi.mock` calls stay in `sprint2.spec.ts` itself (Vitest only hoists them
 * reliably within the file they're written in) — this file is intentionally
 * mock-free, mirroring the `firstRunHelpers.ts` / `writingExtTestHelpers.ts`
 * split already established in this suite.
 */

import { join } from 'node:path';

import { createDefaultSettings, type AppSettings } from '../../src/main/config/defaultSettings';
import { KeyStore } from '../../src/main/config/keyStore';
import { loadSettings, saveSettings } from '../../src/main/config/settingsLoader';
import type { PaperMetadata } from '../../src/core/academic-api/types';
import { MemoryStore } from '../../src/core/memory/store';
import { registerIpcHandlers } from '../../src/main/ipc/handlers';
import { migrateDefaultProject } from '../../src/main/project/migration';
import { resolveProjectPaths } from '../../src/main/project/projectPaths';
import { IpcChannels } from '../../src/shared/ipc-channels';
import type {
  ChatHistoryListResult,
  ChatHistoryLoadResult,
  ChatHistoryNewResult,
  ChatHistoryRemoveResult,
  ChatSendResult,
  GateHistoryGetResult,
  GateHistoryListResult,
  LibraryListResult,
  LibrarySaveResult,
  MockReviewHistoryGetResult,
  MockReviewHistoryListResult,
  ProjectArchiveResult,
  ProjectCreateResult,
  ProjectListResult,
  ProjectRenameResult,
  ProjectSwitchResult,
  QualityGateRunResult,
  ResearchHandoffStartResult,
  ResearchHistoryListResult,
  ResearchRunResult,
  WritingMockReviewResult,
  WritingPolishResult,
} from '../../src/shared/ipc-channels';
import { createReadyWorkspace, MockCryptoBackend, type TempWorkspace } from './firstRunHelpers';

export type IpcHandlerMap = Map<string, (event: unknown, payload: unknown) => Promise<unknown>>;

export interface Assembled {
  ws: TempWorkspace;
  keyStore: KeyStore;
  getSettings: () => AppSettings;
  invoke: <T>(channel: string, payload?: unknown) => Promise<T>;
}

type Invoke = Assembled['invoke'];

/**
 * Assembles one IPC handler set exactly the way `src/main/index.ts`
 * bootstraps it, against a fresh temp workspace. When `seedLegacyDefault` is
 * set, a Sprint 1 `data/projects/default/memory.json` is written and
 * `migrateDefaultProject` runs BEFORE `registerIpcHandlers` — mirroring
 * `index.ts`'s real bootstrap order (S3, FR-PRJ-003), so `ProjectContext`
 * observes the already-migrated index on `initialize()`.
 */
export function assembleSprint2(prefix: string, ipcHandlers: IpcHandlerMap, seedLegacyDefault = false): Assembled {
  const ws = createReadyWorkspace(prefix);

  if (seedLegacyDefault) {
    const legacyPaths = resolveProjectPaths(ws.paths.dataDir, 'default');
    const legacyMemory = new MemoryStore(legacyPaths.memoryFile);
    legacyMemory.load();
    legacyMemory.addResearchQuestion({ text: 'Sprint 1 시절 연구질문' });
    legacyMemory.save();
    migrateDefaultProject(ws.paths.dataDir);
  }

  saveSettings(ws.paths.settingsFile, createDefaultSettings());
  let settings = loadSettings(ws.paths.settingsFile).settings;
  const keyStore = new KeyStore(join(ws.paths.dataDir, 'keys.json'), new MockCryptoBackend());

  registerIpcHandlers({
    keyStore,
    settingsFile: ws.paths.settingsFile,
    getSettings: () => settings,
    setSettings: (next) => {
      settings = next;
    },
    dataDir: ws.paths.dataDir,
  });

  return {
    ws,
    keyStore,
    getSettings: () => settings,
    invoke: async <T>(channel: string, payload?: unknown): Promise<T> => {
      const handler = ipcHandlers.get(channel);
      if (!handler) throw new Error(`handler not registered for channel: ${channel}`);
      return handler({ sender: { send: () => undefined } }, payload) as Promise<T>;
    },
  };
}

/** Re-loads a project's memory file fresh from disk and returns its saved decisions' `what` fields. */
export function readDecisionWhats(dataDir: string, projectId: string): string[] {
  const store = new MemoryStore(resolveProjectPaths(dataDir, projectId).memoryFile);
  store.load();
  return store.listDecisions().map((d) => d.what);
}

// --- thin per-channel `invoke` wrappers — keep `sprint2.spec.ts` free of repeated
// `IpcChannels.X` + payload-shape + generic-type boilerplate at every call site ---

export const projectList = (invoke: Invoke) => invoke<ProjectListResult>(IpcChannels.PROJECT_LIST);
export const createProject = (invoke: Invoke, name: string) =>
  invoke<ProjectCreateResult>(IpcChannels.PROJECT_CREATE, { name });
export const switchProject = (invoke: Invoke, id: string) =>
  invoke<ProjectSwitchResult>(IpcChannels.PROJECT_SWITCH, { id });
export const renameProject = (invoke: Invoke, id: string, name: string) =>
  invoke<ProjectRenameResult>(IpcChannels.PROJECT_RENAME, { id, name });
export const archiveProject = (invoke: Invoke, id: string) =>
  invoke<ProjectArchiveResult>(IpcChannels.PROJECT_ARCHIVE, { id });

export const sendChat = (invoke: Invoke, text: string) => invoke<ChatSendResult>(IpcChannels.CHAT_SEND, { text });
export const saveDecision = (invoke: Invoke, what: string, why: string) =>
  invoke(IpcChannels.MEMORY_SAVE_DECISION, { what, why });
export const chatList = (invoke: Invoke) => invoke<ChatHistoryListResult>(IpcChannels.CHAT_HISTORY_LIST);
export const loadChat = (invoke: Invoke, id: string) =>
  invoke<ChatHistoryLoadResult>(IpcChannels.CHAT_HISTORY_LOAD, { id });
export const newChat = (invoke: Invoke) => invoke<ChatHistoryNewResult>(IpcChannels.CHAT_HISTORY_NEW);
export const removeChat = (invoke: Invoke, id: string) =>
  invoke<ChatHistoryRemoveResult>(IpcChannels.CHAT_HISTORY_REMOVE, { id });

export const saveLibraryPaper = (invoke: Invoke, p: PaperMetadata) =>
  invoke<LibrarySaveResult>(IpcChannels.LIBRARY_SAVE, { paper: p });
export const libraryList = (invoke: Invoke) => invoke<LibraryListResult>(IpcChannels.LIBRARY_LIST);

export const runIntroGate = (invoke: Invoke, text: string) =>
  invoke<QualityGateRunResult>(IpcChannels.QUALITY_GATE_RUN, { sectionId: 'introduction', text });
export const gateHistoryList = (invoke: Invoke) => invoke<GateHistoryListResult>(IpcChannels.GATE_HISTORY_LIST);
export const gateHistoryGet = (invoke: Invoke, id: string) =>
  invoke<GateHistoryGetResult>(IpcChannels.GATE_HISTORY_GET, { id });

export const researchRun = (invoke: Invoke, question: string) =>
  invoke<ResearchRunResult>(IpcChannels.RESEARCH_RUN, { question });
export const researchHistoryList = (invoke: Invoke) =>
  invoke<ResearchHistoryListResult>(IpcChannels.RESEARCH_HISTORY_LIST);
export const handoffStart = (invoke: Invoke, researchId: string) =>
  invoke<ResearchHandoffStartResult>(IpcChannels.RESEARCH_HANDOFF_START, { researchId });

export const writingPolish = (invoke: Invoke, text: string) =>
  invoke<WritingPolishResult>(IpcChannels.WRITING_POLISH, { text });
export const writingMockReview = (invoke: Invoke, text: string) =>
  invoke<WritingMockReviewResult>(IpcChannels.WRITING_MOCK_REVIEW, { text });
export const mockReviewList = (invoke: Invoke) =>
  invoke<MockReviewHistoryListResult>(IpcChannels.MOCK_REVIEW_HISTORY_LIST);
export const mockReviewGet = (invoke: Invoke, id: string) =>
  invoke<MockReviewHistoryGetResult>(IpcChannels.MOCK_REVIEW_HISTORY_GET, { id });

export interface ProjectCounts {
  chats: number;
  library: number;
  gate: number;
  decisions: string[];
}

/** Snapshots one project's chat/library/gate-history counts plus its on-disk decisions (S2 isolation checks). */
export async function projectCounts(invoke: Invoke, dataDir: string, projectId: string): Promise<ProjectCounts> {
  const [chats, library, gate] = await Promise.all([chatList(invoke), libraryList(invoke), gateHistoryList(invoke)]);
  return {
    chats: chats.sessions.length,
    library: library.papers.length,
    gate: gate.records.length,
    decisions: readDecisionWhats(dataDir, projectId),
  };
}

/** Minimal `PaperMetadata` fixture, mirroring `researchHandoffIpc.spec.ts`'s `paper()` helper. */
export function paper(title: string, source: PaperMetadata['source'] = 'openalex'): PaperMetadata {
  return {
    source,
    externalId: `id-${source}-${title}`,
    title,
    authors: ['홍길동'],
    year: 2024,
    abstract: null,
    venue: null,
    url: `https://example.com/${title}`,
    citationCount: 0,
  };
}

/** A `{index, relevance: 'high'}[]` JSON reply covering exactly `count` screened papers (screening.ts's expected shape). */
export function screeningAllHighJson(count: number): string {
  return JSON.stringify(Array.from({ length: count }, (_, i) => ({ index: i + 1, relevance: 'high' })));
}

/** Fixed query-gen JSON reply — one Korean + one English term, so each mocked academic client gets exactly one search call. */
export const RESEARCH_QUERY_JSON = JSON.stringify({ ko: ['국문검색어'], en: ['english term'] });

/** Section text with one citation per paragraph — satisfies the 'citation-presence' rule criterion. */
export const CITED_TEXT =
  '선행연구는 이 문제를 다루지 않았다 (홍길동, 2020).\n\n본 연구는 이 빈틈을 다룬다 (김민영, 2021).';

/** LLM reply that passes both llm-judged introduction-gate criteria (research-gap, contribution). */
export const GATE_PASS_JSON = JSON.stringify({
  results: [
    { criterionId: 'research-gap', passed: true, feedback: '연구 갭이 명확히 드러나요.' },
    { criterionId: 'contribution', passed: true, feedback: '기여가 잘 명시되어 있어요.' },
  ],
});

export const POLISH_JSON = JSON.stringify({
  polishedText: '본 연구는 중요한 논제를 다룬다.',
  changes: [{ before: '진짜 중요한', after: '중요한', reason: '구어체를 학술 문체로 다듬었어요.' }],
  language: 'ko',
});

/** One mocked search-client call, recorded by the `sprint2.spec.ts` academic-client `vi.mock` factories. */
export interface AcademicSearchCall {
  source: 'openalex' | 'semanticscholar';
  query: string;
}

/** Shared, mutable state read by `sprint2.spec.ts`'s `vi.mock` factories for OpenAlex/Semantic Scholar. */
export interface AcademicMockState {
  calls: AcademicSearchCall[];
  papers: { openalex: PaperMetadata[]; semanticscholar: PaperMetadata[] };
}

/** Resets `state` in place to its default 2-paper fixture (1 per mocked source), for reuse in `beforeEach`. */
export function resetAcademicMockState(state: AcademicMockState): void {
  state.calls.length = 0;
  state.papers.openalex = [paper('OpenAlex 논문', 'openalex')];
  state.papers.semanticscholar = [paper('S2 Paper', 'semanticscholar')];
}
