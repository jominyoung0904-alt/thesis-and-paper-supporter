import type { LlmProvider } from './defaultSettings';

/**
 * Default model id per LLM provider, used by the chat/research IPC handlers
 * until a remote-config-driven model list is wired up.
 *
 * TODO T27: load model ids from remote config instead of hardcoding (NFR-RISK-009).
 */
export const DEFAULT_MODELS: Record<LlmProvider, string> = {
  gemini: 'gemini-2.5-flash',
  claude: 'claude-sonnet-4-5',
  openai: 'gpt-4o-mini',
};
