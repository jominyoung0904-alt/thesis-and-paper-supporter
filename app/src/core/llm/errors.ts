/**
 * Normalized error model and the HTTP transport that raises it (NFR-LLM-004,
 * input to T8's Korean error translation).
 *
 * Every failure path — HTTP status, network reject, timeout — is collapsed into
 * a single {@link LlmApiError} carrying a stable `kind`. `providerMessage` keeps
 * the raw upstream text verbatim; translation into user-facing Korean is T8's
 * responsibility, not this layer's.
 */

import type { LlmProvider } from './types';

/**
 * Stable failure taxonomy consumed by retry (T7) and translation (T8) logic.
 * - `rate-limit`: throttled, retry after a short delay (HTTP 429, per-minute).
 * - `auth`: bad/expired/forbidden key (HTTP 401/403).
 * - `quota-exhausted`: credit or free-tier allowance spent (not a transient throttle).
 * - `bad-request`: malformed input (HTTP 400/404/422); retrying won't help.
 * - `server`: upstream fault (HTTP >= 500, incl. Anthropic 529 overloaded).
 * - `network`: fetch rejected before an HTTP response (DNS, connection, TLS).
 * - `timeout`: aborted locally after the configured deadline.
 * - `unknown`: anything unclassified.
 */
export type LlmErrorKind =
  | 'rate-limit'
  | 'auth'
  | 'quota-exhausted'
  | 'bad-request'
  | 'server'
  | 'network'
  | 'timeout'
  | 'unknown';

export interface LlmApiErrorInit {
  kind: LlmErrorKind;
  provider: LlmProvider;
  status?: number;
  retryAfterSec?: number;
  providerMessage: string;
}

/** Single error type thrown for every adapter failure. */
export class LlmApiError extends Error {
  readonly kind: LlmErrorKind;
  readonly provider: LlmProvider;
  readonly status?: number;
  readonly retryAfterSec?: number;
  /** Raw upstream message, kept in the original language for T8 to translate. */
  readonly providerMessage: string;

  constructor(init: LlmApiErrorInit) {
    super(`[${init.provider}] ${init.kind}: ${init.providerMessage}`);
    this.name = 'LlmApiError';
    this.kind = init.kind;
    this.provider = init.provider;
    this.status = init.status;
    this.retryAfterSec = init.retryAfterSec;
    this.providerMessage = init.providerMessage;
    // Restore the prototype chain so `instanceof LlmApiError` holds when the
    // module is transpiled to a target below ES2015.
    Object.setPrototypeOf(this, LlmApiError.prototype);
  }
}

/** Narrow, allocation-free JSON object guard used across adapters. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

/** Wraps a pre-response fetch rejection (DNS, connection reset, TLS, ...). */
export function networkError(provider: LlmProvider, cause: unknown): LlmApiError {
  const message = cause instanceof Error ? cause.message : String(cause);
  return new LlmApiError({ kind: 'network', provider, providerMessage: message });
}

/** Builds the error raised when the local deadline aborts the request. */
export function timeoutError(provider: LlmProvider, timeoutMs: number): LlmApiError {
  return new LlmApiError({
    kind: 'timeout',
    provider,
    providerMessage: `Request timed out after ${timeoutMs}ms`,
  });
}

/** Maps an HTTP status to its default kind, before provider-specific refinement. */
export function baseKindFromStatus(status: number): LlmErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate-limit';
  if (status === 400 || status === 404 || status === 422) return 'bad-request';
  if (status >= 500) return 'server';
  return 'unknown';
}

/** Parses a `Retry-After` header value: delta-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    const diff = Math.ceil((dateMs - Date.now()) / 1000);
    return diff > 0 ? diff : 0;
  }
  return undefined;
}

function errorNode(body: unknown): Record<string, unknown> | undefined {
  if (!isRecord(body)) return undefined;
  return isRecord(body.error) ? body.error : undefined;
}

/** Extracts the human-readable upstream message; all three vendors nest it under `error.message`. */
function extractProviderMessage(body: unknown, rawText: string): string {
  const err = errorNode(body);
  if (err && typeof err.message === 'string') return err.message;
  if (isRecord(body) && typeof body.message === 'string') return body.message;
  return rawText.trim() || 'Unknown error';
}

/** Gemini free-tier daily allowance (RESOURCE_EXHAUSTED per-day) vs per-minute throttle. */
function isGeminiDailyQuota(body: unknown): boolean {
  const err = errorNode(body);
  if (!err) return false;
  const message = typeof err.message === 'string' ? err.message : '';
  return /per\s*day|perday|daily|free[_\s-]?tier|GenerateRequestsPerDay/i.test(message);
}

/** OpenAI signals a spent balance with `error.type`/`error.code` = insufficient_quota. */
function isOpenaiInsufficientQuota(body: unknown): boolean {
  const err = errorNode(body);
  if (!err) return false;
  return err.type === 'insufficient_quota' || err.code === 'insufficient_quota';
}

/** Refines a 429 into rate-limit vs quota-exhausted per provider semantics. */
function refineKind(provider: LlmProvider, status: number, body: unknown): LlmErrorKind {
  if (status === 429) {
    if (provider === 'gemini' && isGeminiDailyQuota(body)) return 'quota-exhausted';
    if (provider === 'openai' && isOpenaiInsufficientQuota(body)) return 'quota-exhausted';
    return 'rate-limit';
  }
  return baseKindFromStatus(status);
}

/** Reads a retry hint from the body when no `Retry-After` header is present (Gemini RetryInfo). */
function retryAfterFromBody(body: unknown): number | undefined {
  const err = errorNode(body);
  if (!err || !Array.isArray(err.details)) return undefined;
  for (const detail of err.details) {
    if (isRecord(detail) && typeof detail.retryDelay === 'string') {
      const match = /^(\d+(?:\.\d+)?)s$/.exec(detail.retryDelay.trim());
      if (match) return Math.ceil(Number(match[1]));
    }
  }
  return undefined;
}

/** Turns a non-2xx HTTP response into a fully classified {@link LlmApiError}. */
export function classifyHttpError(
  provider: LlmProvider,
  status: number,
  headerRetryAfterSec: number | undefined,
  body: unknown,
  rawText: string,
): LlmApiError {
  return new LlmApiError({
    kind: refineKind(provider, status, body),
    provider,
    status,
    retryAfterSec: headerRetryAfterSec ?? retryAfterFromBody(body),
    providerMessage: extractProviderMessage(body, rawText),
  });
}

/**
 * POSTs a JSON body and returns the parsed JSON response, or throws a
 * normalized {@link LlmApiError}. This is the single transport used by every
 * adapter, so timeout/network/HTTP classification lives in exactly one place.
 */
export async function postJson(params: {
  provider: LlmProvider;
  fetchFn: typeof fetch;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs: number;
}): Promise<unknown> {
  const { provider, fetchFn, url, headers, body, timeoutMs } = params;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (timedOut || isAbortError(err)) throw timeoutError(provider, timeoutMs);
    throw networkError(provider, err);
  } finally {
    clearTimeout(timer);
  }

  const rawText = await response.text().catch(() => '');
  let parsed: unknown;
  try {
    parsed = rawText ? JSON.parse(rawText) : undefined;
  } catch {
    parsed = undefined;
  }

  if (!response.ok) {
    const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
    throw classifyHttpError(provider, response.status, retryAfter, parsed, rawText);
  }

  return parsed;
}

/** Removes a single trailing slash so `${base}/v1/...` never doubles up. */
export function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
