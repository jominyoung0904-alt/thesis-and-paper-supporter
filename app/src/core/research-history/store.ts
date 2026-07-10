/**
 * Per-project directory store for deep-research run history (FR-RSH-001/002).
 *
 * Design decision: one record per file (`{id}.json`) rather than a single
 * shared index file — deep-research reports can be large (full report text
 * plus cited/related paper metadata), and a single growing JSON blob risks
 * slow writes and a larger corruption blast radius. The list view is built
 * by scanning the directory and parsing each file in full (no separate
 * index to keep in sync); local history volume is small enough that this
 * stays cheap, mirroring the `MemoryStore` atomic-write pattern.
 *
 * Path resolution is the caller's responsibility (see
 * src/main/project/projectPaths.ts `ProjectPaths.researchDir`); this class
 * only takes the final directory path.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { isSafeRecordId } from '../persistence/recordId';
import type { DeepResearchResult } from '../research-pipeline/types';
import type { ResearchRecord, ResearchRecordSummary } from './model';
import { createResearchRecord, isResearchRecord, toResearchRecordSummary } from './model';

/** Maximum number of research records kept per project; oldest are pruned on add(). */
const MAX_RECORDS = 50;

/** Matches a record's own file name (`{uuid}.json`); excludes `.tmp` write-ahead files. */
const RECORD_FILE_PATTERN = /^[0-9a-f-]+\.json$/i;

/**
 * Per-project directory of research-run records. Each record lives in its
 * own `{id}.json` file so a single large report never bloats a shared index
 * file, and a corrupted record never prevents the rest of the history from
 * loading (FR-RSH-002).
 */
export class ResearchHistoryStore {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  /**
   * Builds a ResearchRecord snapshot from a completed deep-research run and
   * persists it atomically (FR-RSH-001). When the history already holds the
   * maximum number of records, the oldest ones are removed until the cap is
   * satisfied.
   */
  add(question: string, result: DeepResearchResult): ResearchRecord {
    const record = createResearchRecord(question, result);
    this.writeRecord(record);
    this.enforceCap();
    return record;
  }

  /**
   * Lists every valid record as a lightweight summary, most recent first.
   * Corrupted or unreadable files are silently skipped — a single bad file
   * never breaks the rest of the history list.
   */
  listSummaries(): ResearchRecordSummary[] {
    return this.readAllValidRecords()
      .map(toResearchRecordSummary)
      .sort((a, b) => b.ranAt.localeCompare(a.ranAt));
  }

  /** Loads a single full record by id. Returns undefined when missing, corrupted, or an unsafe id (audit H1 defense-in-depth). */
  get(id: string): ResearchRecord | undefined {
    if (!isSafeRecordId(id)) return undefined;

    const filePath = this.recordFilePath(id);
    if (!existsSync(filePath)) return undefined;

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      return undefined;
    }

    return isResearchRecord(parsed) ? parsed : undefined;
  }

  /** Deletes a record's file. Returns false when the record does not exist or `id` is unsafe (audit H1 defense-in-depth). */
  remove(id: string): boolean {
    if (!isSafeRecordId(id)) return false;

    const filePath = this.recordFilePath(id);
    if (!existsSync(filePath)) return false;
    unlinkSync(filePath);
    return true;
  }

  private recordFilePath(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  /** Atomically persists a record: write to a temp file, then rename over the target. */
  private writeRecord(record: ResearchRecord): void {
    mkdirSync(this.dir, { recursive: true });
    const filePath = this.recordFilePath(record.id);
    const tmpPath = `${filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(record, null, 2), 'utf-8');
    renameSync(tmpPath, filePath);
  }

  /** Reads every `{id}.json` file in the directory, skipping anything unparsable or malformed. */
  private readAllValidRecords(): ResearchRecord[] {
    if (!existsSync(this.dir)) return [];

    const records: ResearchRecord[] = [];
    for (const entry of readdirSync(this.dir)) {
      if (!RECORD_FILE_PATTERN.test(entry)) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(join(this.dir, entry), 'utf-8'));
      } catch {
        continue;
      }

      if (isResearchRecord(parsed)) {
        records.push(parsed);
      }
    }
    return records;
  }

  /** Removes the oldest records beyond MAX_RECORDS so the history never grows unbounded. */
  private enforceCap(): void {
    const summaries = this.listSummaries();
    if (summaries.length <= MAX_RECORDS) return;

    for (const excess of summaries.slice(MAX_RECORDS)) {
      this.remove(excess.id);
    }
  }
}
