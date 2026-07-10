/**
 * Free-tier rate limiter for the LLM adapter layer (NFR-LLM-003).
 *
 * Wraps any {@link LlmAdapter} with a sliding-window request throttle so a
 * burst of calls from chat/writing/deep-research features never exceeds the
 * provider's free-tier requests-per-minute cap. All concurrent callers are
 * serialized through a single FIFO queue so:
 *   1. the sliding window is checked/updated atomically (no race between two
 *      calls both observing "room available" and both firing), and
 *   2. call order is preserved end-to-end (first requested, first executed).
 *
 * `now`/`sleep` are injectable so tests can drive a fake clock instead of
 * `vi.useFakeTimers`, keeping the throttle logic itself timer-implementation
 * agnostic (also works if this ever runs somewhere without global timers).
 */

import { LlmApiError } from './errors';
import type { LlmAdapter, LlmRequest, LlmResponse } from './types';

/** Sliding window size: providers advertise limits per rolling minute. */
const WINDOW_MS = 60_000;

/**
 * Conservative default for free-tier plans (NFR-LLM-003). Free tiers commonly
 * advertise 10-15 requests/minute; 8 leaves a safety margin for clock skew
 * between our local timer and the provider's own window boundary, and for
 * other concurrent traffic (e.g. a manual retry) sharing the same key.
 */
export const FREE_TIER_RPM = 8;

export interface RateLimiterOptions {
  /** Requests allowed per rolling 60s window. */
  requestsPerMinute: number;
  /** Clock source. Defaults to `Date.now`. Inject a fake for deterministic tests. */
  now?: () => number;
  /** Delay implementation. Defaults to a real `setTimeout`-backed sleep. */
  sleep?: (ms: number) => Promise<void>;
  /** Invoked once whenever a call must wait, with the computed wait in ms. */
  onWait?: (waitMs: number) => void;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Decorates `adapter` with sliding-window throttling. Returns an adapter with
 * the exact same public shape (`provider`, `chat`) — callers cannot tell it
 * apart from the raw adapter except for the added latency.
 */
export function withRateLimit(adapter: LlmAdapter, opts: RateLimiterOptions): LlmAdapter {
  const requestsPerMinute = opts.requestsPerMinute;
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? defaultSleep;
  const onWait = opts.onWait;

  /** Timestamps (ms) of slots granted within the current window, oldest first. */
  const history: number[] = [];
  /** Set by {@link penalize} after a 429; blocks new slots until this instant. */
  let lockUntil = 0;
  /** Tail of the FIFO queue every call chains onto, guaranteeing serial order. */
  let queueTail: Promise<void> = Promise.resolve();

  function pruneHistory(t: number): void {
    while (history.length > 0 && history[0]! <= t - WINDOW_MS) {
      history.shift();
    }
  }

  /**
   * Blocks (via injected sleep) until a slot is free, then reserves it by
   * recording its timestamp. Only ever runs one call at a time — the FIFO
   * queue in `chat()` ensures this is never invoked concurrently with itself.
   */
  async function acquireSlot(): Promise<void> {
    for (;;) {
      const t = now();
      pruneHistory(t);

      let waitMs = 0;
      if (lockUntil > t) {
        waitMs = lockUntil - t;
      } else if (history.length >= requestsPerMinute) {
        waitMs = history[0]! + WINDOW_MS - t;
      }

      if (waitMs <= 0) {
        history.push(t);
        return;
      }

      onWait?.(waitMs);
      await sleep(waitMs);
    }
  }

  /** Locks the window after a 429 so no further slot is granted until the provider's cooldown elapses. */
  function penalize(retryAfterSec: number): void {
    const t = now();
    lockUntil = Math.max(lockUntil, t + retryAfterSec * 1000);
  }

  /** Chains `task` onto the shared queue so calls execute strictly in arrival order. */
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queueTail.then(task, task);
    // Keep the chain alive regardless of this call's outcome; failures must
    // not stall subsequent queued calls.
    queueTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return {
    provider: adapter.provider,
    chat(req: LlmRequest): Promise<LlmResponse> {
      return enqueue(async () => {
        await acquireSlot();
        try {
          return await adapter.chat(req);
        } catch (err) {
          // Gate future slots after a rate-limit response. Retrying this call
          // is out of scope here (T8's responsibility) — we only ever throttle.
          if (err instanceof LlmApiError && err.kind === 'rate-limit' && typeof err.retryAfterSec === 'number') {
            penalize(err.retryAfterSec);
          }
          throw err;
        }
      });
    },
  };
}
