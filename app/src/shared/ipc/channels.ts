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
} as const;

export type IpcChannelName = (typeof IpcChannels)[keyof typeof IpcChannels];
