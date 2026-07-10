/**
 * Domain model for the research history core (FR-RSH-001/002).
 *
 * A ResearchRecord is a storage-time snapshot derived from a completed
 * DeepResearchResult plus the question that produced it. It intentionally
 * captures only `citedPapers`/`relatedPapers` (not the full `papers` array
 * or `queries`) — the fields a later "reopen this research" or "meet about
 * this result" flow (FR-RSH-002/003) actually needs.
 */

import { randomUUID } from 'node:crypto';

import type { DeepResearchResult, FailedSource, ScreenedPaper, UsageTotals } from '../research-pipeline/types';

/** Bump when the on-disk shape of `ResearchRecord` changes incompatibly. */
export const RESEARCH_RECORD_SCHEMA_VERSION = 1;

function nowIso(): string {
  return new Date().toISOString();
}

/** A single saved deep-research run, one file per record (`{id}.json`). */
export interface ResearchRecord {
  schemaVersion: number;
  id: string;
  question: string;
  ranAt: string;
  report: string;
  citedPapers: ScreenedPaper[];
  relatedPapers: ScreenedPaper[];
  failedSources: FailedSource[];
  usage: UsageTotals;
}

/** Lightweight list-view projection of a ResearchRecord (FR-RSH-002 history list). */
export interface ResearchRecordSummary {
  id: string;
  question: string;
  ranAt: string;
  citedCount: number;
}

/**
 * Builds a ResearchRecord snapshot from a completed pipeline result. Called
 * once, right after a deep-research run finishes (FR-RSH-001).
 */
export function createResearchRecord(question: string, result: DeepResearchResult): ResearchRecord {
  return {
    schemaVersion: RESEARCH_RECORD_SCHEMA_VERSION,
    id: randomUUID(),
    question,
    ranAt: nowIso(),
    report: result.report,
    citedPapers: result.citedPapers,
    relatedPapers: result.relatedPapers,
    failedSources: result.failedSources,
    usage: result.usage,
  };
}

/** Projects a full record down to its list-view summary. */
export function toResearchRecordSummary(record: ResearchRecord): ResearchRecordSummary {
  return {
    id: record.id,
    question: record.question,
    ranAt: record.ranAt,
    citedCount: record.citedPapers.length,
  };
}

/**
 * Runtime shape check used by ResearchHistoryStore to decide whether a JSON
 * file on disk is a well-formed ResearchRecord or should be skipped as
 * corrupted (list/get operations must stay usable even if one file is bad).
 */
export function isResearchRecord(value: unknown): value is ResearchRecord {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.schemaVersion === 'number' &&
    typeof candidate.id === 'string' &&
    typeof candidate.question === 'string' &&
    typeof candidate.ranAt === 'string' &&
    typeof candidate.report === 'string' &&
    Array.isArray(candidate.citedPapers) &&
    Array.isArray(candidate.relatedPapers) &&
    Array.isArray(candidate.failedSources) &&
    typeof candidate.usage === 'object' &&
    candidate.usage !== null
  );
}
