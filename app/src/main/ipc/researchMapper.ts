/**
 * Maps a core `DeepResearchResult` (FR-RES-001~006) into the plain
 * `ResearchRunResult` IPC payload sent to the renderer.
 *
 * Korean labels for `source`/`reason` are attached here (via the core
 * pipeline's own `SOURCE_LABELS`/`FAILURE_REASON_LABELS` constants) so the
 * renderer never has to know about the internal `AcademicSource` /
 * `SearchFailureReason` unions — it only ever renders ready-to-display
 * strings. `usage`/`queries` are intentionally dropped; the renderer view
 * doesn't need them.
 */

import type { DeepResearchResult } from '../../core/research-pipeline/types';
import { FAILURE_REASON_LABELS, SOURCE_LABELS } from '../../core/research-pipeline/types';
import type { ResearchFailedSourcePayload, ResearchPaperPayload, ResearchRunResult } from '../../shared/ipc-channels';

export function mapDeepResearchResult(result: DeepResearchResult): ResearchRunResult {
  return {
    report: result.report,
    papers: result.papers.map(mapPaper),
    failedSources: result.failedSources.map(mapFailedSource),
  };
}

function mapPaper(screened: DeepResearchResult['papers'][number]): ResearchPaperPayload {
  const { paper } = screened;
  return {
    title: paper.title,
    authors: paper.authors,
    year: paper.year,
    url: paper.url,
    source: SOURCE_LABELS[paper.source],
  };
}

function mapFailedSource(failed: DeepResearchResult['failedSources'][number]): ResearchFailedSourcePayload {
  return {
    source: SOURCE_LABELS[failed.source],
    reason: FAILURE_REASON_LABELS[failed.reason],
  };
}
