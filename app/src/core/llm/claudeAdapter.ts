/**
 * Anthropic Claude adapter (NFR-LLM-001).
 *
 * Calls `POST {base}/v1/messages` directly via `fetch` — no `@anthropic-ai/sdk`
 * dependency — and normalizes the Messages API payload into {@link LlmResponse}.
 */

import { isRecord, postJson, trimTrailingSlash } from './errors';
import type { AdapterOptions, LlmAdapter, LlmRequest, LlmResponse } from './types';
import { DEFAULT_MAX_TOKENS, DEFAULT_TIMEOUT_MS } from './types';

const ANTHROPIC_VERSION = '2023-06-01';

/** Joins Claude's `content` blocks, keeping only text parts. */
function extractText(body: unknown): string {
  if (!isRecord(body) || !Array.isArray(body.content)) return '';
  const parts: string[] = [];
  for (const block of body.content) {
    if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text);
    }
  }
  return parts.join('');
}

function extractUsage(body: unknown): { inputTokens: number; outputTokens: number } {
  const usage = isRecord(body) && isRecord(body.usage) ? body.usage : undefined;
  return {
    inputTokens: typeof usage?.input_tokens === 'number' ? usage.input_tokens : 0,
    outputTokens: typeof usage?.output_tokens === 'number' ? usage.output_tokens : 0,
  };
}

export function createClaudeAdapter(opts: AdapterOptions): LlmAdapter {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = trimTrailingSlash(opts.baseUrl);

  return {
    provider: 'claude',
    async chat(req: LlmRequest): Promise<LlmResponse> {
      const body: Record<string, unknown> = {
        model: req.model,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        messages: req.messages,
      };
      if (req.system !== undefined) body.system = req.system;

      const payload = await postJson({
        provider: 'claude',
        fetchFn,
        url: `${baseUrl}/v1/messages`,
        headers: { 'x-api-key': opts.apiKey, 'anthropic-version': ANTHROPIC_VERSION },
        body,
        timeoutMs,
      });

      const model =
        isRecord(payload) && typeof payload.model === 'string' ? payload.model : req.model;
      return { text: extractText(payload), usage: extractUsage(payload), model };
    },
  };
}
