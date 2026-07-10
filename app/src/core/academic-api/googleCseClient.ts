/**
 * Google Programmable Search (Custom Search JSON API) client, scoped to
 * riss.kr via the search engine's own site-restriction config (cx), used to
 * cover Korean graduate theses/dissertations that OpenAlex and KCI do not
 * index (SPEC-TSA-001 후속 T32, NFR-ACAPI-002 조기 구현).
 *
 * Key model differs from every other client in this module: the user
 * registers their *own* Google API key (100 free queries/day), while `cx`
 * (the search engine id) is a build-bundled, non-secret constant — see
 * `defaultSettings.ts`'s `academicSearch.googleCseCx`. Both must be present
 * for this client to ever run in real mode (see `academicClients.ts`).
 *
 * Result-shape caveat: Google's JSON API returns a plain web-search snippet
 * per item, not structured bibliographic metadata. `snippet` is used as a
 * best-effort abstract substitute (nullable), but `authors` is always `[]`
 * and `year` is always `null` — parsing a publication year or author list
 * out of free-text snippet prose is unreliable enough that this client
 * deliberately does not attempt it (FR-RES-005: never fabricate bibliographic
 * fields the provider did not actually structure for us).
 */

import { filterMockPapers, GOOGLE_CSE_MOCK_PAPERS } from './mockData';
import type {
  AcademicClient,
  AcademicClientOptions,
  PaperMetadata,
  SearchFailureReason,
  SearchOptions,
  SearchResult,
} from './types';
import { DEFAULT_TIMEOUT_MS, failureResult, resolveLimit, successResult, withTimeout } from './types';

const SEARCH_PATH = '/customsearch/v1';
/** Google's Custom Search JSON API caps `num` at 10 results per request. */
const MAX_RESULTS_PER_REQUEST = 10;
const VENUE_LABEL = 'RISS 학위논문 검색';

export interface GoogleCseClientOptions extends AcademicClientOptions {
  /** Programmable Search Engine id. Not a secret — safe to bundle at build time. */
  cx: string;
}

interface GoogleCseItem {
  title?: unknown;
  link?: unknown;
  snippet?: unknown;
}

export class GoogleCseClient implements AcademicClient {
  readonly source = 'googlecse' as const;

  constructor(private readonly options: GoogleCseClientOptions) {}

  async search(query: string, opts?: SearchOptions): Promise<SearchResult> {
    const limit = resolveLimit(opts?.limit);

    if (this.options.mockMode) {
      return successResult(filterMockPapers(GOOGLE_CSE_MOCK_PAPERS, query, limit));
    }

    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const fetchImpl = this.options.fetchFn ?? fetch;

    return withTimeout(timeoutMs, async (signal) => {
      const response = await fetchImpl(this.buildUrl(query, limit), { signal });

      if (!response.ok) {
        const providerMessage = await extractErrorMessage(response);
        return failureResult(classifyGoogleCseStatus(response.status, providerMessage), providerMessage ?? `HTTP ${response.status}`);
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        return failureResult('parse', 'response body was not valid JSON');
      }

      const papers = parseGoogleCseJson(data, limit);
      if (papers === null) {
        return failureResult('parse', 'unrecognized Google CSE response shape');
      }
      return successResult(papers);
    });
  }

  private buildUrl(query: string, limit: number): string {
    const url = new URL(SEARCH_PATH, this.options.baseUrl);
    url.searchParams.set('key', this.options.apiKey ?? '');
    url.searchParams.set('cx', this.options.cx);
    url.searchParams.set('q', query);
    url.searchParams.set('num', String(Math.min(limit, MAX_RESULTS_PER_REQUEST)));
    return url.toString();
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Best-effort read of Google's `{ error: { message } }` error envelope. Never throws. */
async function extractErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    if (!isPlainObject(body) || !isPlainObject(body.error)) return undefined;
    const message = body.error.message;
    return typeof message === 'string' && message.trim().length > 0 ? message.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Maps a non-2xx status to a {@link SearchFailureReason}.
 *
 * - 400: almost always an invalid/malformed key or cx -> 'auth'.
 * - 429: standard per-second/per-day rate limiting -> 'rate-limit'.
 * - 403: Google overloads this status for *both* daily-quota exhaustion
 *   (`dailyLimitExceeded`/`quotaExceeded` in the error message) and genuine
 *   permission problems (e.g. the Custom Search API not enabled for the
 *   key's project). Only the former is a 'rate-limit'; anything else at 403
 *   is treated as 'auth' so the user gets an accurate "enable the API"
 *   hint rather than a misleading "try again tomorrow" one.
 * - everything else: 'network'.
 */
export function classifyGoogleCseStatus(status: number, providerMessage: string | undefined): SearchFailureReason {
  if (status === 429) return 'rate-limit';
  if (status === 403) {
    const message = (providerMessage ?? '').toLowerCase();
    return message.includes('quota') || message.includes('limit') ? 'rate-limit' : 'auth';
  }
  if (status === 400) return 'auth';
  return 'network';
}

/**
 * Expects the Custom Search JSON API's `{ items: [...] }` shape. Google
 * omits the `items` key entirely (rather than sending an empty array) when a
 * query matches zero results — that is a legitimate empty result set, not a
 * parse failure, so it is mapped to `[]` here instead of `null`. `null` is
 * reserved for a response body that is not even a plain object (an actually
 * unrecognized shape).
 */
function parseGoogleCseJson(data: unknown, limit: number): PaperMetadata[] | null {
  if (!isPlainObject(data)) return null;
  if (data.items === undefined || data.items === null) return [];
  if (!Array.isArray(data.items)) return null;

  const papers: PaperMetadata[] = [];
  for (const rawItem of data.items) {
    if (!isPlainObject(rawItem)) continue;
    const item = rawItem as GoogleCseItem;

    const title = typeof item.title === 'string' && item.title.trim().length > 0 ? item.title.trim() : null;
    const link = typeof item.link === 'string' && item.link.trim().length > 0 ? item.link.trim() : null;
    if (title === null || link === null) continue;

    papers.push({
      source: 'googlecse',
      externalId: link,
      title,
      authors: [],
      year: null,
      abstract: typeof item.snippet === 'string' && item.snippet.trim().length > 0 ? item.snippet.trim() : null,
      venue: VENUE_LABEL,
      url: link,
      citationCount: null,
    });
    if (papers.length >= limit) break;
  }

  return papers;
}
