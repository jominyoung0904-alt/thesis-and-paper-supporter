/**
 * Shared types and small helpers for the academic API client layer
 * (FR-RES-002, FR-RES-005, FR-RES-009, NFR-ACAPI-001).
 *
 * Design constraint (FR-RES-005): `PaperMetadata` is populated exclusively
 * from academic API responses (real or mock fixtures). No LLM-generated
 * field may ever be written into this shape — the research pipeline (T15)
 * must treat this module as the single deterministic source of
 * bibliographic data.
 *
 * Design constraint (FR-RES-009): a provider failure is data, not an
 * exception. Every client returns a `SearchResult` even when the network
 * call fails, so the pipeline can report partial results transparently
 * instead of crashing the whole deep-research run.
 */

export type AcademicSource = 'kci' | 'scienceon' | 'semanticscholar' | 'openalex' | 'googlecse' | 'naverdoc';

export interface PaperMetadata {
  source: AcademicSource;
  externalId: string;
  title: string;
  authors: string[];
  year: number | null;
  abstract: string | null;
  venue: string | null;
  url: string | null;
  citationCount: number | null;
}

export type SearchFailureReason = 'network' | 'auth' | 'rate-limit' | 'parse' | 'timeout';

export interface SearchSuccess {
  ok: true;
  papers: PaperMetadata[];
}

export interface SearchFailure {
  ok: false;
  reason: SearchFailureReason;
  /** Raw diagnostic detail from the provider/transport. Not localized or user-facing. */
  providerMessage?: string;
}

export type SearchResult = SearchSuccess | SearchFailure;

export interface SearchOptions {
  limit?: number;
}

export interface AcademicClient {
  readonly source: AcademicSource;
  search(query: string, opts?: SearchOptions): Promise<SearchResult>;
}

/** Injectable fetch signature so tests can stub network calls without touching the global. */
export type FetchFn = typeof fetch;

export interface AcademicClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetchFn?: FetchFn;
  mockMode?: boolean;
  /** Request timeout in ms. Defaults to {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 15000;
export const DEFAULT_SEARCH_LIMIT = 10;

export function successResult(papers: PaperMetadata[]): SearchSuccess {
  return { ok: true, papers };
}

export function failureResult(reason: SearchFailureReason, providerMessage?: string): SearchFailure {
  return providerMessage === undefined ? { ok: false, reason } : { ok: false, reason, providerMessage };
}

/**
 * Maps a non-2xx HTTP status to a {@link SearchFailureReason}. Conservative
 * mapping: only 401/403 (auth) and 429 (rate-limit) get a specific reason;
 * every other non-2xx status is treated as a network-layer failure since
 * none of the three providers document a stable error-body schema yet
 * (see .autopus/specs/SPEC-TSA-001/research.md).
 */
export function classifyHttpStatus(status: number): SearchFailureReason {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate-limit';
  return 'network';
}

/**
 * Runs `run` with an `AbortController` tied to `timeoutMs`. Any error thrown
 * out of `run` (network failure, abort, unexpected parse throw) is captured
 * and converted into a `SearchFailure` — this is the single choke point that
 * guarantees `AcademicClient.search()` never rejects (FR-RES-009).
 */
export async function withTimeout(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<SearchResult>,
): Promise<SearchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    const message = error instanceof Error ? error.message : String(error);
    return failureResult(isAbort ? 'timeout' : 'network', message);
  } finally {
    clearTimeout(timer);
  }
}

/** Clamps a caller-supplied `limit` to a sane positive integer, defaulting to {@link DEFAULT_SEARCH_LIMIT}. */
export function resolveLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_SEARCH_LIMIT;
  }
  return Math.floor(limit);
}
