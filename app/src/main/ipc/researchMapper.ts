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
    citedPapers: result.citedPapers.map(mapPaper),
    relatedPapers: result.relatedPapers.map(mapPaper),
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
    // Raw metadata rides along untouched so the renderer's library save
    // button (FR-LIB-001) can persist the full record — the display fields
    // above lose `externalId`/raw `source`, the duplicate-detection key.
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

function mapFailedSource(failed: DeepResearchResult['failedSources'][number]): ResearchFailedSourcePayload {
  return {
    source: SOURCE_LABELS[failed.source],
    reason: FAILURE_REASON_LABELS[failed.reason],
  };
}
