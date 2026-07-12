/**
 * Pure, framework-free helpers for the "복사하신 키가 있는 것 같아요"
 * clipboard-detection banner shown on both API-key input screens (wizard
 * `KeyInputStep` and settings `LlmProviderCard`, via `useClipboardKeyBanner`).
 *
 * `looksLikeApiKey` is a best-effort heuristic used ONLY to decide whether
 * to surface the paste-suggestion banner — it is never a real validity
 * check. `wizardLogic.ts`'s `validateApiKeyFormat` (client-side format hint)
 * and the server-side connectivity test in `saveProviderAndKey` remain the
 * actual sources of truth.
 */

import type { LlmProvider } from './wizardTypes';

interface ProviderKeyPattern {
  /** Required literal prefix for a plausible key of this provider. */
  prefix: string;
  minLength: number;
  maxLength: number;
  /** Prefixes that must NOT match — disambiguates openai's `sk-` from claude's `sk-ant-`. */
  excludePrefixes?: readonly string[];
}

const PROVIDER_KEY_PATTERNS: Record<LlmProvider, ProviderKeyPattern> = {
  gemini: { prefix: 'AIza', minLength: 30, maxLength: 120 },
  claude: { prefix: 'sk-ant-', minLength: 20, maxLength: 200 },
  openai: { prefix: 'sk-', minLength: 20, maxLength: 200, excludePrefixes: ['sk-ant-'] },
};

/**
 * Whether `text` looks like a plausible API key for `provider`. Trims
 * surrounding whitespace first; rejects anything containing internal
 * whitespace (a real key never does) or the wrong length/prefix for the
 * given provider.
 */
export function looksLikeApiKey(text: string, provider: LlmProvider): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || /\s/.test(trimmed)) {
    return false;
  }

  const pattern = PROVIDER_KEY_PATTERNS[provider];
  if (trimmed.length < pattern.minLength || trimmed.length > pattern.maxLength) {
    return false;
  }
  if (!trimmed.startsWith(pattern.prefix)) {
    return false;
  }
  if (pattern.excludePrefixes?.some((excluded) => trimmed.startsWith(excluded))) {
    return false;
  }
  return true;
}

export interface ClipboardBannerVisibilityParams {
  /** The key field's current (untrimmed) value. */
  currentKey: string;
  /** Latest clipboard read (untrimmed). */
  clipboardText: string;
  provider: LlmProvider;
  /** Whether the user already dismissed/accepted the banner this session. */
  dismissed: boolean;
}

/**
 * Whether the clipboard-detection banner should currently be shown. Exposed
 * as a pure function so it stays unit-testable independent of the
 * mount/focus-listener plumbing in `useClipboardKeyBanner.ts`.
 */
export function shouldShowClipboardBanner(params: ClipboardBannerVisibilityParams): boolean {
  const { currentKey, clipboardText, provider, dismissed } = params;
  if (dismissed || currentKey.trim().length > 0) {
    return false;
  }
  return looksLikeApiKey(clipboardText, provider);
}
