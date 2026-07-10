/**
 * ScienceON (KISTI) client (FR-RES-002).
 *
 * TODO(ScienceON): the exact REST path and JSON response schema are NOT yet
 * confirmed — research.md flags the manual-approval SLA for a personal key,
 * the token refresh endpoint, and thesis/full-text coverage as unverified.
 * `SCIENCEON_SEARCH_PATH` and the `hits[]` shape below are best-effort
 * placeholders; re-verify against KISTI's official docs once a key clears
 * approval. `mockMode: true` is the only verified code path until then.
 *
 * Token lifecycle: ScienceON tokens expire after ~2 hours per the decisions
 * doc. This client only *uses* a caller-supplied `accessToken` — proactive
 * refresh (NFR-ACAPI-003) is out of scope here and owned by task T14.
 */

import { filterMockPapers, SCIENCEON_MOCK_PAPERS } from './mockData';
import type { AcademicClient, AcademicClientOptions, PaperMetadata, SearchOptions, SearchResult } from './types';
import { DEFAULT_TIMEOUT_MS, classifyHttpStatus, failureResult, resolveLimit, successResult, withTimeout } from './types';

// TODO(ScienceON): confirm against the approved API product's operation docs.
const SCIENCEON_SEARCH_PATH = '/tech/v1/search/articles';

export interface ScienceOnClientOptions extends AcademicClientOptions {
  /** Bearer token issued by KISTI's auth endpoint; caller is responsible for refreshing it (T14). */
  accessToken?: string;
}

interface ScienceOnHit {
  CN?: unknown;
  title?: unknown;
  author?: unknown;
  yearInfo?: unknown;
  abstract?: unknown;
  journalName?: unknown;
  url?: unknown;
  citedCnt?: unknown;
}

export class ScienceOnClient implements AcademicClient {
  readonly source = 'scienceon' as const;

  constructor(private readonly options: ScienceOnClientOptions) {}

  async search(query: string, opts?: SearchOptions): Promise<SearchResult> {
    const limit = resolveLimit(opts?.limit);

    if (this.options.mockMode) {
      return successResult(filterMockPapers(SCIENCEON_MOCK_PAPERS, query, limit));
    }

    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const fetchImpl = this.options.fetchFn ?? fetch;

    return withTimeout(timeoutMs, async (signal) => {
      const response = await fetchImpl(this.buildUrl(query, limit), {
        signal,
        headers: this.options.accessToken ? { Authorization: `Bearer ${this.options.accessToken}` } : undefined,
      });

      if (!response.ok) {
        return failureResult(classifyHttpStatus(response.status), `HTTP ${response.status}`);
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        return failureResult('parse', 'response body was not valid JSON');
      }

      const papers = parseScienceOnJson(data, limit);
      if (papers === null) {
        return failureResult('parse', 'unrecognized ScienceON response shape');
      }
      return successResult(papers);
    });
  }

  private buildUrl(query: string, limit: number): string {
    const url = new URL(SCIENCEON_SEARCH_PATH, this.options.baseUrl);
    url.searchParams.set('query', query);
    url.searchParams.set('numOfRows', String(limit));
    if (this.options.apiKey) {
      url.searchParams.set('apiKey', this.options.apiKey);
    }
    return url.toString();
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Best-effort shape: `{ result: { hits: [...] } }`. Returns `null` when the
 * payload does not match this placeholder shape at all, so the caller can
 * surface `reason: 'parse'` instead of silently returning zero results.
 */
function parseScienceOnJson(data: unknown, limit: number): PaperMetadata[] | null {
  if (!isPlainObject(data) || !isPlainObject(data.result)) return null;
  const hits = data.result.hits;
  if (!Array.isArray(hits)) return null;

  const papers: PaperMetadata[] = [];
  for (const [index, rawHit] of hits.entries()) {
    if (!isPlainObject(rawHit)) continue;
    const hit = rawHit as ScienceOnHit;
    const title = typeof hit.title === 'string' && hit.title.trim().length > 0 ? hit.title.trim() : null;
    if (title === null) continue;

    papers.push({
      source: 'scienceon',
      externalId: typeof hit.CN === 'string' ? hit.CN : `scienceon-${index}`,
      title,
      authors: parseAuthors(hit.author),
      year: parseYear(hit.yearInfo),
      abstract: typeof hit.abstract === 'string' ? hit.abstract : null,
      venue: typeof hit.journalName === 'string' ? hit.journalName : null,
      url: typeof hit.url === 'string' ? hit.url : null,
      citationCount: parseCount(hit.citedCnt),
    });
    if (papers.length >= limit) break;
  }

  return papers.length > 0 ? papers : null;
}

function parseAuthors(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[,;·]/)
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
  }
  return [];
}

function parseYear(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const match = raw.match(/\d{4}/);
    if (match) return Number.parseInt(match[0], 10);
  }
  return null;
}

function parseCount(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const count = Number.parseInt(raw, 10);
    if (Number.isFinite(count)) return count;
  }
  return null;
}
