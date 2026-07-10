/**
 * Deep-research orchestration (FR-RES-001~006, FR-RES-009).
 *
 * Wires the four steps together with dependency injection: query generation →
 * parallel academic lookup + dedup → relevance screening → deterministic
 * report assembly. Failures of individual sources are collected as data and
 * reported transparently rather than aborting the run.
 *
 * Resume support (FR-RES-007/008, T61): when `input.checkpoint` is wired,
 * progress after the two costly steps (search, screening) is saved via
 * `checkpoint.ts`. The next run for the *same question* skips straight past
 * whatever already completed instead of re-querying academic APIs or
 * re-screening. A different question discards the stale checkpoint — see
 * `resolveResume`. Report assembly (one LLM call) is never checkpointed
 * mid-flight: it is cheap to retry, and its failure is the documented trigger
 * for resuming on the next run.
 */

import type { AcademicClient, PaperMetadata, SearchResult } from '../academic-api/types';
import type { CheckpointData } from './checkpoint';
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

/** Progress detail prefixed onto the stage where a resumed run picks back up. */
const RESUME_NOTICE = '이전에 진행하던 리서치를 이어서 해요.';

/** Result of fanning out across every client for every relevant search term. */
interface SearchOutcome {
  papers: PaperMetadata[];
  failedSources: FailedSource[];
}

/** What a usable checkpoint (matching this run's question) supplies to skip ahead. */
interface ResumedProgress {
  queries: GeneratedQueries;
  papers: PaperMetadata[];
  failedSources: FailedSource[];
  /** Present only when the checkpoint completed screening too (skip straight to report). */
  screened?: ScreenedPaper[];
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
  const resumed = resolveResume(input);
  // The one stage that will actually run first gets the resume notice prefixed
  // onto its own detail text; every other emit() call is unaffected.
  const resumeStage: PipelineStage | null = resumed === null ? null : resumed.screened !== undefined ? 'report' : 'screening';
  const emit = (stage: PipelineStage, detail?: string): void => {
    input.onProgress?.({ stage, detail: stage === resumeStage ? joinDetail(RESUME_NOTICE, detail) : detail });
  };

  let queries: GeneratedQueries;
  let papers: PaperMetadata[];
  let failedSources: FailedSource[];

  if (resumed !== null) {
    ({ queries, papers, failedSources } = resumed);
  } else {
    // (a) Query generation — one LLM call, with parse-retry + raw-question fallback.
    emit('query-gen');
    ({ queries } = await generateQueries(input.question, input.memory, input.llm, input.model, usage));

    // (b) Parallel lookup across all clients, then (c) title-based dedup.
    emit('searching', `국문 ${queries.ko.length}개 · 영문 ${queries.en.length}개 검색어`);
    const searchOutcome = await runSearches(input.clients, queries);
    papers = dedupePapers(searchOutcome.papers);
    failedSources = searchOutcome.failedSources;
    persistCheckpoint(input, { queries, papers, failedSources, completedStage: 'searching' });
  }

  let screened: ScreenedPaper[];
  if (resumed?.screened !== undefined) {
    screened = resumed.screened;
  } else {
    // (d) Relevance screening (optionally on a lighter model).
    emit('screening', `${papers.length}편 스크리닝`);
    const screeningLlm = input.screeningLlm ?? input.llm;
    const screeningModel = input.screeningModel ?? input.model;
    screened =
      papers.length > 0
        ? await screenPapers(input.question, papers, input.memory, screeningLlm, screeningModel, usage)
        : [];
    persistCheckpoint(input, { queries, papers, failedSources, screened, completedStage: 'screening' });
  }

  // @AX:NOTE: [AUTO] report assembly is deterministic — references are built from PaperMetadata only, never LLM-authored. Related: FR-RES-005
  // (e) Deterministic report assembly. If this throws, the 'screening'
  // checkpoint above survives on disk — the next run resumes straight here.
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

  input.checkpoint?.clear();

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
 * Reads `input.checkpoint` (if wired) and decides whether it can be reused.
 * A checkpoint only resumes work when its `question` matches this run's
 * verbatim — a different question means the user asked something new, so the
 * stale checkpoint is discarded (never silently reused for the wrong topic).
 */
function resolveResume(input: DeepResearchInput): ResumedProgress | null {
  const checkpoint = input.checkpoint;
  if (!checkpoint) return null;

  const state = checkpoint.load();
  if (!state) return null;

  if (state.question !== input.question) {
    checkpoint.clear();
    return null;
  }

  return {
    queries: state.queries,
    papers: state.papers,
    failedSources: state.failedSources,
    screened: state.completedStage === 'screening' ? (state.screened ?? []) : undefined,
  };
}

/** No-ops when `input.checkpoint` is not wired — same convention as `emit`/`onProgress`. */
function persistCheckpoint(input: DeepResearchInput, data: Omit<CheckpointData, 'question'>): void {
  input.checkpoint?.save({ question: input.question, ...data });
}

function joinDetail(notice: string, detail?: string): string {
  return detail ? `${notice} ${detail}` : notice;
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
