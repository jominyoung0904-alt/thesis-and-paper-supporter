/**
 * Automatic retry wrapper for LLM calls (NFR-LLM-004, risk 3).
 *
 * Only transient failure kinds are retried: `rate-limit`, `server`,
 * `network`, `timeout`. `auth`, `bad-request`, and `quota-exhausted` (plus
 * any non-`LlmApiError` failure) are rethrown immediately on the first
 * attempt — retrying would not help, and delaying the Korean error message
 * (see errorTranslator.ts) would leave the user staring at a frozen screen
 * for no reason.
 */

import { LlmApiError, type LlmErrorKind } from './errors';

/** Failure kinds worth retrying automatically. */
const RETRYABLE_KINDS: ReadonlySet<LlmErrorKind> = new Set([
  'rate-limit',
  'server',
  'network',
  'timeout',
]);

/** Exponential backoff schedule (ms) for server/network/timeout retries. */
const BACKOFF_SCHEDULE_MS: readonly number[] = [3_000, 6_000, 12_000];
const MAX_BACKOFF_MS = BACKOFF_SCHEDULE_MS[BACKOFF_SCHEDULE_MS.length - 1] ?? 12_000;

/** Default wait when a rate-limit error carries no `retryAfterSec` hint. */
const DEFAULT_RATE_LIMIT_WAIT_SEC = 5;

export interface RetryOptions {
  /** Maximum retry attempts (not counting the first try). Default 3. */
  maxRetries?: number;
  /** Injectable sleep so tests can run the full schedule without real delays. */
  sleep?: (ms: number) => Promise<void>;
  /** Invoked right before each wait, with the 1-based attempt number, wait time, and the error that triggered it. */
  onRetry?: (attempt: number, waitMs: number, err: unknown) => void;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Narrows to the subset of `LlmApiError`s this module will retry. */
function isRetryable(err: unknown): err is LlmApiError {
  return err instanceof LlmApiError && RETRYABLE_KINDS.has(err.kind);
}

/** Computes how long to wait before the given 1-based retry attempt. */
function waitMsFor(err: LlmApiError, attempt: number): number {
  if (err.kind === 'rate-limit') {
    const sec = err.retryAfterSec ?? DEFAULT_RATE_LIMIT_WAIT_SEC;
    return sec * 1000;
  }
  const index = Math.min(attempt - 1, BACKOFF_SCHEDULE_MS.length - 1);
  return BACKOFF_SCHEDULE_MS[index] ?? MAX_BACKOFF_MS;
}

/**
 * Runs `fn`, retrying automatically on transient LLM failures. Non-transient
 * failures — `auth`, `bad-request`, `quota-exhausted`, or any error that
 * isn't an `LlmApiError` — are rethrown on the very first attempt with no
 * delay, so the caller can surface the (translated) error immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3;
  const sleep = opts.sleep ?? defaultSleep;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err) || attempt >= maxRetries) throw err;
      attempt += 1;
      const waitMs = waitMsFor(err, attempt);
      opts.onRetry?.(attempt, waitMs, err);
      await sleep(waitMs);
    }
  }
}
