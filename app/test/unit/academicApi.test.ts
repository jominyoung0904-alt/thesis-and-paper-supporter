import { describe, expect, it, vi } from 'vitest';

import { KciClient } from '../../src/core/academic-api/kciClient';
import { ScienceOnClient } from '../../src/core/academic-api/scienceOnClient';
import { SemanticScholarClient } from '../../src/core/academic-api/semanticScholarClient';
import type { FetchFn, SearchFailure, SearchResult } from '../../src/core/academic-api/types';

const BASE_URL = 'https://academic-api.example.invalid';

/** Builds a minimal fetch-shaped Response stub for a given status/body. */
function stubResponse(opts: { ok: boolean; status?: number; text?: string; json?: unknown }): Response {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    text: () => Promise.resolve(opts.text ?? ''),
    json: () => (opts.json === undefined ? Promise.reject(new SyntaxError('no json')) : Promise.resolve(opts.json)),
  } as unknown as Response;
}

function expectFailure(result: SearchResult): asserts result is SearchFailure {
  if (result.ok) throw new Error('expected a failure SearchResult');
}

describe('KciClient', () => {
  it('mock mode returns well-shaped Korean fixtures without any network call', async () => {
    const fetchFn = vi.fn();
    const client = new KciClient({ baseUrl: BASE_URL, mockMode: true, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('연구');

    expect(result.ok).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.papers.length).toBeGreaterThan(0);
      for (const paper of result.papers) {
        expect(paper.source).toBe('kci');
        expect(Array.isArray(paper.authors)).toBe(true);
      }
    }
  });

  it('mock mode respects the limit option', async () => {
    const client = new KciClient({ baseUrl: BASE_URL, mockMode: true });

    const result = await client.search('', { limit: 2 });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.papers).toHaveLength(2);
  });

  it('mock mode filters fixtures deterministically by query token', async () => {
    const client = new KciClient({ baseUrl: BASE_URL, mockMode: true });

    const result = await client.search('표절', { limit: 10 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.papers.some((paper) => paper.title.includes('표절'))).toBe(true);
    }
  });

  it('real mode parses a well-formed XML item list into PaperMetadata', async () => {
    const xml = `<response><body><items>
      <item><title>테스트 논문 제목</title><author>홍길동, 김철수</author><pubYear>2023</pubYear></item>
      <item><title>두번째 논문</title><author>이영희</author><pubYear>2021</pubYear></item>
    </items></body></response>`;
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: true, text: xml }));
    const client = new KciClient({ baseUrl: BASE_URL, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('테스트');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.papers).toHaveLength(2);
      expect(result.papers[0]).toMatchObject({
        source: 'kci',
        title: '테스트 논문 제목',
        authors: ['홍길동', '김철수'],
        year: 2023,
      });
    }
  });

  it('returns reason:parse (not a thrown exception) when the XML has no item elements', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: true, text: '<html><body>Service Unavailable</body></html>' }));
    const client = new KciClient({ baseUrl: BASE_URL, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('query');

    expectFailure(result);
    expect(result.reason).toBe('parse');
  });

  it('maps HTTP 401 to reason:auth and HTTP 429 to reason:rate-limit', async () => {
    const authFetch = vi.fn().mockResolvedValue(stubResponse({ ok: false, status: 401 }));
    const authClient = new KciClient({ baseUrl: BASE_URL, fetchFn: authFetch as unknown as FetchFn });
    const authResult = await authClient.search('q');
    expectFailure(authResult);
    expect(authResult.reason).toBe('auth');

    const rateFetch = vi.fn().mockResolvedValue(stubResponse({ ok: false, status: 429 }));
    const rateClient = new KciClient({ baseUrl: BASE_URL, fetchFn: rateFetch as unknown as FetchFn });
    const rateResult = await rateClient.search('q');
    expectFailure(rateResult);
    expect(rateResult.reason).toBe('rate-limit');
  });

  it('returns reason:network (never throws) when fetch rejects with a generic error', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    const client = new KciClient({ baseUrl: BASE_URL, fetchFn: fetchFn as unknown as FetchFn });

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
    const client = new KciClient({ baseUrl: BASE_URL, fetchFn: fetchFn as unknown as FetchFn, timeoutMs: 5 });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('timeout');
  });
});

describe('ScienceOnClient', () => {
  it('mock mode returns well-shaped Korean fixtures spanning social science and engineering', async () => {
    const client = new ScienceOnClient({ baseUrl: BASE_URL, mockMode: true });

    const result = await client.search('');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.papers.length).toBeGreaterThanOrEqual(6);
      for (const paper of result.papers) expect(paper.source).toBe('scienceon');
    }
  });

  it('real mode sends the accessToken as a Bearer header and parses the JSON hit list', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      stubResponse({
        ok: true,
        json: {
          result: {
            hits: [
              { CN: 'ABC123', title: '실증 연구 사례', author: '홍길동,김철수', yearInfo: '2022', citedCnt: 5 },
            ],
          },
        },
      }),
    );
    const client = new ScienceOnClient({
      baseUrl: BASE_URL,
      accessToken: 'token-abc',
      fetchFn: fetchFn as unknown as FetchFn,
    });

    const result = await client.search('실증');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.papers[0]).toMatchObject({ title: '실증 연구 사례', authors: ['홍길동', '김철수'], year: 2022, citationCount: 5 });
    }
    const [, init] = fetchFn.mock.calls[0] as [string, { headers?: Record<string, string> }];
    expect(init.headers).toEqual({ Authorization: 'Bearer token-abc' });
  });

  it('returns reason:parse when the JSON body does not match the expected hits shape', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: true, json: { unexpected: true } }));
    const client = new ScienceOnClient({ baseUrl: BASE_URL, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('parse');
  });

  it('maps a non-2xx HTTP status outside 401/403/429 to reason:network', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: false, status: 500 }));
    const client = new ScienceOnClient({ baseUrl: BASE_URL, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('network');
  });
});

describe('SemanticScholarClient', () => {
  it('mock mode returns well-shaped English fixtures', async () => {
    const client = new SemanticScholarClient({ baseUrl: BASE_URL, mockMode: true });

    const result = await client.search('learning');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.papers.length).toBeGreaterThan(0);
      for (const paper of result.papers) expect(paper.source).toBe('semanticscholar');
    }
  });

  it('real mode parses the Graph API `data[]` shape, including nested author names', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      stubResponse({
        ok: true,
        json: {
          total: 1,
          data: [
            {
              paperId: 'abc123',
              title: 'Deep Research Pipelines for Literature Review',
              authors: [{ authorId: '1', name: 'A. Researcher' }],
              year: 2024,
              abstract: 'An abstract.',
              venue: 'ACL',
              url: 'https://www.semanticscholar.org/paper/abc123',
              citationCount: 12,
            },
          ],
        },
      }),
    );
    const client = new SemanticScholarClient({ baseUrl: BASE_URL, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('literature review');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.papers).toEqual([
        {
          source: 'semanticscholar',
          externalId: 'abc123',
          title: 'Deep Research Pipelines for Literature Review',
          authors: ['A. Researcher'],
          year: 2024,
          abstract: 'An abstract.',
          venue: 'ACL',
          url: 'https://www.semanticscholar.org/paper/abc123',
          citationCount: 12,
        },
      ]);
    }
  });

  it('returns reason:network (never throws) on a rejected fetch', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));
    const client = new SemanticScholarClient({ baseUrl: BASE_URL, fetchFn: fetchFn as unknown as FetchFn });

    await expect(client.search('q')).resolves.toEqual(expect.objectContaining({ ok: false, reason: 'network' }));
  });

  it('maps HTTP 429 to reason:rate-limit', async () => {
    const fetchFn = vi.fn().mockResolvedValue(stubResponse({ ok: false, status: 429 }));
    const client = new SemanticScholarClient({ baseUrl: BASE_URL, fetchFn: fetchFn as unknown as FetchFn });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('rate-limit');
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
    const client = new SemanticScholarClient({ baseUrl: BASE_URL, fetchFn: fetchFn as unknown as FetchFn, timeoutMs: 5 });

    const result = await client.search('q');

    expectFailure(result);
    expect(result.reason).toBe('timeout');
  });
});
