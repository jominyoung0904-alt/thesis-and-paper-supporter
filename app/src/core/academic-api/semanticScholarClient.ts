/**
 * Semantic Scholar (S2) academic graph API client (FR-RES-002).
 *
 * This is the best-documented of the three providers, so the real-mode path
 * follows the public Graph API contract directly:
 * `GET {base}/graph/v1/paper/search?query=&fields=...`. Works without an
 * API key (lower rate limit); an optional key is sent as `x-api-key` when
 * provided.
 *
 * TODO(S2): confirm the current unauthenticated rate limit (research.md
 * flags this as unverified) before relying on it as the default free path
 * for NFR-ACAPI-001's built-in shared key strategy.
 *
 * 429 retry (SPEC-TSA-001 후속, 실사용 피드백): a single 429 is retried
 * exactly once, honoring the `Retry-After` response header (seconds) when
 * present, falling back to a fixed {@link DEFAULT_RETRY_DELAY_MS} wait
 * otherwise. This is paired with `pipeline.ts`'s sequential-per-client
 * fan-out — together they cut down on the same-key concurrent-request
 * bursts that trip Semantic Scholar's rate limit most often.
 */

import { filterMockPapers, SEMANTIC_SCHOLAR_MOCK_PAPERS } from './mockData';
import type { AcademicClient, AcademicClientOptions, FetchFn, PaperMetadata, SearchOptions, SearchResult } from './types';
import { DEFAULT_TIMEOUT_MS, classifyHttpStatus, failureResult, resolveLimit, successResult, withTimeout } from './types';

const SEARCH_PATH = '/graph/v1/paper/search';
const FIELDS = 'title,authors,year,abstract,venue,url,citationCount,externalIds';
/** Fallback wait before the single 429 retry when no `Retry-After` header is present. */
const DEFAULT_RETRY_DELAY_MS = 2000;

interface S2Author {
  name?: unknown;
}

interface S2Paper {
  paperId?: unknown;
  title?: unknown;
  authors?: unknown;
  year?: unknown;
  abstract?: unknown;
  venue?: unknown;
  url?: unknown;
  citationCount?: unknown;
}

export class SemanticScholarClient implements AcademicClient {
  readonly source = 'semanticscholar' as const;

  constructor(private readonly options: AcademicClientOptions) {}

  async search(query: string, opts?: SearchOptions): Promise<SearchResult> {
    const limit = resolveLimit(opts?.limit);

    if (this.options.mockMode) {
      return successResult(filterMockPapers(SEMANTIC_SCHOLAR_MOCK_PAPERS, query, limit));
    }

    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const fetchImpl = this.options.fetchFn ?? fetch;
    const sleepImpl = this.options.sleepFn ?? defaultSleep;

    return withTimeout(timeoutMs, (signal) => this.fetchWithRetry(fetchImpl, sleepImpl, query, limit, signal, 1));
  }

  /** Fetches once; on a 429 with `retriesLeft > 0`, waits and retries exactly once more. */
  private async fetchWithRetry(
    fetchImpl: FetchFn,
    sleepImpl: (ms: number) => Promise<void>,
    query: string,
    limit: number,
    signal: AbortSignal,
    retriesLeft: number,
  ): Promise<SearchResult> {
    const response = await fetchImpl(this.buildUrl(query, limit), {
      signal,
      headers: this.options.apiKey ? { 'x-api-key': this.options.apiKey } : undefined,
    });

    if (!response.ok) {
      if (response.status === 429 && retriesLeft > 0) {
        await sleepImpl(retryDelayMs(response));
        return this.fetchWithRetry(fetchImpl, sleepImpl, query, limit, signal, retriesLeft - 1);
      }
      return failureResult(classifyHttpStatus(response.status), `HTTP ${response.status}`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return failureResult('parse', 'response body was not valid JSON');
    }

    const papers = parseS2Json(data, limit);
    if (papers === null) {
      return failureResult('parse', 'unrecognized Semantic Scholar response shape');
    }
    return successResult(papers);
  }

  private buildUrl(query: string, limit: number): string {
    const url = new URL(SEARCH_PATH, this.options.baseUrl);
    url.searchParams.set('query', query);
    url.searchParams.set('fields', FIELDS);
    url.searchParams.set('limit', String(limit));
    return url.toString();
  }
}

/** Real-clock sleep used when no `sleepFn` override is injected. */
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reads the `Retry-After` header (seconds) off a 429 response, falling back to a fixed default. */
function retryDelayMs(response: Response): number {
  const header = response.headers?.get?.('retry-after');
  if (header === null || header === undefined) return DEFAULT_RETRY_DELAY_MS;
  const seconds = Number.parseInt(header, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_DELAY_MS;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Expects `{ data: [...] }` per the real Graph API contract. `null` when the shape does not match at all. */
function parseS2Json(data: unknown, limit: number): PaperMetadata[] | null {
  if (!isPlainObject(data) || !Array.isArray(data.data)) return null;

  const papers: PaperMetadata[] = [];
  for (const [index, rawPaper] of data.data.entries()) {
    if (!isPlainObject(rawPaper)) continue;
    const paper = rawPaper as S2Paper;
    const title = typeof paper.title === 'string' && paper.title.trim().length > 0 ? paper.title.trim() : null;
    if (title === null) continue;

    papers.push({
      source: 'semanticscholar',
      externalId: typeof paper.paperId === 'string' ? paper.paperId : `s2-${index}`,
      title,
      authors: parseAuthors(paper.authors),
      year: typeof paper.year === 'number' && Number.isFinite(paper.year) ? paper.year : null,
      abstract: typeof paper.abstract === 'string' ? paper.abstract : null,
      venue: typeof paper.venue === 'string' && paper.venue.trim().length > 0 ? paper.venue : null,
      url: typeof paper.url === 'string' ? paper.url : null,
      citationCount:
        typeof paper.citationCount === 'number' && Number.isFinite(paper.citationCount) ? paper.citationCount : null,
    });
    if (papers.length >= limit) break;
  }

  return papers.length > 0 ? papers : null;
}

function parseAuthors(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is S2Author => isPlainObject(entry))
    .map((entry) => (typeof entry.name === 'string' ? entry.name.trim() : ''))
    .filter((name) => name.length > 0);
}
