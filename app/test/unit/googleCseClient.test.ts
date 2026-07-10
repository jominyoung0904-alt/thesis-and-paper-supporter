import { describe, expect, it, vi } from 'vitest';

import { classifyGoogleCseStatus, GoogleCseClient } from '../../src/core/academic-api/googleCseClient';
import type { FetchFn, SearchFailure, SearchResult } from '../../src/core/academic-api/types';

const BASE_URL = 'https://academic-api.example.invalid';
const CX = 'test-cx-id';

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

describe('GoogleCseClient', () => {
  it('mock mode returns well-shaped Korean thesis fixtures without any network call', async () => {
    const fetchFn = vi.fn();
    const client = new GoogleCseClient({
      baseUrl: BASE_URL,
      cx: CX,
      mockMode: true,
      fetchFn: fetchFn as unknown as FetchFn,
    });

    const result = await client.search('논문');

    expect(result.ok).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.papers.length).toBeGreaterThan(0);
      for (const paper of result.papers) {
        expect(paper.source).toBe('googlecse');
        expect(paper.authors).toEqual([]);
        expect(paper.year).toBeNull();
      }
    }
  });

  it('mock mode respects the limit option', async () => {
    const client = new GoogleCseClient({ baseUrl: BASE_URL, cx: CX, mockMode: true });

    const result = await client.search('', { limit: 2 });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.papers).toHaveLength(2);
  });

  it('real mode parses `{ items: [...] }` into PaperMetadata, using snippet as abstract', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      stubResponse({
        ok: true,
        json: {
          items: [
            {
              title: '대학원생 논문 작성 지원 도구 연구 : 석사학위논문',
              link: 'https://www.riss.kr/link?id=T99999999',
              snippet: '본 연구는 대학원생을 대상으로 논문 작성 지원 도구의 효과를 검증하였다.',
            },
          ],
        },
      }),
    );
    const client = new GoogleCseClient({ baseUrl: BASE_URL, cx: CX, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('논문 작성 지원');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.papers).toEqual([
        {
          source: 'googlecse',
          externalId: 'https://www.riss.kr/link?id=T99999999',
          title: '대학원생 논문 작성 지원 도구 연구 : 석사학위논문',
          authors: [],
          year: null,
          abstract: '본 연구는 대학원생을 대상으로 논문 작성 지원 도구의 효과를 검증하였다.',
          venue: 'RISS 학위논문 검색',
          url: 'https://www.riss.kr/link?id=T99999999',
          citationCount: null,
        },
      ]);
    }
  });

  it('returns ok:true with an empty papers array when Google omits `items` (zero results)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      stubResponse({ ok: true, json: { kind: 'customsearch#search', searchInformation: { totalResults: '0' } } }),
    );
    const client = new GoogleCseClient({ baseUrl: BASE_URL, cx: CX, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('아주 희귀한 검색어 123456');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.papers).toEqual([]);
  });

  it('returns reason:parse when the JSON body is not a plain object', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: true, json: [1, 2, 3] }));
    const client = new GoogleCseClient({ baseUrl: BASE_URL, cx: CX, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('parse');
  });

  it('returns reason:parse when `items` is present but not an array', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: true, json: { items: 'not-an-array' } }));
    const client = new GoogleCseClient({ baseUrl: BASE_URL, cx: CX, fetchFn: fetchFn as unknown as FetchFn });

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
            { title: '정상 항목', link: 'https://www.riss.kr/link?id=T2', snippet: null },
          ],
        },
      }),
    );
    const client = new GoogleCseClient({ baseUrl: BASE_URL, cx: CX, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.papers).toHaveLength(1);
      expect(result.papers[0]).toMatchObject({ title: '정상 항목', abstract: null });
    }
  });

  it('maps HTTP 400 to reason:auth (invalid key/cx)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      stubResponse({ ok: false, status: 400, json: { error: { message: 'API key not valid' } } }),
    );
    const client = new GoogleCseClient({ baseUrl: BASE_URL, cx: CX, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('auth');
  });

  it('maps HTTP 429 to reason:rate-limit', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: false, status: 429 }));
    const client = new GoogleCseClient({ baseUrl: BASE_URL, cx: CX, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('rate-limit');
  });

  it('maps HTTP 403 with a quota-related message to reason:rate-limit', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      stubResponse({ ok: false, status: 403, json: { error: { message: 'Daily Limit Exceeded. dailyLimitExceeded' } } }),
    );
    const client = new GoogleCseClient({ baseUrl: BASE_URL, cx: CX, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('rate-limit');
  });

  it('maps HTTP 403 without a quota-related message to reason:auth', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      stubResponse({ ok: false, status: 403, json: { error: { message: 'Custom Search API has not been used in project before or it is disabled.' } } }),
    );
    const client = new GoogleCseClient({ baseUrl: BASE_URL, cx: CX, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('auth');
  });

  it('returns reason:network (never throws) on a rejected fetch', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    const client = new GoogleCseClient({ baseUrl: BASE_URL, cx: CX, fetchFn: fetchFn as unknown as FetchFn });

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
    const client = new GoogleCseClient({ baseUrl: BASE_URL, cx: CX, fetchFn: fetchFn as unknown as FetchFn, timeoutMs: 5 });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('timeout');
  });

  it('returns reason:parse when the response body is not valid JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: true }));
    const client = new GoogleCseClient({ baseUrl: BASE_URL, cx: CX, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('parse');
  });

  it('builds the request url with key/cx/q/num params, capping num at 10', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: true, json: { items: [] } }));
    const client = new GoogleCseClient({
      baseUrl: BASE_URL,
      cx: CX,
      apiKey: 'user-google-key',
      fetchFn: fetchFn as unknown as FetchFn,
    });

    await client.search('학위논문', { limit: 30 });

    const [url] = fetchFn.mock.calls[0] as [string];
    expect(url).toContain(`${BASE_URL}/customsearch/v1?`);
    expect(url).toContain('key=user-google-key');
    expect(url).toContain(`cx=${CX}`);
    expect(url).toContain('num=10');
  });
});

describe('classifyGoogleCseStatus', () => {
  it('classifies 429 as rate-limit regardless of message', () => {
    expect(classifyGoogleCseStatus(429, undefined)).toBe('rate-limit');
  });

  it('classifies 400 as auth', () => {
    expect(classifyGoogleCseStatus(400, 'API key not valid')).toBe('auth');
  });

  it('classifies 403 with "quota" in the message as rate-limit', () => {
    expect(classifyGoogleCseStatus(403, 'quotaExceeded')).toBe('rate-limit');
  });

  it('classifies 403 without quota/limit wording as auth', () => {
    expect(classifyGoogleCseStatus(403, 'forbidden: access denied')).toBe('auth');
  });

  it('classifies any other non-2xx status as network', () => {
    expect(classifyGoogleCseStatus(500, undefined)).toBe('network');
  });
});
