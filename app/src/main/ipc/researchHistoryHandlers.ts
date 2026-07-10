/**
 * IPC handlers for saved research history (`research-history:list/get/remove`,
 * FR-RSH-001/002) plus `saveResearchRecord()`, the auto-save helper called
 * right after a successful `research:run` (wired centrally into
 * `researchGateHandlers.ts` — see this task's "배선 명세" report).
 *
 * Follows the same domain-handler-file split as `chatHandlers.ts` /
 * `researchGateHandlers.ts` (T40, SPEC-TSA-002) to stay under the project's
 * 300-line file limit. `ResearchHistoryChannels` is imported directly from
 * `shared/ipc/researchHistory.ts` rather than the central `ipc-channels.ts`
 * barrel, so this module compiles independently of the central wiring pass.
 */

import { ipcMain } from 'electron';

import { ResearchHistoryStore } from '../../core/research-history/store';
import type { ResearchRecord } from '../../core/research-history/model';
import type { DeepResearchResult, FailedSource, ScreenedPaper } from '../../core/research-pipeline/types';
import { FAILURE_REASON_LABELS, SOURCE_LABELS } from '../../core/research-pipeline/types';
import {
  ResearchHistoryChannels,
  type ResearchHistoryGetRequest,
  type ResearchHistoryGetResult,
  type ResearchHistoryListResult,
  type ResearchHistoryRecord,
  type ResearchHistoryRemoveRequest,
  type ResearchHistoryRemoveResult,
} from '../../shared/ipc/researchHistory';
import type { ResearchFailedSourcePayload, ResearchPaperPayload } from '../../shared/ipc/research';
import { INVALID_REQUEST_MESSAGE, isSafeRecordId } from './guards';

export interface ResearchHistoryHandlerDeps {
  /**
   * Returns the ACTIVE project's research history directory. Re-invoked on
   * every call (rather than captured once) so a project switch is reflected
   * on the very next channel invocation — mirrors `getMemoryStore` in
   * `chatHandlers.ts` / `researchGateHandlers.ts` (T39/T41, FR-PRJ-002).
   */
  getResearchDir: () => string;
}

/** Registers `research-history:list`, `research-history:get`, `research-history:remove`. */
export function registerResearchHistoryHandlers(deps: ResearchHistoryHandlerDeps): void {
  const { getResearchDir } = deps;

  ipcMain.handle(ResearchHistoryChannels.RESEARCH_HISTORY_LIST, async (): Promise<ResearchHistoryListResult> => {
    const store = new ResearchHistoryStore(getResearchDir());
    return { records: store.listSummaries() };
  });

  ipcMain.handle(
    ResearchHistoryChannels.RESEARCH_HISTORY_GET,
    async (_event, payload: ResearchHistoryGetRequest): Promise<ResearchHistoryGetResult> => {
      if (!isSafeRecordId(payload?.id)) {
        throw new Error(INVALID_REQUEST_MESSAGE);
      }

      const store = new ResearchHistoryStore(getResearchDir());
      const record = store.get(payload.id);
      return record ? toIpcRecord(record) : null;
    },
  );

  ipcMain.handle(
    ResearchHistoryChannels.RESEARCH_HISTORY_REMOVE,
    async (_event, payload: ResearchHistoryRemoveRequest): Promise<ResearchHistoryRemoveResult> => {
      if (!isSafeRecordId(payload?.id)) {
        throw new Error(INVALID_REQUEST_MESSAGE);
      }

      const store = new ResearchHistoryStore(getResearchDir());
      return { ok: store.remove(payload.id) };
    },
  );
}

/**
 * Builds a `ResearchRecord` snapshot from `question`/`result` and persists it
 * into `researchDir` (FR-RSH-001). Intended to be called from
 * `research:run`'s success path right after `mapDeepResearchResult` — see
 * this task's wiring snippet for `researchGateHandlers.ts`.
 *
 * Save failures are logged and swallowed, never thrown: a broken history
 * write must never fail (or even delay) the research response the user is
 * already waiting on.
 */
export function saveResearchRecord(researchDir: string, question: string, result: DeepResearchResult): void {
  try {
    new ResearchHistoryStore(researchDir).add(question, result);
  } catch (err) {
    console.error('[research-history] failed to save research record:', err);
  }
}

function toIpcRecord(record: ResearchRecord): ResearchHistoryRecord {
  return {
    id: record.id,
    question: record.question,
    ranAt: record.ranAt,
    report: record.report,
    citedPapers: record.citedPapers.map(mapPaper),
    relatedPapers: record.relatedPapers.map(mapPaper),
    failedSources: record.failedSources.map(mapFailedSource),
  };
}

function mapPaper(screened: ScreenedPaper): ResearchPaperPayload {
  const { paper } = screened;
  return {
    title: paper.title,
    authors: paper.authors,
    year: paper.year,
    url: paper.url,
    source: SOURCE_LABELS[paper.source],
    // Raw metadata rides along (same as `researchMapper.ts`) so the reopened
    // history view can offer the same library-save button (FR-LIB-001).
    metadata: {
      source: paper.source,
      externalId: paper.externalId,
      title: paper.title,
      authors: paper.authors,
      year: paper.year,
      abstract: paper.abstract,
      venue: paper.venue,
      url: paper.url,
      citationCount: paper.citationCount,
    },
  };
}

function mapFailedSource(failed: FailedSource): ResearchFailedSourcePayload {
  return {
    source: SOURCE_LABELS[failed.source],
    reason: FAILURE_REASON_LABELS[failed.reason],
  };
}
