/**
 * Deep-research orchestration (FR-RES-001~006, FR-RES-009).
 *
 * Wires the four steps together with dependency injection: query generation →
 * parallel academic lookup + dedup → relevance screening → deterministic
 * report assembly. Failures of individual sources are collected as data and
 * reported transparently rather than aborting the run.
 */

import type { AcademicClient, PaperMetadata, SearchResult } from '../academic-api/types';
import { generateQueries } from './queryGen';
import { assembleReport } from './report';
import { screenPapers } from './screening';
import type {
  DeepResearchInput,
  DeepResearchResult,
  FailedSource,
  GeneratedQueries,
  PipelineStage,
  ScreenedPaper,
} from './types';
import { createUsage } from './types';

/** Per-query result cap requested from each academic client. */
const SEARCH_LIMIT = 10;

/** Result of fanning out across every client for every relevant search term. */
interface SearchOutcome {
  papers: PaperMetadata[];
  failedSources: FailedSource[];
}

/**
 * Runs a full deep-research pipeline. Never rejects on a recoverable
 * condition (bad LLM JSON, a dead source): those degrade to fallbacks and
 * transparent reporting instead.
 */
// @AX:ANCHOR: [AUTO] deep-research orchestration entry point, wired from main/ipc/handlers.ts. Related: FR-RES-001~006
// @AX:TODO: [AUTO] KCI/ScienceON real-server response schema is unconfirmed — see core/academic-api/kciClient.ts, scienceOnClient.ts. Related: FR-RES-002
export async function runDeepResearch(input: DeepResearchInput): Promise<DeepResearchResult> {
  const usage = createUsage();
  const emit = (stage: PipelineStage, detail?: string): void => input.onProgress?.({ stage, detail });

  // (a) Query generation — one LLM call, with parse-retry + raw-question fallback.
  emit('query-gen');
  const { queries } = await generateQueries(input.question, input.memory, input.llm, input.model, usage);

  // (b) Parallel lookup across all clients, then (c) title-based dedup.
  emit('searching', `국문 ${queries.ko.length}개 · 영문 ${queries.en.length}개 검색어`);
  const { papers, failedSources } = await runSearches(input.clients, queries);
  const deduped = dedupePapers(papers);

  // (d) Relevance screening (optionally on a lighter model).
  emit('screening', `${deduped.length}편 스크리닝`);
  const screeningLlm = input.screeningLlm ?? input.llm;
  const screeningModel = input.screeningModel ?? input.model;
  const screened: ScreenedPaper[] =
    deduped.length > 0
      ? await screenPapers(input.question, deduped, input.memory, screeningLlm, screeningModel, usage)
      : [];

  // @AX:NOTE: [AUTO] report assembly is deterministic — references are built from PaperMetadata only, never LLM-authored. Related: FR-RES-005
  // (e) Deterministic report assembly.
  emit('report');
  const participatingSources = input.clients.map((client) => client.source);
  const assembled = await assembleReport(
    input.question,
    screened,
    failedSources,
    input.memory,
    input.llm,
    input.model,
    usage,
    participatingSources,
    queries.ko[0] ?? input.question,
  );

  return {
    report: assembled.report,
    papers: screened,
    citedPapers: assembled.citedPapers,
    relatedPapers: assembled.relatedPapers,
    queries,
    failedSources,
    usage,
  };
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
async function runSearches(clients: AcademicClient[], queries: GeneratedQueries): Promise<SearchOutcome> {
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
 * Semantic Scholar searches English terms; every other source (OpenAlex,
 * and — when a real key is registered — KCI/ScienceON) searches Korean
 * terms (SPEC-TSA-001 후속: OpenAlex는 키 없이 국내 학술지를 반환하므로 이제
 * 국문 검색어를 담당하는 기본 소스다).
 */
function termsForSource(client: AcademicClient, queries: GeneratedQueries): string[] {
  return client.source === 'semanticscholar' ? queries.en : queries.ko;
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

/** Normalizes a title for dedup: drop whitespace and punctuation, lower-case. */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .trim();
}
