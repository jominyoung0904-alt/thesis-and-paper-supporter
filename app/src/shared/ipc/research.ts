/**
 * `research:run` / `research:progress` request/result shapes for the deep
 * research pipeline (FR-RES-001~006).
 */

// --- research:run / research:progress ---

export interface ResearchRunRequest {
  question: string;
}

export interface ResearchProgressPayload {
  stage: string;
  detail?: string;
}

export interface ResearchPaperPayload {
  title: string;
  authors: string[];
  year: number | null;
  url: string | null;
  source: string;
}

export interface ResearchFailedSourcePayload {
  source: string;
  reason: string;
}

export interface ResearchRunResult {
  report: string;
  /** Every screened paper (high/medium/low). Kept for backward compatibility. */
  papers: ResearchPaperPayload[];
  /** Papers actually cited in `report`'s body; array position (+1) is the `[n]` shown in text. */
  citedPapers: ResearchPaperPayload[];
  /** Medium-relevance papers never cited in `report`, capped at 8. */
  relatedPapers: ResearchPaperPayload[];
  failedSources: ResearchFailedSourcePayload[];
}
