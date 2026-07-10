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
 */

import { filterMockPapers, SEMANTIC_SCHOLAR_MOCK_PAPERS } from './mockData';
import type { AcademicClient, AcademicClientOptions, PaperMetadata, SearchOptions, SearchResult } from './types';
import { DEFAULT_TIMEOUT_MS, classifyHttpStatus, failureResult, resolveLimit, successResult, withTimeout } from './types';

const SEARCH_PATH = '/graph/v1/paper/search';
const FIELDS = 'title,authors,year,abstract,venue,url,citationCount,externalIds';

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

    return withTimeout(timeoutMs, async (signal) => {
      const response = await fetchImpl(this.buildUrl(query, limit), {
        signal,
        headers: this.options.apiKey ? { 'x-api-key': this.options.apiKey } : undefined,
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

      const papers = parseS2Json(data, limit);
      if (papers === null) {
        return failureResult('parse', 'unrecognized Semantic Scholar response shape');
      }
      return successResult(papers);
    });
  }

  private buildUrl(query: string, limit: number): string {
    const url = new URL(SEARCH_PATH, this.options.baseUrl);
    url.searchParams.set('query', query);
    url.searchParams.set('fields', FIELDS);
    url.searchParams.set('limit', String(limit));
    return url.toString();
  }
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
