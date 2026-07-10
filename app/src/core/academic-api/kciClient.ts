/**
 * KCI (Korea Citation Index) client, via the public data portal
 * (data.go.kr) gateway (FR-RES-002).
 *
 * TODO(KCI): the exact REST path, query parameter names, and response
 * schema for the approved KCI OPEN API product are NOT yet confirmed —
 * research.md flags the activation/approval SLA and field coverage
 * (citation count in particular) as unverified pending manual approval of
 * the real service key. `KCI_SEARCH_PATH` and the field-name candidates
 * below are best-effort placeholders derived from the public data portal's
 * common conventions; re-verify against the live API docs once a key is
 * approved. Until then `mockMode: true` is the only verified code path.
 *
 * The public data portal has historically defaulted to XML responses for
 * many services, so this client parses XML with lightweight regex-based
 * field extraction rather than depending on an XML DOM library — this
 * keeps the client robust to minor tag-name drift without adding a new
 * dependency (see research.md "KCI OPEN API" section).
 */

import { filterMockPapers, KCI_MOCK_PAPERS } from './mockData';
import type { AcademicClient, AcademicClientOptions, PaperMetadata, SearchOptions, SearchResult } from './types';
import { DEFAULT_TIMEOUT_MS, classifyHttpStatus, failureResult, resolveLimit, successResult, withTimeout } from './types';

// TODO(KCI): confirm against the approved API product's operation docs.
const KCI_SEARCH_PATH = '/openapi/service/rest/Thesis/getThesisSearch';

const TITLE_TAGS = ['title', 'articleTitle', 'artiTitle'];
const AUTHOR_TAGS = ['author', 'authors', 'artiAuthor'];
const YEAR_TAGS = ['pubYear', 'year', 'artiPubYear'];
const ABSTRACT_TAGS = ['abstract', 'artiAbstract'];
const LINK_TAGS = ['link', 'url', 'artiUrl'];
const CITATION_TAGS = ['citationCount', 'citedCnt'];

export class KciClient implements AcademicClient {
  readonly source = 'kci' as const;

  constructor(private readonly options: AcademicClientOptions) {}

  async search(query: string, opts?: SearchOptions): Promise<SearchResult> {
    const limit = resolveLimit(opts?.limit);

    if (this.options.mockMode) {
      return successResult(filterMockPapers(KCI_MOCK_PAPERS, query, limit));
    }

    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const fetchImpl = this.options.fetchFn ?? fetch;

    return withTimeout(timeoutMs, async (signal) => {
      const response = await fetchImpl(this.buildUrl(query, limit), { signal });
      if (!response.ok) {
        return failureResult(classifyHttpStatus(response.status), `HTTP ${response.status}`);
      }

      const text = await response.text();
      const papers = parseKciXml(text, limit);
      if (papers === null) {
        return failureResult('parse', 'unrecognized KCI response body');
      }
      return successResult(papers);
    });
  }

  private buildUrl(query: string, limit: number): string {
    const url = new URL(KCI_SEARCH_PATH, this.options.baseUrl);
    url.searchParams.set('query', query);
    url.searchParams.set('numOfRows', String(limit));
    if (this.options.apiKey) {
      url.searchParams.set('serviceKey', this.options.apiKey);
    }
    return url.toString();
  }
}

/**
 * Extracts `<item>...</item>` blocks and pulls known fields out of each with
 * simple tag regexes. Returns `null` when the body does not look like an
 * item-bearing XML document at all (malformed XML, an unexpected schema, or
 * an HTML error page) so the caller can surface `reason: 'parse'`.
 */
function parseKciXml(xml: string, limit: number): PaperMetadata[] | null {
  const trimmed = xml.trim();
  if (trimmed.length === 0 || !trimmed.includes('<')) {
    return null;
  }

  const itemBlocks = [...trimmed.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1] ?? '');
  if (itemBlocks.length === 0) {
    return null;
  }

  const papers: PaperMetadata[] = [];
  for (const [index, block] of itemBlocks.entries()) {
    const title = extractTag(block, TITLE_TAGS);
    if (title === null) continue; // Skip malformed entries rather than failing the whole batch.

    papers.push({
      source: 'kci',
      externalId: extractTag(block, ['id', 'CN']) ?? `kci-${index}`,
      title,
      authors: splitAuthors(extractTag(block, AUTHOR_TAGS)),
      year: parseYear(extractTag(block, YEAR_TAGS)),
      abstract: extractTag(block, ABSTRACT_TAGS),
      venue: extractTag(block, ['journal', 'journalName']),
      url: extractTag(block, LINK_TAGS),
      citationCount: parseCount(extractTag(block, CITATION_TAGS)),
    });
    if (papers.length >= limit) break;
  }

  return papers.length > 0 ? papers : null;
}

function extractTag(xml: string, tagNames: string[]): string | null {
  for (const tag of tagNames) {
    const pattern = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
    const match = xml.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return null;
}

function splitAuthors(raw: string | null): string[] {
  if (raw === null) return [];
  return raw
    .split(/[,;·]/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

function parseYear(raw: string | null): number | null {
  if (raw === null) return null;
  const match = raw.match(/\d{4}/);
  if (!match) return null;
  const year = Number.parseInt(match[0], 10);
  return Number.isFinite(year) ? year : null;
}

function parseCount(raw: string | null): number | null {
  if (raw === null) return null;
  const count = Number.parseInt(raw, 10);
  return Number.isFinite(count) ? count : null;
}
