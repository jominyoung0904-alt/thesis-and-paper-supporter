/**
 * Deep-research orchestration (FR-RES-001~006, FR-RES-009).
 *
 * Wires the four steps together with dependency injection: query generation →
 * parallel academic lookup + dedup → relevance screening → deterministic
 * report assembly. Failures of individual sources are collected as data and
 * reported transparently rather than aborting the run. The search fan-out
 * itself now lives in `search.ts` (shared with the detailed second pass).
 *
 * Resume support (FR-RES-007/008, T61): when `input.checkpoint` is wired,
 * progress after the two costly steps (search, screening) is saved via
 * `checkpoint.ts`. The next run for the *same question* skips straight past
 * whatever already completed instead of re-querying academic APIs or
 * re-screening. A different question discards the stale checkpoint — see
 * `resolveResume`. Report assembly (one LLM call) is never checkpointed
 * mid-flight: it is cheap to retry, and its failure is the documented trigger
 * for resuming on the next run.
 *
 * Detailed mode ("상세검색", `input.detailed`): after the first pass, one extra
 * augmentation search + screen pass runs (see `detailedSearch.ts`) and its
 * merged result is checkpointed under the 'detailed-screening' stage before
 * report. Omitting `input.detailed` (the default everywhere except a paid-mode
 * caller) preserves the exact single-pass behavior above.
 */

import type { PaperMetadata } from '../academic-api/types';
import type { CheckpointData } from './checkpoint';
import { runDetailedPass } from './detailedSearch';
import { generateQueries } from './queryGen';
import { assembleReport } from './report';
import { dedupePapers, runSearches } from './search';
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

// Re-exported so existing importers (`from './pipeline'`) keep working after
// the search fan-out moved to `search.ts` — notably `researchPipeline.test.ts`.
export { dedupePapers } from './search';

/** Progress detail prefixed onto the stage where a resumed run picks back up. */
const RESUME_NOTICE = '이전에 진행하던 리서치를 이어서 해요.';

/** What a usable checkpoint (matching this run's question) supplies to skip ahead. */
interface ResumedProgress {
  queries: GeneratedQueries;
  papers: PaperMetadata[];
  failedSources: FailedSource[];
  /** Screened papers from a completed screening stage (first-pass or merged), when present. */
  screened?: ScreenedPaper[];
  /** True when `screened` is the FINAL set: resume goes straight to report. */
  reportReady: boolean;
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
  const resumeStage = firstResumedStage(resumed);
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

  const screeningLlm = input.screeningLlm ?? input.llm;
  const screeningModel = input.screeningModel ?? input.model;

  let screened: ScreenedPaper[];
  if (resumed?.reportReady) {
    screened = resumed.screened ?? [];
  } else {
    // (d) First-pass relevance screening (optionally on a lighter model), unless
    // a 'searching'-only resume already carries no screened set and we run it now.
    let firstScreened: ScreenedPaper[];
    if (resumed?.screened !== undefined) {
      firstScreened = resumed.screened;
    } else {
      emit('screening', `${papers.length}편 스크리닝`);
      firstScreened =
        papers.length > 0
          ? await screenPapers(input.question, papers, input.memory, screeningLlm, screeningModel, usage)
          : [];
      persistCheckpoint(input, { queries, papers, failedSources, screened: firstScreened, completedStage: 'screening' });
    }

    if (input.detailed === true) {
      // (d2) Detailed second pass: augmentation search + screen new papers only,
      // then merge. Bounded to ≤3 extra LLM calls (see `detailedSearch.ts`).
      const detailed = await runDetailedPass({
        question: input.question,
        memory: input.memory,
        llm: input.llm,
        model: input.model,
        screeningLlm,
        screeningModel,
        clients: input.clients,
        firstQueries: queries,
        firstPapers: papers,
        firstScreened,
        firstFailedSources: failedSources,
        usage,
        emit,
      });
      queries = detailed.queries;
      papers = detailed.papers;
      failedSources = detailed.failedSources;
      screened = detailed.screened;
      persistCheckpoint(input, { queries, papers, failedSources, screened, completedStage: 'detailed-screening' });
    } else {
      screened = firstScreened;
    }
  }

  // @AX:NOTE: [AUTO] report assembly is deterministic — references are built from PaperMetadata only, never LLM-authored. Related: FR-RES-005
  // (e) Deterministic report assembly. If this throws, the screening (or
  // detailed-screening) checkpoint above survives on disk — the next run
  // resumes straight here.
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

/** Which stage carries the resume notice — the first stage a resumed run actually runs. */
function firstResumedStage(resumed: ResumedProgress | null): PipelineStage | null {
  if (resumed === null) return null;
  if (resumed.reportReady) return 'report';
  // A 'screening' checkpoint on a detailed run resumes into the detailed pass,
  // whose first emit is 'searching'; a 'searching' checkpoint resumes into screening.
  return resumed.screened !== undefined ? 'searching' : 'screening';
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

  const base = { queries: state.queries, papers: state.papers, failedSources: state.failedSources };

  if (state.completedStage === 'detailed-screening') {
    // Merged first+second set is final — go straight to report.
    return { ...base, screened: state.screened ?? [], reportReady: true };
  }
  if (state.completedStage === 'screening') {
    // A detailed run still owes its second pass; a standard run's set is final.
    return { ...base, screened: state.screened ?? [], reportReady: input.detailed !== true };
  }
  return { ...base, screened: undefined, reportReady: false };
}

/** No-ops when `input.checkpoint` is not wired — same convention as `emit`/`onProgress`. */
function persistCheckpoint(input: DeepResearchInput, data: Omit<CheckpointData, 'question'>): void {
  input.checkpoint?.save({ question: input.question, ...data });
}

function joinDetail(notice: string, detail?: string): string {
  return detail ? `${notice} ${detail}` : notice;
}
