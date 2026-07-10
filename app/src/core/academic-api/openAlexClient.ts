/**
 * OpenAlex academic graph API client (SPEC-TSA-001 후속: 국내 검색 API 전환).
 *
 * OpenAlex (https://api.openalex.org) requires no API key and is not
 * restricted by caller IP or MAC address — unlike KCI (IP-restricted) and
 * ScienceON (MAC-restricted), which turned out to be unreachable from a
 * distributed desktop app (see research.md "국내 API 전환 결정"). OpenAlex's
 * Korean-language search also returns KCI DOI-registered journal articles, so
 * this client now carries the domestic search load that KCI/ScienceON were
 * originally meant for. It always runs in real mode; no key is ever needed.
 *
 * Real-mode contract: `GET {base}/works?search=&per-page=&select=...`. The
 * response envelope is `{ results: [...] }` (not `{ data: [...] }` like
 * Semantic Scholar). Abstracts are not returned as plain text — OpenAlex
 * ships an `abstract_inverted_index` (word -> position[]) for copyright
 * reasons, so this module reconstructs plain text from it.
 */

import { filterMockPapers, OPENALEX_MOCK_PAPERS } from './mockData';
import type { AcademicClient, AcademicClientOptions, PaperMetadata, SearchOptions, SearchResult } from './types';
import { DEFAULT_TIMEOUT_MS, classifyHttpStatus, failureResult, resolveLimit, successResult, withTimeout } from './types';

const SEARCH_PATH = '/works';
const SELECT_FIELDS =
  'id,title,display_name,publication_year,doi,primary_location,authorships,cited_by_count,abstract_inverted_index';

/** Max authors kept per paper, mirroring the other clients' reference-list brevity. */
const MAX_AUTHORS = 5;

interface OpenAlexAuthorship {
  author?: { display_name?: unknown };
}

interface OpenAlexSource {
  display_name?: unknown;
}

interface OpenAlexPrimaryLocation {
  source?: OpenAlexSource | null;
  landing_page_url?: unknown;
}

interface OpenAlexWork {
  id?: unknown;
  title?: unknown;
  display_name?: unknown;
  publication_year?: unknown;
  doi?: unknown;
  primary_location?: OpenAlexPrimaryLocation | null;
  authorships?: unknown;
  cited_by_count?: unknown;
  abstract_inverted_index?: unknown;
}

export class OpenAlexClient implements AcademicClient {
  readonly source = 'openalex' as const;

  constructor(private readonly options: AcademicClientOptions) {}

  async search(query: string, opts?: SearchOptions): Promise<SearchResult> {
    const limit = resolveLimit(opts?.limit);

    if (this.options.mockMode) {
      return successResult(filterMockPapers(OPENALEX_MOCK_PAPERS, query, limit));
    }

    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const fetchImpl = this.options.fetchFn ?? fetch;

    return withTimeout(timeoutMs, async (signal) => {
      const response = await fetchImpl(this.buildUrl(query, limit), { signal });

      if (!response.ok) {
        return failureResult(classifyHttpStatus(response.status), `HTTP ${response.status}`);
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        return failureResult('parse', 'response body was not valid JSON');
      }

      const papers = parseOpenAlexJson(data, limit);
      if (papers === null) {
        return failureResult('parse', 'unrecognized OpenAlex response shape');
      }
      return successResult(papers);
    });
  }

  private buildUrl(query: string, limit: number): string {
    const url = new URL(SEARCH_PATH, this.options.baseUrl);
    url.searchParams.set('search', query);
    url.searchParams.set('per-page', String(limit));
    url.searchParams.set('select', SELECT_FIELDS);
    return url.toString();
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Expects `{ results: [...] }` per the OpenAlex Works API contract. `null` when the shape does not match at all. */
function parseOpenAlexJson(data: unknown, limit: number): PaperMetadata[] | null {
  if (!isPlainObject(data) || !Array.isArray(data.results)) return null;

  const papers: PaperMetadata[] = [];
  for (const [index, rawWork] of data.results.entries()) {
    if (!isPlainObject(rawWork)) continue;
    const work = rawWork as OpenAlexWork;

    const title = extractTitle(work);
    if (title === null) continue;

    papers.push({
      source: 'openalex',
      externalId: typeof work.id === 'string' && work.id.length > 0 ? work.id : `openalex-${index}`,
      title,
      authors: parseAuthors(work.authorships),
      year:
        typeof work.publication_year === 'number' && Number.isFinite(work.publication_year)
          ? work.publication_year
          : null,
      abstract: reconstructAbstract(work.abstract_inverted_index),
      venue: extractVenue(work.primary_location),
      url: extractUrl(work),
      citationCount:
        typeof work.cited_by_count === 'number' && Number.isFinite(work.cited_by_count) ? work.cited_by_count : null,
    });
    if (papers.length >= limit) break;
  }

  return papers.length > 0 ? papers : null;
}

function extractTitle(work: OpenAlexWork): string | null {
  if (typeof work.title === 'string' && work.title.trim().length > 0) return work.title.trim();
  if (typeof work.display_name === 'string' && work.display_name.trim().length > 0) return work.display_name.trim();
  return null;
}

function extractVenue(primaryLocation: OpenAlexPrimaryLocation | null | undefined): string | null {
  const name = primaryLocation?.source?.display_name;
  return typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;
}

/** Prefers the DOI (already a full `https://doi.org/...` URL) over the landing page. */
function extractUrl(work: OpenAlexWork): string | null {
  if (typeof work.doi === 'string' && work.doi.trim().length > 0) return work.doi.trim();
  const landingPage = work.primary_location?.landing_page_url;
  return typeof landingPage === 'string' && landingPage.trim().length > 0 ? landingPage.trim() : null;
}

function parseAuthors(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is OpenAlexAuthorship => isPlainObject(entry))
    .map((entry) =>
      isPlainObject(entry.author) && typeof entry.author.display_name === 'string'
        ? entry.author.display_name.trim()
        : '',
    )
    .filter((name) => name.length > 0)
    .slice(0, MAX_AUTHORS);
}

/**
 * Reconstructs a plain-text abstract from OpenAlex's inverted-index format
 * (`{ word: [position, ...] }`) by placing each word at its recorded
 * position(s) and joining them in order. Returns `null` when the index is
 * missing, not an object, or contains no valid position entries — many
 * KCI-DOI-registered records omit the abstract entirely.
 */
export function reconstructAbstract(invertedIndex: unknown): string | null {
  if (!isPlainObject(invertedIndex)) return null;

  let maxPosition = -1;
  const placements: Array<{ word: string; position: number }> = [];
  for (const [word, rawPositions] of Object.entries(invertedIndex)) {
    if (!Array.isArray(rawPositions)) continue;
    for (const position of rawPositions) {
      if (typeof position === 'number' && Number.isInteger(position) && position >= 0) {
        placements.push({ word, position });
        if (position > maxPosition) maxPosition = position;
      }
    }
  }

  if (placements.length === 0) return null;

  const words = new Array<string>(maxPosition + 1).fill('');
  for (const { word, position } of placements) {
    words[position] = word;
  }

  const abstract = words.join(' ').replace(/\s+/g, ' ').trim();
  return abstract.length > 0 ? abstract : null;
}
