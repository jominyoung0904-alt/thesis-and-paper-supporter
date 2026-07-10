/**
 * OpenAI adapter (NFR-LLM-001).
 *
 * Calls `POST {base}/v1/chat/completions` directly via `fetch` — no `openai`
 * dependency — and normalizes the Chat Completions payload into
 * {@link LlmResponse}. The `system` instruction is folded into `messages` as a
 * leading `system` role, per the Chat Completions contract.
 */

import { isRecord, postJson, trimTrailingSlash } from './errors';
import type { AdapterOptions, LlmAdapter, LlmRequest, LlmResponse } from './types';
import { DEFAULT_TIMEOUT_MS } from './types';

interface OpenaiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function toOpenaiMessages(req: LlmRequest): OpenaiMessage[] {
  const messages: OpenaiMessage[] = [];
  if (req.system !== undefined) messages.push({ role: 'system', content: req.system });
  for (const msg of req.messages) messages.push({ role: msg.role, content: msg.content });
  return messages;
}

/** Reads the assistant text from the first choice. */
function extractText(body: unknown): string {
  if (!isRecord(body) || !Array.isArray(body.choices)) return '';
  const first = body.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) return '';
  return typeof first.message.content === 'string' ? first.message.content : '';
}

function extractUsage(body: unknown): { inputTokens: number; outputTokens: number } {
  const usage = isRecord(body) && isRecord(body.usage) ? body.usage : undefined;
  return {
    inputTokens: typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : 0,
    outputTokens: typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : 0,
  };
}

export function createOpenaiAdapter(opts: AdapterOptions): LlmAdapter {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = trimTrailingSlash(opts.baseUrl);

  return {
    provider: 'openai',
    async chat(req: LlmRequest): Promise<LlmResponse> {
      const body: Record<string, unknown> = {
        model: req.model,
        messages: toOpenaiMessages(req),
      };
      if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;

      const payload = await postJson({
        provider: 'openai',
        fetchFn,
        url: `${baseUrl}/v1/chat/completions`,
        headers: { authorization: `Bearer ${opts.apiKey}` },
        body,
        timeoutMs,
      });

      const model =
        isRecord(payload) && typeof payload.model === 'string' ? payload.model : req.model;
      return { text: extractText(payload), usage: extractUsage(payload), model };
    },
  };
}
