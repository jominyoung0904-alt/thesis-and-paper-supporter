import type { LlmProvider } from './defaultSettings';

/**
 * Default model id per LLM provider, used by the chat/research IPC handlers
 * as a fallback when `settings.models[provider]` is not set.
 *
 * These values can be refreshed at runtime via the remote-config `models`
 * section (see `remoteConfig.ts`'s `mergeRemoteIntoSettings`), so a stale
 * hardcoded default here no longer requires a new app release to fix.
 */
export const DEFAULT_MODELS: Record<LlmProvider, string> = {
  gemini: 'gemini-2.5-flash', // Verified free-tier model, kept as-is (NFR-RISK-009).
  claude: 'claude-sonnet-5', // Updated from claude-sonnet-4-5 — remote-updatable.
  openai: 'gpt-5-mini', // Updated from gpt-4o-mini — remote-updatable.
};
