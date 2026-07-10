import { describe, expect, it, vi } from 'vitest';

import { createAdapter } from '../../src/core/llm';
import { createClaudeAdapter } from '../../src/core/llm/claudeAdapter';
import { createGeminiAdapter } from '../../src/core/llm/geminiAdapter';
import { createOpenaiAdapter } from '../../src/core/llm/openaiAdapter';
import { LlmApiError } from '../../src/core/llm/errors';
import type { LlmRequest } from '../../src/core/llm/types';

/**
 * Builds a minimal `Response`-shaped mock. `body` is stringified so the adapter
 * transport (which reads `.text()` then `JSON.parse`) exercises its real path.
 */
function mockResponse(init: {
  ok: boolean;
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}): Response {
  return {
    ok: init.ok,
    status: init.status,
    headers: new Headers(init.headers ?? {}),
    text: () => Promise.resolve(JSON.stringify(init.body)),
  } as unknown as Response;
}

function okFetch(body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue(mockResponse({ ok: true, status: 200, body })) as unknown as typeof fetch;
}

function errFetch(status: number, body: unknown, headers?: Record<string, string>): typeof fetch {
  return vi
    .fn()
    .mockResolvedValue(mockResponse({ ok: false, status, body, headers })) as unknown as typeof fetch;
}

const REQ: LlmRequest = {
  model: 'test-model',
  system: 'You are helpful.',
  messages: [{ role: 'user', content: 'Hello' }],
};

describe('claude adapter — success', () => {
  it('parses text and usage, hits /v1/messages with auth + version headers', async () => {
    const fetchFn = okFetch({
      model: 'claude-3-5-sonnet',
      content: [{ type: 'text', text: 'Hi ' }, { type: 'text', text: 'there' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const adapter = createClaudeAdapter({ baseUrl: 'https://api.anthropic.com/', apiKey: 'sk-a', fetchFn });

    const res = await adapter.chat(REQ);

    expect(res).toEqual({
      text: 'Hi there',
      usage: { inputTokens: 10, outputTokens: 5 },
      model: 'claude-3-5-sonnet',
    });
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk-a');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'test-model', system: 'You are helpful.', max_tokens: 4096 });
  });
});

describe('gemini adapter — success', () => {
  it('parses candidate text/usage and remaps assistant→model role', async () => {
    const fetchFn = okFetch({
      modelVersion: 'gemini-1.5-flash',
      candidates: [{ content: { role: 'model', parts: [{ text: 'Bonjour' }] } }],
      usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 4 },
    });
    const adapter = createGeminiAdapter({ baseUrl: 'https://gen.example', apiKey: 'g-key', fetchFn });

    const res = await adapter.chat({
      model: 'gemini-1.5-flash',
      messages: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Salut' }],
    });

    expect(res.text).toBe('Bonjour');
    expect(res.usage).toEqual({ inputTokens: 8, outputTokens: 4 });
    expect(res.model).toBe('gemini-1.5-flash');
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('https://gen.example/v1beta/models/gemini-1.5-flash:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('g-key');
    const body = JSON.parse(init.body);
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'Hi' }] },
      { role: 'model', parts: [{ text: 'Salut' }] },
    ]);
  });
});

describe('openai adapter — success', () => {
  it('parses choice content/usage and folds system into messages', async () => {
    const fetchFn = okFetch({
      model: 'gpt-4o',
      choices: [{ message: { role: 'assistant', content: 'Hey' } }],
      usage: { prompt_tokens: 12, completion_tokens: 3 },
    });
    const adapter = createOpenaiAdapter({ baseUrl: 'https://api.openai.com', apiKey: 'sk-o', fetchFn });

    const res = await adapter.chat(REQ);

    expect(res).toEqual({ text: 'Hey', usage: { inputTokens: 12, outputTokens: 3 }, model: 'gpt-4o' });
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.authorization).toBe('Bearer sk-o');
    const body = JSON.parse(init.body);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Hello' });
  });
});

describe('error normalization — rate limit', () => {
  it('maps 429 with Retry-After header to kind:rate-limit and retryAfterSec', async () => {
    const fetchFn = errFetch(429, { error: { message: 'slow down' } }, { 'retry-after': '30' });
    const adapter = createOpenaiAdapter({ baseUrl: 'https://api.openai.com', apiKey: 'k', fetchFn });

    const err = await adapter.chat(REQ).catch((e) => e);

    expect(err).toBeInstanceOf(LlmApiError);
    expect(err.kind).toBe('rate-limit');
    expect(err.provider).toBe('openai');
    expect(err.status).toBe(429);
    expect(err.retryAfterSec).toBe(30);
    expect(err.providerMessage).toBe('slow down');
  });

  it('reads Gemini per-minute RetryInfo delay from the body when no header is present', async () => {
    const fetchFn = errFetch(429, {
      error: {
        message: 'Quota exceeded for metric ... PerMinute',
        status: 'RESOURCE_EXHAUSTED',
        details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '17s' }],
      },
    });
    const adapter = createGeminiAdapter({ baseUrl: 'https://gen.example', apiKey: 'k', fetchFn });

    const err: LlmApiError = await adapter.chat(REQ).catch((e) => e);

    expect(err.kind).toBe('rate-limit');
    expect(err.retryAfterSec).toBe(17);
  });
});

describe('error normalization — auth', () => {
  it.each([401, 403])('maps HTTP %i to kind:auth', async (status) => {
    const fetchFn = errFetch(status, { error: { message: 'invalid api key' } });
    const adapter = createClaudeAdapter({ baseUrl: 'https://api.anthropic.com', apiKey: 'bad', fetchFn });

    const err: LlmApiError = await adapter.chat(REQ).catch((e) => e);

    expect(err.kind).toBe('auth');
    expect(err.status).toBe(status);
  });
});

describe('error normalization — quota exhausted', () => {
  it('distinguishes Gemini free-tier daily quota from a rate limit', async () => {
    const fetchFn = errFetch(429, {
      error: {
        message: 'Quota exceeded: GenerateRequestsPerDayPerProjectPerModel free_tier',
        status: 'RESOURCE_EXHAUSTED',
      },
    });
    const adapter = createGeminiAdapter({ baseUrl: 'https://gen.example', apiKey: 'k', fetchFn });

    const err: LlmApiError = await adapter.chat(REQ).catch((e) => e);

    expect(err.kind).toBe('quota-exhausted');
  });

  it('maps OpenAI insufficient_quota (429) to quota-exhausted, not rate-limit', async () => {
    const fetchFn = errFetch(429, {
      error: { message: 'You exceeded your current quota', type: 'insufficient_quota' },
    });
    const adapter = createOpenaiAdapter({ baseUrl: 'https://api.openai.com', apiKey: 'k', fetchFn });

    const err: LlmApiError = await adapter.chat(REQ).catch((e) => e);

    expect(err.kind).toBe('quota-exhausted');
  });
});

describe('error normalization — bad request and server', () => {
  it('maps 400 to bad-request', async () => {
    const fetchFn = errFetch(400, { error: { message: 'invalid model' } });
    const adapter = createClaudeAdapter({ baseUrl: 'https://api.anthropic.com', apiKey: 'k', fetchFn });
    const err: LlmApiError = await adapter.chat(REQ).catch((e) => e);
    expect(err.kind).toBe('bad-request');
  });

  it('maps 5xx (incl. Anthropic 529 overloaded) to server', async () => {
    const fetchFn = errFetch(529, { error: { message: 'overloaded' } });
    const adapter = createClaudeAdapter({ baseUrl: 'https://api.anthropic.com', apiKey: 'k', fetchFn });
    const err: LlmApiError = await adapter.chat(REQ).catch((e) => e);
    expect(err.kind).toBe('server');
  });
});

describe('error normalization — network', () => {
  it('maps a pre-response fetch rejection to kind:network', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(new Error('getaddrinfo ENOTFOUND')) as unknown as typeof fetch;
    const adapter = createGeminiAdapter({ baseUrl: 'https://gen.example', apiKey: 'k', fetchFn });

    const err: LlmApiError = await adapter.chat(REQ).catch((e) => e);

    expect(err).toBeInstanceOf(LlmApiError);
    expect(err.kind).toBe('network');
    expect(err.providerMessage).toMatch(/ENOTFOUND/);
  });
});

describe('error normalization — timeout', () => {
  it('aborts after timeoutMs and throws kind:timeout', async () => {
    const fetchFn = vi.fn().mockImplementation((_url: string, init: { signal: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const abortError = new Error('The operation was aborted');
          abortError.name = 'AbortError';
          reject(abortError);
        });
      });
    }) as unknown as typeof fetch;
    const adapter = createOpenaiAdapter({
      baseUrl: 'https://api.openai.com',
      apiKey: 'k',
      fetchFn,
      timeoutMs: 5,
    });

    const err: LlmApiError = await adapter.chat(REQ).catch((e) => e);

    expect(err.kind).toBe('timeout');
    expect(err.provider).toBe('openai');
  });
});

describe('factory routing', () => {
  it.each(['claude', 'gemini', 'openai'] as const)('createAdapter(%s) yields matching provider', (provider) => {
    const adapter = createAdapter(provider, { baseUrl: 'https://x.example', apiKey: 'k' });
    expect(adapter.provider).toBe(provider);
    expect(typeof adapter.chat).toBe('function');
  });

  it('throws on an unknown provider', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => createAdapter('mistral' as any, { baseUrl: 'https://x', apiKey: 'k' })).toThrow(
      /Unknown LLM provider/,
    );
  });
});
