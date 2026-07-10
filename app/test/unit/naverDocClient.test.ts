import { describe, expect, it, vi } from 'vitest';

import { NaverDocClient, stripHtmlTags } from '../../src/core/academic-api/naverDocClient';
import type { FetchFn, SearchFailure, SearchResult } from '../../src/core/academic-api/types';

const BASE_URL = 'https://academic-api.example.invalid';
const CLIENT_ID = 'test-client-id';
const CLIENT_SECRET = 'test-client-secret';

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

function makeClient(overrides: Partial<{ fetchFn: FetchFn; mockMode: boolean; timeoutMs: number }> = {}) {
  return new NaverDocClient({
    baseUrl: BASE_URL,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    ...overrides,
  });
}

describe('stripHtmlTags', () => {
  it('removes <b> highlight tags Naver wraps around matched substrings', () => {
    expect(stripHtmlTags('<b>대학원생</b>의 논문 작성 지원')).toBe('대학원생의 논문 작성 지원');
  });

  it('removes multiple and nested-looking tags', () => {
    expect(stripHtmlTags('<b>가</b>나<b>다</b>')).toBe('가나다');
  });

  it('leaves plain text without tags unchanged (after trim)', () => {
    expect(stripHtmlTags('  plain text  ')).toBe('plain text');
  });

  it('returns an empty string for a tag-only input', () => {
    expect(stripHtmlTags('<b></b>')).toBe('');
  });
});

describe('NaverDocClient', () => {
  it('mock mode returns well-shaped Korean thesis/report fixtures without any network call', async () => {
    const fetchFn = vi.fn();
    const client = makeClient({ mockMode: true, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('논문');

    expect(result.ok).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.papers.length).toBeGreaterThan(0);
      for (const paper of result.papers) {
        expect(paper.source).toBe('naverdoc');
        expect(paper.authors).toEqual([]);
        expect(paper.year).toBeNull();
      }
    }
  });

  it('mock mode respects the limit option', async () => {
    const client = makeClient({ mockMode: true });

    const result = await client.search('', { limit: 2 });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.papers).toHaveLength(2);
  });

  it('real mode parses `{ items: [...] }` into PaperMetadata, stripping <b> tags from title/description', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      stubResponse({
        ok: true,
        json: {
          items: [
            {
              title: '<b>대학원생</b> 논문 작성 지원 도구 연구 : 석사학위논문',
              link: 'https://www.riss.kr/link?id=T88888888',
              description: '본 연구는 <b>대학원생</b>을 대상으로 논문 작성 지원 도구의 효과를 검증하였다.',
            },
          ],
        },
      }),
    );
    const client = makeClient({ fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('논문 작성 지원');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.papers).toEqual([
        {
          source: 'naverdoc',
          externalId: 'https://www.riss.kr/link?id=T88888888',
          title: '대학원생 논문 작성 지원 도구 연구 : 석사학위논문',
          authors: [],
          year: null,
          abstract: '본 연구는 대학원생을 대상으로 논문 작성 지원 도구의 효과를 검증하였다.',
          venue: '네이버 전문정보',
          url: 'https://www.riss.kr/link?id=T88888888',
          citationCount: null,
        },
      ]);
    }
  });

  it('returns ok:true with an empty papers array when Naver omits `items` (zero results)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: true, json: { total: 0 } }));
    const client = makeClient({ fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('아주 희귀한 검색어 123456');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.papers).toEqual([]);
  });

  it('returns ok:true with an empty papers array when `items` is an explicit empty array', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: true, json: { items: [] } }));
    const client = makeClient({ fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.papers).toEqual([]);
  });

  it('returns reason:parse when the JSON body is not a plain object', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: true, json: [1, 2, 3] }));
    const client = makeClient({ fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('parse');
  });

  it('returns reason:parse when `items` is present but not an array', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: true, json: { items: 'not-an-array' } }));
    const client = makeClient({ fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('parse');
  });

  it('skips malformed items missing a title or link, still returning the valid ones', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      stubResponse({
        ok: true,
        json: {
          items: [
            { title: '제목만 있음' },
            { link: 'https://www.riss.kr/link?id=T1' },
            { title: '정상 항목', link: 'https://www.riss.kr/link?id=T2', description: null },
          ],
        },
      }),
    );
    const client = makeClient({ fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.papers).toHaveLength(1);
      expect(result.papers[0]).toMatchObject({ title: '정상 항목', abstract: null });
    }
  });

  it('maps HTTP 401 to reason:auth', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: false, status: 401 }));
    const client = makeClient({ fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('auth');
  });

  it('maps HTTP 403 to reason:auth', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: false, status: 403 }));
    const client = makeClient({ fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('auth');
  });

  it('maps HTTP 429 to reason:rate-limit', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: false, status: 429 }));
    const client = makeClient({ fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('rate-limit');
  });

  it('maps any other non-2xx status to reason:network', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: false, status: 500 }));
    const client = makeClient({ fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('network');
  });

  it('returns reason:network (never throws) on a rejected fetch', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    const client = makeClient({ fetchFn: fetchFn as unknown as FetchFn });

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
    const client = makeClient({ fetchFn: fetchFn as unknown as FetchFn, timeoutMs: 5 });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('timeout');
  });

  it('returns reason:parse when the response body is not valid JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: true }));
    const client = makeClient({ fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('parse');
  });

  it('builds the request url with query/display params, capping display at 10, and sends the client id/secret headers', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: true, json: { items: [] } }));
    const client = makeClient({ fetchFn: fetchFn as unknown as FetchFn });

    await client.search('학위논문', { limit: 30 });

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toContain(`${BASE_URL}/v1/search/doc.json?`);
    expect(url).toContain('query=%ED%95%99%EC%9C%84%EB%85%BC%EB%AC%B8');
    expect(url).toContain('display=10');
    expect(init.headers['X-Naver-Client-Id']).toBe(CLIENT_ID);
    expect(init.headers['X-Naver-Client-Secret']).toBe(CLIENT_SECRET);
  });
});
