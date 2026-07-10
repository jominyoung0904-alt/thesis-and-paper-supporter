/**
 * Shared types for the first-run setup wizard (Task T9 / SPEC-TSA-001).
 *
 * This module intentionally mirrors `LlmProvider` / `LlmMode` from
 * `src/main/config/defaultSettings.ts` rather than importing across the
 * renderer/main process boundary (see `src/core/llm/types.ts` for the same
 * mirroring pattern already used elsewhere in this codebase).
 *
 * The wizard never touches IPC directly. It is a pure, host-agnostic
 * component tree that receives everything it needs to talk to the outside
 * world through `WizardCallbacks`, which the central app shell wires to the
 * real `window.api.*` preload bridge.
 */

/** LLM providers selectable in the wizard. Mirrors `LlmProvider` in main config. */
export type LlmProvider = 'gemini' | 'claude' | 'openai';

/** Free-tier vs paid-tier usage mode. Mirrors `LlmMode` in main config. */
export type LlmMode = 'free' | 'paid';

/** Result of attempting to save the provider + key from the wizard. */
export interface SaveKeyResult {
  ok: boolean;
  /** Korean-language message for the user. Required on failure, optional on success. */
  message?: string;
}

/**
 * Host-provided callbacks. Kept minimal on purpose: this sprint only covers
 * provider selection + key entry (NFR-LLM-002/006 partial), plus the
 * naverdoc academic-search connect step added by 실사용 피드백 #1 (see
 * `steps/NaverDocStep.tsx`). Full academic key management (kci/scienceon,
 * NFR-ACAPI-002) stays out of scope and deferred to Settings.
 */
export interface WizardCallbacks {
  /** Persists the chosen provider + API key and verifies connectivity. */
  saveProviderAndKey(provider: LlmProvider, key: string, mode: LlmMode): Promise<SaveKeyResult>;
  /**
   * Persists the naverdoc Client ID/Secret pair (already colon-joined by the
   * caller — see `combineNaverCredential` in `../settingsScreenLogic.ts`)
   * and verifies connectivity with a live call. Always targets `naverdoc` —
   * this step never touches kci/scienceon, so no provider argument is
   * needed.
   */
  saveAcademicKey(key: string): Promise<SaveKeyResult>;
  /** Opens a URL in the user's default external browser. */
  openExternal(url: string): void;
}

export interface WizardProps {
  callbacks: WizardCallbacks;
  /** Called once the wizard has successfully saved a working key. */
  onComplete(): void;
}

/**
 * Wizard step identifiers, in display order. `naverDoc` (실사용 피드백 #1)
 * follows a successful `keyInput` save — the LLM key is already confirmed
 * working by the time the user reaches it, so this step only ever offers an
 * *additional*, optional connection on top of that.
 */
export const WIZARD_STEPS = ['welcome', 'mode', 'keyGuide', 'keyInput', 'naverDoc'] as const;
export type WizardStepId = (typeof WIZARD_STEPS)[number];

/** Human-readable Korean labels for each provider, used across steps. */
export const PROVIDER_LABELS: Record<LlmProvider, string> = {
  gemini: 'Google Gemini',
  claude: 'Anthropic Claude',
  openai: 'OpenAI',
};

/** Where each provider issues API keys. Opened via `callbacks.openExternal`. */
export const PROVIDER_KEY_URLS: Record<LlmProvider, string> = {
  gemini: 'https://aistudio.google.com/apikey',
  claude: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
};
