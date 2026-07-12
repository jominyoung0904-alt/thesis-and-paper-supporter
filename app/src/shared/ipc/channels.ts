/**
 * IPC channel name constants shared between the Electron main process and
 * the renderer. This is the single source of truth for channel identifiers
 * — both `src/main/**` and `src/renderer/**` MUST import channel names from
 * here (via `src/shared/ipc-channels.ts`'s re-export) instead of hardcoding
 * string literals, so a rename only touches one file.
 *
 * Kept as a single flat table (not split per domain like the payload/result
 * type files in this directory) — the sandboxed preload inlines these as
 * literals (see `src/main/preload.ts`'s doc comment) and
 * `test/unit/preloadChannels.test.ts` diffs every channel value against this
 * one source, which stays easiest to keep in sync as one file.
 */

export const IpcChannels = {
  /** Whether this is the first run (no LLM provider key registered yet). */
  APP_GET_STARTUP_STATE: 'app:get-startup-state',
  /** Saves an LLM provider + API key and verifies connectivity. */
  SETTINGS_SAVE_PROVIDER_AND_KEY: 'settings:save-provider-and-key',
  /** Reports the currently active LLM provider/mode and whether a key is registered for it. */
  SETTINGS_GET_LLM_STATUS: 'settings:get-llm-status',
  /** Opens an allow-listed URL in the user's default external browser. */
  SHELL_OPEN_EXTERNAL: 'shell:open-external',
  /** Sends one "아이디어 회의" chat turn. */
  CHAT_SEND: 'chat:send',
  /** Runs a full deep-research pass. */
  RESEARCH_RUN: 'research:run',
  /** Main -> renderer: streamed progress events for an in-flight research:run call. */
  RESEARCH_PROGRESS: 'research:progress',
  /** Persists a confirmed research decision into project memory. */
  MEMORY_SAVE_DECISION: 'memory:save-decision',
  /** Runs a section quality-gate check against user-supplied text (FR-WRT-001/002). */
  QUALITY_GATE_RUN: 'quality-gate:run',
  /** Saves a personal academic-search API key (kci/scienceon/naverdoc) (NFR-ACAPI-002). */
  SETTINGS_SAVE_ACADEMIC_KEY: 'settings:save-academic-key',
  /** Reports which academic-search providers currently have a key registered. */
  SETTINGS_GET_ACADEMIC_KEY_STATUS: 'settings:get-academic-key-status',
  /** Lists non-archived projects plus the currently active project id (FR-PRJ-001/002). */
  PROJECT_LIST: 'project:list',
  /** Creates a new project and switches to it immediately (FR-PRJ-001). */
  PROJECT_CREATE: 'project:create',
  /** Renames an existing project (FR-PRJ-004). */
  PROJECT_RENAME: 'project:rename',
  /** Switches the active project, re-assembling every project-scoped service (FR-PRJ-002/006). */
  PROJECT_SWITCH: 'project:switch',
  /** Archives (soft-deletes) a project, hiding it from the switch list (FR-PRJ-005). */
  PROJECT_ARCHIVE: 'project:archive',
  /** Saves a paper's full metadata into the current project's library (FR-LIB-001). */
  LIBRARY_SAVE: 'library:save',
  /** Lists the current project's saved papers, most recently saved first (FR-LIB-002). */
  LIBRARY_LIST: 'library:list',
  /** Updates the one-line memo on a saved paper (FR-LIB-002). */
  LIBRARY_UPDATE_MEMO: 'library:update-memo',
  /** Removes a saved paper (FR-LIB-002). */
  LIBRARY_REMOVE: 'library:remove',
  /** Lists every saved research record (summary view) for the active project (FR-RSH-002). */
  RESEARCH_HISTORY_LIST: 'research-history:list',
  /** Loads a single full research record by id (FR-RSH-002). */
  RESEARCH_HISTORY_GET: 'research-history:get',
  /** Deletes a single research record by id (FR-RSH-002). */
  RESEARCH_HISTORY_REMOVE: 'research-history:remove',
  /** Lists saved chat session summaries for the active project (FR-CHM-002). */
  CHAT_HISTORY_LIST: 'chat-history:list',
  /** Loads one saved session's transcript and makes it the active session (FR-CHM-003). */
  CHAT_HISTORY_LOAD: 'chat-history:load',
  /** Clears the active session so the next chat:send starts a brand-new one (FR-CHM-004). */
  CHAT_HISTORY_NEW: 'chat-history:new',
  /** Deletes a saved session (FR-CHM-004). */
  CHAT_HISTORY_REMOVE: 'chat-history:remove',
  /** Lists every saved quality-gate record (summary view) for the active project (FR-WRT-008). */
  GATE_HISTORY_LIST: 'gate-history:list',
  /** Loads a single full gate record (checked text + full result) by id (FR-WRT-008). */
  GATE_HISTORY_GET: 'gate-history:get',
  /** Deletes a single gate record by id (FR-WRT-008). */
  GATE_HISTORY_REMOVE: 'gate-history:remove',
  /** Starts a "이 결과로 회의하기" handoff for a saved research record (FR-RSH-003). */
  RESEARCH_HANDOFF_START: 'research-handoff:start',
  /** Runs the academic sentence-polishing engine against user-supplied text (FR-WRT-010). */
  WRITING_POLISH: 'writing:polish',
  /** Runs the single-model "Reviewer 2" mock peer review against user-supplied text (FR-WRT-011). */
  WRITING_MOCK_REVIEW: 'writing:mock-review',
  /** Lists every saved mock-review record (summary view) for the active project (FR-WRT-011). */
  MOCK_REVIEW_HISTORY_LIST: 'writing:mock-review-history:list',
  /** Loads a single full mock-review record by id (FR-WRT-011). */
  MOCK_REVIEW_HISTORY_GET: 'writing:mock-review-history:get',
  /** Deletes a single mock-review record by id (FR-WRT-011). */
  MOCK_REVIEW_HISTORY_REMOVE: 'writing:mock-review-history:remove',
  /**
   * Reads the OS clipboard's current plain-text contents — used only to
   * offer a "붙여넣기" convenience banner on API-key input screens. Contents
   * are never logged or persisted (see `main/ipc/clipboardHandlers.ts`).
   */
  CLIPBOARD_READ_TEXT: 'clipboard:read-text',
} as const;

export type IpcChannelName = (typeof IpcChannels)[keyof typeof IpcChannels];
