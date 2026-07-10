/**
 * `research:run` / `research:progress` request/result shapes for the deep
 * research pipeline (FR-RES-001~006).
 */

import type { IpcPaperMetadata } from './library';

// --- research:run / research:progress ---

export interface ResearchRunRequest {
  question: string;
  /**
   * Paid-mode "상세검색" toggle: when true (and the user is on paid mode), the
   * pipeline runs one extra augmentation search + screen pass to backfill
   * papers the first pass missed. Optional — omitted/false runs the standard
   * single pass. The paid-tier gate is enforced in `researchGateHandlers.ts`;
   * the renderer toggle that sets this is follow-up UI work.
   */
  detailed?: boolean;
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
  /** Ready-to-display Korean source label (NOT the raw source id — see `metadata.source`). */
  source: string;
  /**
   * Full raw metadata exactly as returned by the academic client. The library
   * save button (FR-LIB-001) persists this whole object; its
   * `source`+`externalId` pair is the duplicate-detection key, which the
   * display fields above cannot provide.
   */
  metadata: IpcPaperMetadata;
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
