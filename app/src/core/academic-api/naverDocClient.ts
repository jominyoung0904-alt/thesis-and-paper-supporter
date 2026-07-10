/**
 * Naver Search Open API client, scoped to the "전문자료(doc)" category
 * (학술·학위논문·보고서), used to replace Google Custom Search JSON API after
 * it was confirmed closed to new customers (403, 2027 shutdown announced) —
 * see SPEC-TSA-001 후속 T33, research.md "네이버 전문자료 전환 결정".
 *
 * Key model: Naver issues a Client ID *and* a Client Secret per application
 * (unlike every other client in this module, which uses a single API key).
 * Both must be present for this client to ever run in real mode. The pair is
 * stored as a single colon-separated string in `KeyStore` to keep that
 * module's shape unchanged — see `keyStore.ts`'s `parseNaverCredential`.
 *
 * Result-shape caveat: like Google CSE before it, Naver's doc search returns
 * a plain title/link/description triple per item, not structured
 * bibliographic metadata. `description` is used as a best-effort abstract
 * substitute (nullable), but `authors` is always `[]` and `year` is always
 * `null` (FR-RES-005: never fabricate bibliographic fields the provider did
 * not actually structure for us). Naver additionally wraps query-matched
 * substrings in `<b>`/`</b>` tags inside `title`/`description` — these (and
 * any other markup) are stripped before the fields are used.
 */

import { filterMockPapers, NAVER_DOC_MOCK_PAPERS } from './mockData';
import type {
  AcademicClient,
  AcademicClientOptions,
  PaperMetadata,
  SearchOptions,
  SearchResult,
} from './types';
import { classifyHttpStatus, DEFAULT_TIMEOUT_MS, failureResult, resolveLimit, successResult, withTimeout } from './types';

const SEARCH_PATH = '/v1/search/doc.json';
/** Naver's doc search API caps `display` at 10 results per request. */
const MAX_RESULTS_PER_REQUEST = 10;
const VENUE_LABEL = '네이버 전문정보';

export interface NaverDocClientOptions extends Omit<AcademicClientOptions, 'apiKey'> {
  clientId: string;
  clientSecret: string;
}

interface NaverDocItem {
  title?: unknown;
  link?: unknown;
  description?: unknown;
}

export class NaverDocClient implements AcademicClient {
  readonly source = 'naverdoc' as const;

  constructor(private readonly options: NaverDocClientOptions) {}

  async search(query: string, opts?: SearchOptions): Promise<SearchResult> {
    const limit = resolveLimit(opts?.limit);

    if (this.options.mockMode) {
      return successResult(filterMockPapers(NAVER_DOC_MOCK_PAPERS, query, limit));
    }

    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const fetchImpl = this.options.fetchFn ?? fetch;

    return withTimeout(timeoutMs, async (signal) => {
      const response = await fetchImpl(this.buildUrl(query, limit), {
        signal,
        headers: {
          'X-Naver-Client-Id': this.options.clientId,
          'X-Naver-Client-Secret': this.options.clientSecret,
        },
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

      const papers = parseNaverDocJson(data, limit);
      if (papers === null) {
        return failureResult('parse', 'unrecognized Naver doc-search response shape');
      }
      return successResult(papers);
    });
  }

  private buildUrl(query: string, limit: number): string {
    const url = new URL(SEARCH_PATH, this.options.baseUrl);
    url.searchParams.set('query', query);
    url.searchParams.set('display', String(Math.min(limit, MAX_RESULTS_PER_REQUEST)));
    return url.toString();
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Strips all HTML markup (e.g. Naver's `<b>`/`</b>` query-highlight tags)
 * from provider-supplied text. Exported so this stripping behavior is
 * independently unit-tested. A generic tag-strip (rather than a `<b>`-only
 * replace) is used defensively, in case Naver ever wraps a match in a
 * different tag.
 */
export function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim();
}

/**
 * Expects Naver's `{ items: [...] }` shape. A missing/null `items` key is
 * treated as a legitimate empty result set (`[]`), not a parse failure;
 * `null` is reserved for a response body that is not even a plain object.
 */
function parseNaverDocJson(data: unknown, limit: number): PaperMetadata[] | null {
  if (!isPlainObject(data)) return null;
  if (data.items === undefined || data.items === null) return [];
  if (!Array.isArray(data.items)) return null;

  const papers: PaperMetadata[] = [];
  for (const rawItem of data.items) {
    if (!isPlainObject(rawItem)) continue;
    const item = rawItem as NaverDocItem;

    const rawTitle = typeof item.title === 'string' ? stripHtmlTags(item.title) : '';
    const rawLink = typeof item.link === 'string' ? item.link.trim() : '';
    if (rawTitle.length === 0 || rawLink.length === 0) continue;

    const rawDescription = typeof item.description === 'string' ? stripHtmlTags(item.description) : '';

    papers.push({
      source: 'naverdoc',
      externalId: rawLink,
      title: rawTitle,
      authors: [],
      year: null,
      abstract: rawDescription.length > 0 ? rawDescription : null,
      venue: VENUE_LABEL,
      url: rawLink,
      citationCount: null,
    });
    if (papers.length >= limit) break;
  }

  return papers;
}
