/**
 * Primitive types shared across two or more IPC domains, plus request/result
 * shapes too small to warrant their own domain file (`app:get-startup-state`,
 * `shell:open-external`, `memory:save-decision`).
 *
 * Payload/result shapes here deliberately mirror (rather than import) the
 * renderer's domain types and the main process's `KeyProvider`/`LlmMode` —
 * the same decoupling pattern already used across this codebase (see
 * `wizardTypes.ts`'s own doc comment) so `shared/` never depends on
 * `renderer/` or `main/` internals.
 */

/** LLM providers selectable from the renderer. Mirrors `LlmProvider` in main config. */
export type IpcLlmProvider = 'gemini' | 'claude' | 'openai';

/** Free-tier vs paid-tier usage mode. Mirrors `LlmMode` in main config. */
export type IpcLlmMode = 'free' | 'paid';

// --- app:get-startup-state ---

export interface StartupState {
  /** True when no LLM provider key has been registered yet (show the setup wizard). */
  firstRun: boolean;
}

// --- shell:open-external ---

export interface OpenExternalRequest {
  url: string;
}

// --- memory:save-decision ---

export interface SaveDecisionRequest {
  what: string;
  why: string;
}
