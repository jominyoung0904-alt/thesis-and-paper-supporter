import { describe, expect, it, vi } from 'vitest';

import { OpenAlexClient, reconstructAbstract } from '../../src/core/academic-api/openAlexClient';
import type { FetchFn, SearchFailure, SearchResult } from '../../src/core/academic-api/types';

const BASE_URL = 'https://academic-api.example.invalid';

/** Builds a minimal fetch-shaped Response stub for a given status/body. */
function stubResponse(opts: { ok: boolean; status?: number; json?: unknown }): Response {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    json: () => (opts.json === undefined ? Promise.reject(new SyntaxError('no json')) : Promise.resolve(opts.json)),
  } as unknown as Response;
}

function expectFailure(result: SearchResult): asserts result is SearchFailure {
  if (result.ok) throw new Error('expected a failure SearchResult');
}

describe('OpenAlexClient', () => {
  it('mock mode returns well-shaped fixtures without any network call', async () => {
    const fetchFn = vi.fn();
    const client = new OpenAlexClient({ baseUrl: BASE_URL, mockMode: true, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('연구');

    expect(result.ok).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.papers.length).toBeGreaterThan(0);
      for (const paper of result.papers) expect(paper.source).toBe('openalex');
    }
  });

  it('mock mode returns both Korean and English fixtures spanning at least 6 papers', async () => {
    const client = new OpenAlexClient({ baseUrl: BASE_URL, mockMode: true });

    const result = await client.search('', { limit: 10 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.papers.length).toBeGreaterThanOrEqual(6);
    }
  });

  it('real mode parses the `{ results: [...] }` shape, preferring the DOI as url and reconstructing the abstract', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      stubResponse({
        ok: true,
        json: {
          results: [
            {
              id: 'https://openalex.org/W123',
              title: '인공지능 기반 논문 작성 지원 연구',
              publication_year: 2025,
              doi: 'https://doi.org/10.1234/example',
              primary_location: {
                source: { display_name: '정보처리학회논문지' },
                landing_page_url: 'https://example.org/landing',
              },
              authorships: [
                { author: { display_name: '김철수' } },
                { author: { display_name: '이영희' } },
              ],
              cited_by_count: 7,
              abstract_inverted_index: { 논문을: [0], 분석했다: [1] },
            },
          ],
        },
      }),
    );
    const client = new OpenAlexClient({ baseUrl: BASE_URL, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('논문 작성');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.papers).toEqual([
        {
          source: 'openalex',
          externalId: 'https://openalex.org/W123',
          title: '인공지능 기반 논문 작성 지원 연구',
          authors: ['김철수', '이영희'],
          year: 2025,
          abstract: '논문을 분석했다',
          venue: '정보처리학회논문지',
          url: 'https://doi.org/10.1234/example',
          citationCount: 7,
        },
      ]);
    }
  });

  it('falls back to the landing page url when doi is absent, and null abstract when the index is absent', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      stubResponse({
        ok: true,
        json: {
          results: [
            {
              id: 'https://openalex.org/W456',
              display_name: '제목만 있는 논문',
              publication_year: 2022,
              doi: null,
              primary_location: { landing_page_url: 'https://example.org/no-doi' },
              authorships: [],
              cited_by_count: null,
            },
          ],
        },
      }),
    );
    const client = new OpenAlexClient({ baseUrl: BASE_URL, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.papers[0]).toMatchObject({
        title: '제목만 있는 논문',
        url: 'https://example.org/no-doi',
        abstract: null,
        authors: [],
        citationCount: null,
      });
    }
  });

  it('returns reason:parse when the JSON body does not have a `results` array', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: true, json: { unexpected: true } }));
    const client = new OpenAlexClient({ baseUrl: BASE_URL, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('parse');
  });

  it('maps HTTP 401/429 to reason:auth/rate-limit and other non-2xx statuses to reason:network', async () => {
    const authFetch = vi.fn().mockResolvedValue(stubResponse({ ok: false, status: 401 }));
    const authClient = new OpenAlexClient({ baseUrl: BASE_URL, fetchFn: authFetch as unknown as FetchFn });
    const authResult = await authClient.search('q');
    expectFailure(authResult);
    expect(authResult.reason).toBe('auth');

    const rateFetch = vi.fn().mockResolvedValue(stubResponse({ ok: false, status: 429 }));
    const rateClient = new OpenAlexClient({ baseUrl: BASE_URL, fetchFn: rateFetch as unknown as FetchFn });
    const rateResult = await rateClient.search('q');
    expectFailure(rateResult);
    expect(rateResult.reason).toBe('rate-limit');

    const serverFetch = vi.fn().mockResolvedValue(stubResponse({ ok: false, status: 500 }));
    const serverClient = new OpenAlexClient({ baseUrl: BASE_URL, fetchFn: serverFetch as unknown as FetchFn });
    const serverResult = await serverClient.search('q');
    expectFailure(serverResult);
    expect(serverResult.reason).toBe('network');
  });

  it('returns reason:network (never throws) on a rejected fetch', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));
    const client = new OpenAlexClient({ baseUrl: BASE_URL, fetchFn: fetchFn as unknown as FetchFn });

    await expect(client.search('q')).resolves.toEqual(expect.objectContaining({ ok: false, reason: 'network' }));
  });

  it('returns reason:timeout when the request does not settle before the timeout', async () => {
    const fetchFn = vi.fn().mockImplementation((_url: string, init: { signal: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const abortError = new Error('aborted');
          abortError.name = 'AbortError';
          reject(abortError);
        });
      });
    });
    const client = new OpenAlexClient({ baseUrl: BASE_URL, fetchFn: fetchFn as unknown as FetchFn, timeoutMs: 5 });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('timeout');
  });

  it('returns reason:parse when the response body is not valid JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: true }));
    const client = new OpenAlexClient({ baseUrl: BASE_URL, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('parse');
  });

  it('builds the request url with search/per-page/select params', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: true, json: { results: [] } }));
    const client = new OpenAlexClient({ baseUrl: BASE_URL, fetchFn: fetchFn as unknown as FetchFn });

    await client.search('논문 작성', { limit: 5 });

    const [url] = fetchFn.mock.calls[0] as [string];
    expect(url).toContain(`${BASE_URL}/works?`);
    expect(url).toContain('search=');
    expect(url).toContain('per-page=5');
    expect(url).toContain('select=');
  });

  it('caps authors at 5 even when the API returns more', async () => {
    const authorships = Array.from({ length: 8 }, (_, i) => ({ author: { display_name: `저자${i}` } }));
    const fetchFn = vi.fn().mockResolvedValue(
      stubResponse({
        ok: true,
        json: {
          results: [
            {
              id: 'https://openalex.org/W789',
              title: '저자가 많은 논문',
              authorships,
            },
          ],
        },
      }),
    );
    const client = new OpenAlexClient({ baseUrl: BASE_URL, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.papers[0]?.authors).toHaveLength(5);
  });
});

describe('reconstructAbstract', () => {
  it('reorders words by their recorded positions', () => {
    expect(reconstructAbstract({ 학생: [0], 대상: [1], 연구: [2] })).toBe('학생 대상 연구');
  });

  it('handles a word appearing at multiple positions', () => {
    expect(reconstructAbstract({ a: [0, 2], b: [1] })).toBe('a b a');
  });

  it('returns null for null/undefined/non-object input', () => {
    expect(reconstructAbstract(null)).toBeNull();
    expect(reconstructAbstract(undefined)).toBeNull();
    expect(reconstructAbstract('not an object')).toBeNull();
    expect(reconstructAbstract([1, 2, 3])).toBeNull();
  });

  it('returns null for an empty index', () => {
    expect(reconstructAbstract({})).toBeNull();
  });

  it('ignores non-array position values and still reconstructs from valid entries', () => {
    expect(reconstructAbstract({ 유효: [0], 무효: 'not-an-array' })).toBe('유효');
  });
});
