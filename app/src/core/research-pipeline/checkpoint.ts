/**
 * Deep-research checkpoint persistence (FR-RES-007/008, SPEC-TSA-001 T16
 * follow-up completed here per SPEC-TSA-002 T61).
 *
 * A single JSON file per project (see `ProjectPaths.checkpointFile`) tracks
 * the last completed pipeline stage plus the intermediate artifacts needed to
 * skip that work on the next run: the generated search queries, the deduped
 * papers collected, and (once screening finishes) the screened papers. The
 * report-assembly step is intentionally never checkpointed mid-flight — it is
 * the cheapest-to-retry step (one LLM call) and its failure is the documented
 * resume trigger (see `pipeline.ts`).
 *
 * Corruption handling mirrors `memory/store.ts`'s philosophy but goes one step
 * further: rather than backing up and recreating, a checkpoint is disposable
 * scratch data, so any read failure (missing file, bad JSON, schema
 * mismatch, wrong `version`) simply resumes as "no checkpoint" — the pipeline
 * restarts from scratch. `loadCheckpoint` therefore NEVER throws.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { PaperMetadata } from '../academic-api/types';
import type { FailedSource, GeneratedQueries, ScreenedPaper } from './types';

/** Bumped whenever the on-disk shape changes; a mismatch is treated as "no checkpoint". */
export const CHECKPOINT_SCHEMA_VERSION = 1;

/** Coarse marker of how far a checkpointed run had progressed. */
export type CheckpointStage = 'searching' | 'screening';

/** The data a caller supplies when checkpointing progress (no version/timestamp bookkeeping). */
export interface CheckpointData {
  /** The question this checkpoint belongs to — the resume guard key (see `pipeline.ts::resolveResume`). */
  question: string;
  queries: GeneratedQueries;
  /** Deduped papers collected by the search step. */
  papers: PaperMetadata[];
  failedSources: FailedSource[];
  /** Present only once the screening step has completed. */
  screened?: ScreenedPaper[];
  completedStage: CheckpointStage;
}

/** The full on-disk shape: `CheckpointData` plus schema/version bookkeeping. */
export interface CheckpointState extends CheckpointData {
  version: number;
  /** ISO-8601 timestamp of the last save — informational only, not read by the pipeline. */
  savedAt: string;
}

/** Structural validation for a parsed JSON value read back from the checkpoint file. */
function isCheckpointState(value: unknown): value is CheckpointState {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  if (r.version !== CHECKPOINT_SCHEMA_VERSION) return false;
  if (typeof r.question !== 'string' || typeof r.savedAt !== 'string') return false;
  if (r.completedStage !== 'searching' && r.completedStage !== 'screening') return false;
  if (typeof r.queries !== 'object' || r.queries === null) return false;
  if (!Array.isArray(r.papers) || !Array.isArray(r.failedSources)) return false;
  if (r.screened !== undefined && !Array.isArray(r.screened)) return false;
  return true;
}

/**
 * Atomically persists `data` to `file`: write to a temp file, then rename
 * over the target (same pattern as `memory/store.ts`, `gateHistoryStore.ts`).
 * Never throws — a checkpoint write is a best-effort optimization, never a
 * condition the pipeline's actual result should depend on.
 */
export function saveCheckpoint(file: string, data: CheckpointData): void {
  try {
    const state: CheckpointState = { ...data, version: CHECKPOINT_SCHEMA_VERSION, savedAt: new Date().toISOString() };
    mkdirSync(dirname(file), { recursive: true });
    const tmpPath = `${file}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
    renameSync(tmpPath, file);
  } catch (err) {
    console.error('[research-checkpoint] failed to save checkpoint:', err);
  }
}

/**
 * Reads a checkpoint from `file`. Returns `null` when the file is absent,
 * unreadable, unparsable, schema-mismatched, or otherwise malformed — the
 * caller always treats `null` as "start from scratch", never as an error.
 */
export function loadCheckpoint(file: string): CheckpointState | null {
  try {
    if (!existsSync(file)) return null;
    const raw = readFileSync(file, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    return isCheckpointState(parsed) ? parsed : null;
  } catch (err) {
    console.error('[research-checkpoint] failed to load checkpoint (starting fresh):', err);
    return null;
  }
}

/** Deletes the checkpoint file, if present. Never throws — cleanup is best-effort. */
export function clearCheckpoint(file: string): void {
  try {
    if (existsSync(file)) unlinkSync(file);
  } catch (err) {
    console.error('[research-checkpoint] failed to clear checkpoint:', err);
  }
}
