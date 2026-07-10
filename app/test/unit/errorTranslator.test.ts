import { describe, expect, it, vi } from 'vitest';

import { translateLlmError } from '../../src/core/llm/errorTranslator';
import { withRetry } from '../../src/core/llm/retry';
import { LlmApiError } from '../../src/core/llm/errors';
import type { LlmProvider } from '../../src/core/llm/types';

function apiError(
  kind: 'rate-limit' | 'auth' | 'quota-exhausted' | 'bad-request' | 'server' | 'network' | 'timeout' | 'unknown',
  extra: Partial<{ retryAfterSec: number; providerMessage: string }> = {},
): LlmApiError {
  const provider: LlmProvider = 'gemini';
  return new LlmApiError({
    kind,
    provider,
    providerMessage: extra.providerMessage ?? 'RESOURCE_EXHAUSTED: quota exceeded',
    retryAfterSec: extra.retryAfterSec,
  });
}

describe('translateLlmError — Korean copy per kind', () => {
  it('quota-exhausted: explains reset time, non-retryable', () => {
    const t = translateLlmError(apiError('quota-exhausted'));
    expect(t.kind).toBe('quota-exhausted');
    expect(t.canRetry).toBe(false);
    expect(t.title).toContain('무료 사용량');
    expect(t.message).toContain('내일 오후 4~5시');
  });

  it('rate-limit: reflects retryAfterSec in the message and marks retryable', () => {
    const t = translateLlmError(apiError('rate-limit', { retryAfterSec: 12 }));
    expect(t.kind).toBe('rate-limit');
    expect(t.canRetry).toBe(true);
    expect(t.retryAfterSec).toBe(12);
    expect(t.message).toContain('12초 뒤');
  });

  it('rate-limit: falls back to a vague "잠시 뒤" when retryAfterSec is missing', () => {
    const t = translateLlmError(apiError('rate-limit'));
    expect(t.retryAfterSec).toBeUndefined();
    expect(t.message).toContain('잠시 뒤');
  });

  it('auth: prompts the user to re-check the key, non-retryable', () => {
    const t = translateLlmError(apiError('auth'));
    expect(t.canRetry).toBe(false);
    expect(t.title).toContain('키');
    expect(t.message).toContain('설정');
  });

  it('network: asks to check the connection, retryable', () => {
    const t = translateLlmError(apiError('network'));
    expect(t.canRetry).toBe(true);
    expect(t.title).toContain('인터넷');
  });

  it('timeout: reports slow response, retryable', () => {
    const t = translateLlmError(apiError('timeout'));
    expect(t.canRetry).toBe(true);
    expect(t.title).toContain('오래 걸려요');
  });

  it('server: reports upstream instability, retryable', () => {
    const t = translateLlmError(apiError('server'));
    expect(t.canRetry).toBe(true);
    expect(t.title).toContain('불안정');
  });

  it('bad-request and unknown: generic guidance, non-retryable', () => {
    const bad = translateLlmError(apiError('bad-request'));
    const unk = translateLlmError(apiError('unknown'));
    expect(bad.canRetry).toBe(false);
    expect(unk.canRetry).toBe(false);
    expect(bad.title).toContain('예상하지 못한');
    expect(unk.title).toContain('예상하지 못한');
  });

  it('non-LlmApiError values are handled safely as kind "non-llm"', () => {
    const fromPlainError = translateLlmError(new Error('boom'));
    const fromString = translateLlmError('just a string');
    expect(fromPlainError.kind).toBe('non-llm');
    expect(fromString.kind).toBe('non-llm');
    expect(fromPlainError.canRetry).toBe(false);
    expect(fromPlainError.title.length).toBeGreaterThan(0);
  });
});

describe('withRetry — transient-only automatic retry (NFR-LLM-004)', () => {
  it('does not retry and rethrows immediately for auth/bad-request/quota-exhausted', async () => {
    for (const kind of ['auth', 'bad-request', 'quota-exhausted'] as const) {
      const fn = vi.fn().mockRejectedValue(apiError(kind));
      const sleep = vi.fn().mockResolvedValue(undefined);
      await expect(withRetry(fn, { sleep })).rejects.toBeInstanceOf(LlmApiError);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    }
  });

  it('retries rate-limit and respects retryAfterSec as the wait time', async () => {
    const err = apiError('rate-limit', { retryAfterSec: 7 });
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce('ok');
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await withRetry(fn, { sleep });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(7000);
  });

  it('rate-limit without retryAfterSec falls back to a 5s default wait', async () => {
    const fn = vi.fn().mockRejectedValueOnce(apiError('rate-limit')).mockResolvedValueOnce('ok');
    const sleep = vi.fn().mockResolvedValue(undefined);

    await withRetry(fn, { sleep });

    expect(sleep).toHaveBeenCalledWith(5000);
  });

  it('retries server/network/timeout with a 3s -> 6s -> 12s exponential backoff, in order', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(apiError('server'))
      .mockRejectedValueOnce(apiError('network'))
      .mockRejectedValueOnce(apiError('timeout'))
      .mockResolvedValueOnce('ok');
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await withRetry(fn, { sleep, maxRetries: 3 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([3000, 6000, 12000]);
  });

  it('gives up and rethrows the last error once maxRetries is exhausted', async () => {
    const lastErr = apiError('server', { providerMessage: 'still down' });
    const fn = vi.fn().mockRejectedValue(lastErr);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(withRetry(fn, { sleep, maxRetries: 2 })).rejects.toBe(lastErr);
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('invokes onRetry with the 1-based attempt number, wait time, and triggering error', async () => {
    const err1 = apiError('network');
    const err2 = apiError('timeout');
    const fn = vi.fn().mockRejectedValueOnce(err1).mockRejectedValueOnce(err2).mockResolvedValueOnce('ok');
    const sleep = vi.fn().mockResolvedValue(undefined);
    const onRetry = vi.fn();

    await withRetry(fn, { sleep, onRetry });

    expect(onRetry).toHaveBeenNthCalledWith(1, 1, 3000, err1);
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, 6000, err2);
  });

  it('returns the successful result immediately when the first attempt succeeds, without sleeping', async () => {
    const fn = vi.fn().mockResolvedValue('first try');
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await withRetry(fn, { sleep });

    expect(result).toBe('first try');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('rethrows immediately for a non-LlmApiError failure without retrying', async () => {
    const err = new Error('unexpected crash');
    const fn = vi.fn().mockRejectedValue(err);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(withRetry(fn, { sleep })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
