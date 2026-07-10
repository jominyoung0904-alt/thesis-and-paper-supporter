/**
 * IPC channel names and payload/result types shared between the Electron
 * main process and the renderer.
 *
 * This file is the single source of truth for channel identifiers. Both
 * `src/main/**` and `src/renderer/**` MUST import channel names from here
 * instead of hardcoding string literals, so a rename only touches one file.
 *
 * Payload/result shapes here deliberately mirror (rather than import) the
 * renderer's domain types (`wizardTypes.ts`, `chat/chatTypes.ts`) and the
 * main process's `KeyProvider`/`LlmMode` — the same decoupling pattern
 * already used across this codebase (see `wizardTypes.ts`'s own doc comment)
 * so `shared/` never depends on `renderer/` or `main/` internals.
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
} as const;

export type IpcChannelName = (typeof IpcChannels)[keyof typeof IpcChannels];

/** LLM providers selectable from the renderer. Mirrors `LlmProvider` in main config. */
export type IpcLlmProvider = 'gemini' | 'claude' | 'openai';

/** Free-tier vs paid-tier usage mode. Mirrors `LlmMode` in main config. */
export type IpcLlmMode = 'free' | 'paid';

// --- app:get-startup-state ---

export interface StartupState {
  /** True when no LLM provider key has been registered yet (show the setup wizard). */
  firstRun: boolean;
}

// --- settings:save-provider-and-key ---

export interface SaveProviderAndKeyRequest {
  provider: IpcLlmProvider;
  key: string;
  mode: IpcLlmMode;
}

export interface SaveProviderAndKeyResult {
  ok: boolean;
  /** Korean-language message. Required on failure, optional on success. */
  message?: string;
}

// --- shell:open-external ---

export interface OpenExternalRequest {
  url: string;
}

// --- chat:send ---

export interface ChatSendRequest {
  text: string;
}

export interface IpcSuggestedDecision {
  what: string;
  why: string;
}

export interface ChatSendResult {
  reply: string;
  suggestedDecision?: IpcSuggestedDecision;
}

// --- research:run / research:progress ---

export interface ResearchRunRequest {
  question: string;
}

export interface ResearchProgressPayload {
  stage: string;
  detail?: string;
}

export interface ResearchPaperPayload {
  title: string;
  authors: string[];
  year: number | null;
  url: string | null;
  source: string;
}

export interface ResearchFailedSourcePayload {
  source: string;
  reason: string;
}

export interface ResearchRunResult {
  report: string;
  papers: ResearchPaperPayload[];
  failedSources: ResearchFailedSourcePayload[];
}

// --- memory:save-decision ---

export interface SaveDecisionRequest {
  what: string;
  why: string;
}

// --- quality-gate:run ---

/**
 * Section ids whose quality gate can currently be run through IPC.
 * Whitelisted at the handler boundary (only 'introduction' ships in phase 1
 * — see `core/writing/gateDefinitions.ts`).
 */
export type IpcGateSectionId = 'introduction';

export interface QualityGateRunRequest {
  sectionId: IpcGateSectionId;
  text: string;
}

export interface IpcCriterionResult {
  criterionId: string;
  passed: boolean;
  feedback: string;
}

export interface QualityGateRunResult {
  sectionId: string;
  passed: boolean;
  results: IpcCriterionResult[];
  summary: string;
}
