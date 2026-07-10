/**
 * Public entry point for the multi-provider LLM adapter layer (NFR-LLM-001).
 *
 * Downstream modules import ONLY from here:
 *
 *   import { createAdapter } from '@/core/llm';
 *   const adapter = createAdapter(settings.llm.provider, { baseUrl, apiKey });
 *   const res = await adapter.chat({ model, system, messages });
 *
 * The concrete adapter files and wire formats are implementation details and
 * must not be imported directly by consumers.
 */

import { createClaudeAdapter } from './claudeAdapter';
import { createGeminiAdapter } from './geminiAdapter';
import { createOpenaiAdapter } from './openaiAdapter';
import type { AdapterOptions, LlmAdapter, LlmProvider } from './types';

/** Routes a provider name to its adapter. Throws on an unknown provider. */
// @AX:ANCHOR: [AUTO] public entry point for the LLM adapter layer — all consumers must import from here. Related: NFR-LLM-001
export function createAdapter(provider: LlmProvider, opts: AdapterOptions): LlmAdapter {
  switch (provider) {
    case 'claude':
      return createClaudeAdapter(opts);
    case 'gemini':
      return createGeminiAdapter(opts);
    case 'openai':
      return createOpenaiAdapter(opts);
    default: {
      // Exhaustiveness guard: adding a provider to the union without a case
      // here becomes a compile-time error.
      const exhaustive: never = provider;
      throw new Error(`Unknown LLM provider: ${String(exhaustive)}`);
    }
  }
}

export { createClaudeAdapter } from './claudeAdapter';
export { createGeminiAdapter } from './geminiAdapter';
export { createOpenaiAdapter } from './openaiAdapter';
export type {
  AdapterOptions,
  LlmAdapter,
  LlmMessage,
  LlmProvider,
  LlmRequest,
  LlmResponse,
  LlmUsage,
} from './types';
export { DEFAULT_MAX_TOKENS, DEFAULT_TIMEOUT_MS } from './types';
export type { LlmApiErrorInit, LlmErrorKind } from './errors';
export { LlmApiError } from './errors';
