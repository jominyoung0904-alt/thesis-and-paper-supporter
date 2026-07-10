import { describe, expect, it, vi } from 'vitest';

import { LlmApiError } from '../../src/core/llm/errors';
import { FREE_TIER_RPM, withRateLimit } from '../../src/core/llm/rateLimiter';
import type { LlmAdapter, LlmRequest, LlmResponse } from '../../src/core/llm/types';

const REQ: LlmRequest = { model: 'test-model', messages: [{ role: 'user', content: 'hi' }] };

/** Manually-driven fake clock: `sleep` advances `now()` by the requested delay instead of really waiting. */
function makeClock(start = 0) {
  let current = start;
  const waits: number[] = [];
  return {
    now: () => current,
    sleep: async (ms: number) => {
      waits.push(ms);
      current += ms;
    },
    waits,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

function okResponse(model = REQ.model): LlmResponse {
  return { text: 'ok', usage: { inputTokens: 1, outputTokens: 1 }, model };
}

/** Adapter stub that always succeeds and records call order for serialization checks. */
function makeAdapter(order?: string[]): LlmAdapter {
  return {
    provider: 'claude',
    chat: vi.fn(async (req: LlmRequest) => {
      order?.push(req.model);
      return okResponse(req.model);
    }),
  };
}

describe('withRateLimit — within limit', () => {
  it('passes calls through immediately with no wait when under the cap', async () => {
    const clock = makeClock();
    const adapter = makeAdapter();
    const limited = withRateLimit(adapter, { requestsPerMinute: 3, now: clock.now, sleep: clock.sleep });

    const results = [await limited.chat(REQ), await limited.chat(REQ), await limited.chat(REQ)];

    expect(results.every((r) => r.text === 'ok')).toBe(true);
    expect(clock.waits).toEqual([]);
    expect(adapter.chat).toHaveBeenCalledTimes(3);
  });

  it('preserves the wrapped adapter provider', () => {
    const adapter = makeAdapter();
    const limited = withRateLimit(adapter, { requestsPerMinute: 5, now: () => 0, sleep: async () => {} });
    expect(limited.provider).toBe('claude');
  });
});

describe('withRateLimit — over limit', () => {
  it('waits until the next slot when the per-minute cap is exceeded', async () => {
    const clock = makeClock();
    const adapter = makeAdapter();
    const limited = withRateLimit(adapter, { requestsPerMinute: 2, now: clock.now, sleep: clock.sleep });

    await limited.chat(REQ);
    await limited.chat(REQ);
    await limited.chat(REQ); // 3rd call exceeds cap of 2 within the window

    expect(clock.waits).toEqual([60_000]);
    expect(adapter.chat).toHaveBeenCalledTimes(3);
  });

  it('invokes onWait with the computed wait duration before sleeping', async () => {
    const clock = makeClock();
    const onWait = vi.fn();
    const adapter = makeAdapter();
    const limited = withRateLimit(adapter, {
      requestsPerMinute: 1,
      now: clock.now,
      sleep: clock.sleep,
      onWait,
    });

    await limited.chat(REQ);
    await limited.chat(REQ);

    expect(onWait).toHaveBeenCalledTimes(1);
    expect(onWait).toHaveBeenCalledWith(60_000);
  });
});

describe('withRateLimit — sliding window', () => {
  it('frees a slot once the oldest call falls outside the 60s window', async () => {
    const clock = makeClock();
    const adapter = makeAdapter();
    const limited = withRateLimit(adapter, { requestsPerMinute: 2, now: clock.now, sleep: clock.sleep });

    await limited.chat(REQ);
    await limited.chat(REQ);
    clock.advance(60_001); // simulate real time passing without the limiter's own sleep

    await limited.chat(REQ);

    expect(clock.waits).toEqual([]); // no throttle wait needed, window already slid
    expect(adapter.chat).toHaveBeenCalledTimes(3);
  });

  it('only counts calls within the rolling window, not the whole call count', async () => {
    const clock = makeClock();
    const adapter = makeAdapter();
    const limited = withRateLimit(adapter, { requestsPerMinute: 1, now: clock.now, sleep: clock.sleep });

    await limited.chat(REQ);
    clock.advance(30_000);
    // still within window relative to first call -> must wait remaining 30s
    await limited.chat(REQ);

    expect(clock.waits).toEqual([30_000]);
  });
});

describe('withRateLimit — concurrent calls', () => {
  it('serializes concurrent calls through a FIFO queue, preserving arrival order', async () => {
    const clock = makeClock();
    const order: string[] = [];
    const adapter = makeAdapter(order);
    const limited = withRateLimit(adapter, { requestsPerMinute: 5, now: clock.now, sleep: clock.sleep });

    const p1 = limited.chat({ model: 'a', messages: [] });
    const p2 = limited.chat({ model: 'b', messages: [] });
    const p3 = limited.chat({ model: 'c', messages: [] });
    await Promise.all([p1, p2, p3]);

    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('keeps serializing (and rate-limiting) later calls even when an earlier one throttles', async () => {
    const clock = makeClock();
    const order: string[] = [];
    const adapter = makeAdapter(order);
    const limited = withRateLimit(adapter, { requestsPerMinute: 1, now: clock.now, sleep: clock.sleep });

    const p1 = limited.chat({ model: 'a', messages: [] });
    const p2 = limited.chat({ model: 'b', messages: [] });
    await Promise.all([p1, p2]);

    expect(order).toEqual(['a', 'b']);
    expect(clock.waits).toEqual([60_000]);
  });
});

describe('withRateLimit — 429 penalize gating', () => {
  it('locks the window after a rate-limit error and rethrows without retrying', async () => {
    const clock = makeClock();
    let calls = 0;
    const adapter: LlmAdapter = {
      provider: 'claude',
      chat: vi.fn(async () => {
        calls += 1;
        if (calls === 1) {
          throw new LlmApiError({
            kind: 'rate-limit',
            provider: 'claude',
            status: 429,
            retryAfterSec: 5,
            providerMessage: 'slow down',
          });
        }
        return okResponse();
      }),
    };
    const onWait = vi.fn();
    const limited = withRateLimit(adapter, {
      requestsPerMinute: 10,
      now: clock.now,
      sleep: clock.sleep,
      onWait,
    });

    await expect(limited.chat(REQ)).rejects.toBeInstanceOf(LlmApiError);
    await limited.chat(REQ);

    expect(clock.waits).toEqual([5_000]);
    expect(onWait).toHaveBeenCalledWith(5_000);
    expect(adapter.chat).toHaveBeenCalledTimes(2); // no automatic retry, just gated the 2nd call
  });

  it('does not penalize on non rate-limit errors', async () => {
    const clock = makeClock();
    let calls = 0;
    const adapter: LlmAdapter = {
      provider: 'claude',
      chat: vi.fn(async () => {
        calls += 1;
        if (calls === 1) {
          throw new LlmApiError({ kind: 'server', provider: 'claude', status: 500, providerMessage: 'oops' });
        }
        return okResponse();
      }),
    };
    const limited = withRateLimit(adapter, { requestsPerMinute: 10, now: clock.now, sleep: clock.sleep });

    await expect(limited.chat(REQ)).rejects.toBeInstanceOf(LlmApiError);
    await limited.chat(REQ);

    expect(clock.waits).toEqual([]);
  });
});

describe('withRateLimit — defaults', () => {
  it('exposes a conservative FREE_TIER_RPM below common free-tier caps', () => {
    expect(FREE_TIER_RPM).toBe(8);
    expect(FREE_TIER_RPM).toBeLessThan(10);
  });

  it('works with the default real clock/sleep when the limit is not exceeded', async () => {
    const adapter = makeAdapter();
    const limited = withRateLimit(adapter, { requestsPerMinute: FREE_TIER_RPM });

    const res = await limited.chat(REQ);

    expect(res.text).toBe('ok');
  });
});
