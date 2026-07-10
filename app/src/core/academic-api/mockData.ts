/**
 * Deterministic mock fixtures for the five academic API clients
 * (FR-RES-002, NFR-ACAPI-001). Used whenever a client is constructed with
 * `mockMode: true`.
 *
 * This module is a thin barrel: the actual fixture arrays live in
 * `mockDataDomestic.ts` (KCI/ScienceON), `mockDataIntl.ts` (Semantic
 * Scholar/OpenAlex), and `googleCseMockData.ts` (Google CSE, T32) — split out
 * to stay under the project's per-file line limit. Every client still
 * imports from this one module so callers never need to know about the
 * split.
 *
 * Field shapes mirror the real `PaperMetadata` contract exactly (authors as
 * an array, nullable abstract/venue/citationCount) so downstream code never
 * has to special-case mock vs. real data.
 */

import type { PaperMetadata } from './types';

export { GOOGLE_CSE_MOCK_PAPERS } from './googleCseMockData';
export { KCI_MOCK_PAPERS, SCIENCEON_MOCK_PAPERS } from './mockDataDomestic';
export { OPENALEX_MOCK_PAPERS, SEMANTIC_SCHOLAR_MOCK_PAPERS } from './mockDataIntl';

/**
 * Filters a mock fixture set by naive substring matching against the title
 * and abstract, simulating a real provider's relevance search without any
 * network call. Deterministic: same query + same fixture array always
 * yields the same ordered subset.
 *
 * An empty or whitespace-only query returns the first `limit` fixtures
 * unfiltered ("browse" behavior). A non-empty query that matches nothing
 * falls back to the first `limit` fixtures too, so mock mode never starves
 * the pipeline of results it can render — mirroring the real providers'
 * behavior of usually returning *something* for a broad query.
 */
export function filterMockPapers(papers: PaperMetadata[], query: string, limit: number): PaperMetadata[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) {
    return papers.slice(0, limit);
  }

  const tokens = trimmed.split(/\s+/).filter((token) => token.length > 0);
  const matched = papers.filter((paper) => {
    const haystack = `${paper.title} ${paper.abstract ?? ''} ${paper.authors.join(' ')}`.toLowerCase();
    return tokens.some((token) => haystack.includes(token));
  });

  return (matched.length > 0 ? matched : papers).slice(0, limit);
}
