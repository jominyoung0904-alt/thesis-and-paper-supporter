/**
 * Shape of `window.thesisApi`, the contextBridge surface exposed by
 * `src/main/preload.ts`. Declared once here so both the preload script
 * (implementation) and the renderer's global type declaration (consumer)
 * import the same contract instead of duplicating it.
 */

import type {
  AcademicKeyStatus,
  ChatHistoryListResult,
  ChatHistoryLoadResult,
  ChatHistoryNewResult,
  ChatHistoryRemoveResult,
  ChatSendResult,
  ClipboardReadTextResult,
  GateHistoryGetResult,
  GateHistoryListResult,
  GateHistoryRemoveResult,
  IpcAcademicKeyProvider,
  IpcGateSectionId,
  IpcLlmMode,
  IpcLlmProvider,
  IpcPaperMetadata,
  LibraryListResult,
  LibraryRemoveResult,
  LibrarySaveResult,
  LibraryUpdateMemoResult,
  LlmStatusResult,
  MockReviewHistoryGetResult,
  MockReviewHistoryListResult,
  MockReviewHistoryRemoveResult,
  ProjectArchiveResult,
  ProjectCreateResult,
  ProjectListResult,
  ProjectRenameResult,
  ProjectSwitchResult,
  QualityGateRunResult,
  ResearchHandoffStartResult,
  ResearchHistoryGetResult,
  ResearchHistoryListResult,
  ResearchHistoryRemoveResult,
  ResearchProgressPayload,
  ResearchRunResult,
  SaveAcademicKeyResult,
  SaveProviderAndKeyResult,
  StartupState,
  WritingMockReviewResult,
  WritingPolishResult,
} from './ipc-channels';

export interface ThesisApi {
  /** Whether this is the first run (no LLM provider key registered yet). */
  getStartupState(): Promise<StartupState>;
  /** Persists the chosen provider + API key and verifies connectivity. */
  saveProviderAndKey(provider: IpcLlmProvider, key: string, mode: IpcLlmMode): Promise<SaveProviderAndKeyResult>;
  /** Reports the currently active LLM provider/mode and whether a key is registered for it. */
  getLlmStatus(): Promise<LlmStatusResult>;
  /** Opens an allow-listed URL in the user's default external browser. */
  openExternal(url: string): void;
  /** Sends one "아이디어 회의" chat turn and returns the assistant's reply. */
  sendChat(text: string): Promise<ChatSendResult>;
  /**
   * Runs a full deep-research pass, streaming progress via `onProgress`.
   * `detailed` is the paid-mode "🔍+ 상세검색" toggle (`ResearchRunRequest.detailed`)
   * — optional, defaults to a standard single pass. The paid gate is enforced
   * server-side in `researchGateHandlers.ts` regardless of what the renderer sends.
   */
  runResearch(
    question: string,
    onProgress: (event: ResearchProgressPayload) => void,
    detailed?: boolean,
  ): Promise<ResearchRunResult>;
  /** Persists a confirmed research decision. */
  saveDecision(what: string, why: string): Promise<void>;
  /** Runs a section quality-gate check against user-supplied text (FR-WRT-001/002). */
  runQualityGate(sectionId: IpcGateSectionId, text: string): Promise<QualityGateRunResult>;
  /** Saves a personal academic-search API key (NFR-ACAPI-002). */
  saveAcademicKey(provider: IpcAcademicKeyProvider, key: string): Promise<SaveAcademicKeyResult>;
  /** Reports which academic-search providers currently have a key registered. */
  getAcademicKeyStatus(): Promise<AcademicKeyStatus>;
  /** Lists non-archived projects plus the currently active project id (FR-PRJ-001/002). */
  listProjects(): Promise<ProjectListResult>;
  /** Creates a new project and switches to it immediately (FR-PRJ-001). */
  createProject(name?: string): Promise<ProjectCreateResult>;
  /** Renames an existing project (FR-PRJ-004). */
  renameProject(id: string, name: string): Promise<ProjectRenameResult>;
  /** Switches the active project, re-assembling every project-scoped service (FR-PRJ-002/006). */
  switchProject(id: string): Promise<ProjectSwitchResult>;
  /** Archives (soft-deletes) a project, hiding it from the switch list (FR-PRJ-005). */
  archiveProject(id: string): Promise<ProjectArchiveResult>;
  /** Saves a paper's full metadata into the current project's library (FR-LIB-001). */
  saveToLibrary(paper: IpcPaperMetadata, sourceResearchId?: string): Promise<LibrarySaveResult>;
  /** Lists the current project's saved papers (FR-LIB-002). */
  listLibrary(): Promise<LibraryListResult>;
  /** Updates the one-line memo on a saved paper (FR-LIB-002). */
  updateLibraryMemo(id: string, memo: string): Promise<LibraryUpdateMemoResult>;
  /** Removes a saved paper (FR-LIB-002). */
  removeFromLibrary(id: string): Promise<LibraryRemoveResult>;
  /** Lists saved research records for the active project (FR-RSH-002). */
  listResearchHistory(): Promise<ResearchHistoryListResult>;
  /** Loads a single full research record by id (FR-RSH-002). */
  getResearchHistoryRecord(id: string): Promise<ResearchHistoryGetResult>;
  /** Deletes a single research record by id (FR-RSH-002). */
  removeResearchHistoryRecord(id: string): Promise<ResearchHistoryRemoveResult>;
  /** Lists saved chat session summaries for the active project (FR-CHM-002). */
  listChatHistory(): Promise<ChatHistoryListResult>;
  /** Loads one saved session's transcript and makes it the active session (FR-CHM-003). */
  loadChatHistory(id: string): Promise<ChatHistoryLoadResult>;
  /** Clears the active session so the next chat:send starts a brand-new one (FR-CHM-004). */
  newChatHistory(): Promise<ChatHistoryNewResult>;
  /** Deletes a saved session (FR-CHM-004). */
  removeChatHistory(id: string): Promise<ChatHistoryRemoveResult>;
  /** Lists every saved quality-gate check record (summary view) for the active project (FR-WRT-008). */
  listGateHistory(): Promise<GateHistoryListResult>;
  /** Loads a single full gate record (checked text + full result) by id (FR-WRT-008). */
  getGateRecord(id: string): Promise<GateHistoryGetResult>;
  /** Deletes a single gate record by id (FR-WRT-008). */
  removeGateRecord(id: string): Promise<GateHistoryRemoveResult>;
  /** Starts a "이 결과로 회의하기" handoff for a saved research record (FR-RSH-003). */
  startResearchHandoff(researchId: string): Promise<ResearchHandoffStartResult>;
  /** Runs the academic sentence-polishing engine against user-supplied text (FR-WRT-010). */
  runPolish(text: string): Promise<WritingPolishResult>;
  /** Runs the single-model "Reviewer 2" mock peer review against user-supplied text (FR-WRT-011). */
  runMockReview(text: string): Promise<WritingMockReviewResult>;
  /** Lists every saved mock-review record (summary view) for the active project (FR-WRT-011). */
  listMockReviewHistory(): Promise<MockReviewHistoryListResult>;
  /** Loads a single full mock-review record by id (FR-WRT-011). */
  getMockReviewRecord(id: string): Promise<MockReviewHistoryGetResult>;
  /** Deletes a single mock-review record by id (FR-WRT-011). */
  removeMockReviewRecord(id: string): Promise<MockReviewHistoryRemoveResult>;
  /**
   * Reads the OS clipboard's current plain-text contents — used only to
   * offer a "붙여넣기" convenience banner on API-key input screens. Never
   * log the resolved value.
   */
  readClipboardText(): Promise<ClipboardReadTextResult>;
}
