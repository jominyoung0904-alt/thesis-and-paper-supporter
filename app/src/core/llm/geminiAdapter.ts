/**
 * Google Gemini adapter (NFR-LLM-001).
 *
 * Calls `POST {base}/v1beta/models/{model}:generateContent` directly via
 * `fetch` — no `@google/generative-ai` dependency — and normalizes the
 * generateContent payload into {@link LlmResponse}. Note the role remap:
 * Gemini uses `model` where the common shape uses `assistant`.
 */

import { isRecord, postJson, trimTrailingSlash } from './errors';
import type { AdapterOptions, LlmAdapter, LlmMessage, LlmRequest, LlmResponse } from './types';
import { DEFAULT_TIMEOUT_MS } from './types';

interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

function toGeminiContents(messages: LlmMessage[]): GeminiContent[] {
  return messages.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));
}

/** Joins the text parts of the first candidate. */
function extractText(body: unknown): string {
  if (!isRecord(body) || !Array.isArray(body.candidates)) return '';
  const first = body.candidates[0];
  if (!isRecord(first) || !isRecord(first.content) || !Array.isArray(first.content.parts)) {
    return '';
  }
  const parts: string[] = [];
  for (const part of first.content.parts) {
    if (isRecord(part) && typeof part.text === 'string') parts.push(part.text);
  }
  return parts.join('');
}

function extractUsage(body: unknown): { inputTokens: number; outputTokens: number } {
  const meta = isRecord(body) && isRecord(body.usageMetadata) ? body.usageMetadata : undefined;
  return {
    inputTokens: typeof meta?.promptTokenCount === 'number' ? meta.promptTokenCount : 0,
    outputTokens: typeof meta?.candidatesTokenCount === 'number' ? meta.candidatesTokenCount : 0,
  };
}

export function createGeminiAdapter(opts: AdapterOptions): LlmAdapter {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = trimTrailingSlash(opts.baseUrl);

  return {
    provider: 'gemini',
    async chat(req: LlmRequest): Promise<LlmResponse> {
      const body: Record<string, unknown> = { contents: toGeminiContents(req.messages) };
      if (req.system !== undefined) {
        body.systemInstruction = { parts: [{ text: req.system }] };
      }
      if (req.maxTokens !== undefined) {
        body.generationConfig = { maxOutputTokens: req.maxTokens };
      }

      const url = `${baseUrl}/v1beta/models/${req.model}:generateContent`;
      const payload = await postJson({
        provider: 'gemini',
        fetchFn,
        url,
        headers: { 'x-goog-api-key': opts.apiKey },
        body,
        timeoutMs,
      });

      const model =
        isRecord(payload) && typeof payload.modelVersion === 'string'
          ? payload.modelVersion
          : req.model;
      return { text: extractText(payload), usage: extractUsage(payload), model };
    },
  };
}
