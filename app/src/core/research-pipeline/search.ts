/**
 * Academic-search fan-out for the deep-research pipeline (FR-RES-002).
 *
 * Extracted from `pipeline.ts` (SPEC-DRS detailed-mode work) so both the
 * standard first pass and the detailed second pass (`detailedSearch.ts`) share
 * one search implementation, and so `pipeline.ts` stays under the project's
 * 300-line file limit. Behavior is byte-for-byte identical to the previous
 * in-pipeline version — this is a pure move, no logic change.
 */

import type { AcademicClient, PaperMetadata, SearchResult } from '../academic-api/types';
import type { FailedSource, GeneratedQueries } from './types';

/** Per-query result cap requested from each academic client. */
const SEARCH_LIMIT = 10;

/** Result of fanning out across every client for every relevant search term. */
export interface SearchOutcome {
  papers: PaperMetadata[];
  failedSources: FailedSource[];
}

/**
 * Fans out across clients in parallel, but each individual client's own
 * search terms run sequentially (one request at a time per client) —
 * user-feedback follow-up to ease Semantic Scholar's per-key rate limit,
 * which is much more likely to trip when the same client fires two lookups
 * at once than when two *different* clients do.  A source is recorded in
 * `failedSources` only when it produced no papers AND at least one of its
 * lookups failed — an empty-but-successful response is simply fewer papers,
 * not a failure.
 */
export async function runSearches(clients: AcademicClient[], queries: GeneratedQueries): Promise<SearchOutcome> {
  const perClient = await Promise.all(clients.map((client) => searchOneClient(client, queries)));

  const papers: PaperMetadata[] = [];
  const failedSources: FailedSource[] = [];
  for (const outcome of perClient) {
    papers.push(...outcome.papers);
    if (outcome.failed) failedSources.push(outcome.failed);
  }
  return { papers, failedSources };
}

interface ClientOutcome {
  papers: PaperMetadata[];
  failed?: FailedSource;
}

/**
 * Runs one client across all its terms *sequentially* (not `Promise.all`)
 * and folds the results/failure. Order-preserving, so `recordingClient`-style
 * tests still see terms logged in list order.
 */
async function searchOneClient(client: AcademicClient, queries: GeneratedQueries): Promise<ClientOutcome> {
  const terms = termsForSource(client, queries);
  const results: SearchResult[] = [];
  for (const term of terms) {
    results.push(await client.search(term, { limit: SEARCH_LIMIT }));
  }

  const papers: PaperMetadata[] = [];
  let firstFailureReason: FailedSource['reason'] | undefined;
  for (const result of results) {
    if (result.ok) {
      papers.push(...result.papers);
    } else if (firstFailureReason === undefined) {
      firstFailureReason = result.reason;
    }
  }

  // Only surface a failure when nothing usable came back from this source.
  if (papers.length === 0 && firstFailureReason !== undefined) {
    return { papers, failed: { source: client.source, reason: firstFailureReason } };
  }
  return { papers };
}

/**
 * Semantic Scholar searches English terms; OpenAlex searches BOTH Korean and
 * English terms; every other source (naverdoc, and — when a real key is
 * registered — KCI/ScienceON) searches Korean terms.
 *
 * OpenAlex gets both buckets (field feedback 2026-07-11): it is the only
 * keyless RELIABLE source, and Semantic Scholar's unauthenticated rate limit
 * makes it fail often — when it did, international coverage silently dropped
 * to zero and every result looked domestic. Routing the English terms to
 * OpenAlex as well guarantees international papers regardless of Semantic
 * Scholar's availability; title dedup absorbs any overlap.
 */
function termsForSource(client: AcademicClient, queries: GeneratedQueries): string[] {
  if (client.source === 'semanticscholar') return queries.en;
  if (client.source === 'openalex') return [...queries.ko, ...queries.en];
  return queries.ko;
}

/**
 * Removes duplicate papers by normalized title (whitespace + punctuation
 * stripped, lower-cased). The first occurrence wins, so ordering across
 * sources is stable.
 */
export function dedupePapers(papers: PaperMetadata[]): PaperMetadata[] {
  const seen = new Set<string>();
  const unique: PaperMetadata[] = [];
  for (const paper of papers) {
    const key = normalizeTitle(paper.title);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    unique.push(paper);
  }
  return unique;
}

/**
 * Removes papers whose normalized title already appears in `existing`, in
 * addition to de-duplicating `incoming` against itself. Used by the detailed
 * second pass to keep ONLY papers the first pass never collected, so screening
 * runs on new material only.
 */
export function dedupeAgainst(existing: PaperMetadata[], incoming: PaperMetadata[]): PaperMetadata[] {
  const seen = new Set<string>();
  for (const paper of existing) {
    const key = normalizeTitle(paper.title);
    if (key.length > 0) seen.add(key);
  }
  const fresh: PaperMetadata[] = [];
  for (const paper of incoming) {
    const key = normalizeTitle(paper.title);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    fresh.push(paper);
  }
  return fresh;
}

/** Normalizes a title for dedup: drop whitespace and punctuation, lower-case. */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .trim();
}
