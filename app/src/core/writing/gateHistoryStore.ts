/**
 * Per-project, per-run persistence for quality-gate check history (FR-WRT-008/009).
 *
 * Each `add()` call writes one JSON file per record under a project's `gate/`
 * directory (see `ProjectPaths.gateDir` in src/main/project/projectPaths.ts).
 * This mirrors the atomic-write pattern established by
 * `src/core/memory/store.ts::MemoryStore` (write to `.tmp`, then rename), but
 * applies it per-record instead of to a single aggregate file — that keeps
 * writes cheap (no need to rewrite the whole history on every gate run) and
 * lets corrupted individual records be skipped without losing the rest of
 * the history.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { GateResult } from './qualityGate';

/** Keep at most this many records per project; oldest are pruned on every add(). */
const MAX_RECORDS = 30;
/** Number of leading characters shown in a GateRecordSummary's textPreview. */
const PREVIEW_LENGTH = 60;

/** One stored quality-gate run: the exact text checked, and its full GateResult. */
export interface GateRecord {
  id: string;
  sectionId: string;
  /** ISO-8601 timestamp of when the gate was run. */
  ranAt: string;
  text: string;
  result: GateResult;
}

/** Lightweight listing entry — omits the full text/result for a cheap history list view. */
export interface GateRecordSummary {
  id: string;
  sectionId: string;
  ranAt: string;
  passed: boolean;
  /** First PREVIEW_LENGTH characters of the checked text. */
  textPreview: string;
}

/**
 * On-disk shape: a GateRecord plus an internal write-order sequence number.
 * `seq` is never exposed on the public GateRecord/GateRecordSummary types —
 * it exists only so listSummaries() can sort "most recent first" reliably
 * even when two records are written within the same millisecond (ranAt
 * alone is not guaranteed to be strictly increasing at that resolution).
 */
interface StoredGateRecord extends GateRecord {
  seq: number;
}

/** Structural validation for a parsed JSON value read back from a record file. */
function isStoredGateRecord(value: unknown): value is StoredGateRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.sectionId === 'string' &&
    typeof r.ranAt === 'string' &&
    typeof r.text === 'string' &&
    typeof r.seq === 'number' &&
    typeof r.result === 'object' &&
    r.result !== null
  );
}

/**
 * File-per-record store for one project's quality-gate check history.
 * Path resolution is the caller's responsibility (see ProjectPaths.gateDir);
 * this class only takes the final directory path.
 */
export class GateHistoryStore {
  private readonly dir: string;
  private seqCounter = 0;

  constructor(dir: string) {
    this.dir = dir;
  }

  /** Persists a new gate run and prunes history down to MAX_RECORDS (oldest first). */
  add(sectionId: string, text: string, result: GateResult): GateRecord {
    const record: StoredGateRecord = {
      id: randomUUID(),
      sectionId,
      ranAt: new Date().toISOString(),
      text,
      result,
      seq: this.nextSeq(),
    };
    this.writeRecord(record);
    this.enforceCap();
    return this.toPublicRecord(record);
  }

  /** Lists all records as summaries, most recently run first. Corrupted records are silently skipped. */
  listSummaries(): GateRecordSummary[] {
    return this.readAllRecords()
      .sort((a, b) => b.seq - a.seq)
      .map((r) => ({
        id: r.id,
        sectionId: r.sectionId,
        ranAt: r.ranAt,
        passed: r.result.passed,
        textPreview: r.text.slice(0, PREVIEW_LENGTH),
      }));
  }

  /** Returns the full record (text + GateResult) for `id`, or undefined when missing/corrupted. */
  get(id: string): GateRecord | undefined {
    const record = this.readRecord(id);
    return record ? this.toPublicRecord(record) : undefined;
  }

  /** Deletes the record file for `id`. Returns false when no such record exists. */
  remove(id: string): boolean {
    const filePath = this.recordPath(id);
    if (!existsSync(filePath)) return false;
    unlinkSync(filePath);
    return true;
  }

  /** Monotonically increasing sort key: millisecond timestamp with an in-process tiebreaker. */
  private nextSeq(): number {
    this.seqCounter += 1;
    return Date.now() * 1000 + (this.seqCounter % 1000);
  }

  private recordPath(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  /** Atomically persists one record: write to a temp file, then rename over the target. */
  private writeRecord(record: StoredGateRecord): void {
    mkdirSync(this.dir, { recursive: true });
    const filePath = this.recordPath(record.id);
    const tmpPath = `${filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(record, null, 2), 'utf-8');
    renameSync(tmpPath, filePath);
  }

  private readRecord(id: string): StoredGateRecord | undefined {
    const filePath = this.recordPath(id);
    if (!existsSync(filePath)) return undefined;
    return this.parseRecordFile(filePath);
  }

  /** Reads every `*.json` record file in the directory, skipping any that fail to parse or validate. */
  private readAllRecords(): StoredGateRecord[] {
    if (!existsSync(this.dir)) return [];
    const entries = readdirSync(this.dir).filter((name) => name.endsWith('.json'));
    const records: StoredGateRecord[] = [];
    for (const name of entries) {
      const record = this.parseRecordFile(join(this.dir, name));
      if (record) records.push(record);
    }
    return records;
  }

  /** Never throws — an unreadable, unparsable, or malformed record file is treated as absent. */
  private parseRecordFile(filePath: string): StoredGateRecord | undefined {
    let raw: string;
    try {
      raw = readFileSync(filePath, 'utf-8');
    } catch {
      return undefined;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return undefined;
    }

    return isStoredGateRecord(parsed) ? parsed : undefined;
  }

  private toPublicRecord(record: StoredGateRecord): GateRecord {
    return {
      id: record.id,
      sectionId: record.sectionId,
      ranAt: record.ranAt,
      text: record.text,
      result: record.result,
    };
  }

  /** Deletes the oldest records beyond MAX_RECORDS, keeping the most recently written ones. */
  private enforceCap(): void {
    const records = this.readAllRecords().sort((a, b) => b.seq - a.seq);
    if (records.length <= MAX_RECORDS) return;

    for (const stale of records.slice(MAX_RECORDS)) {
      const filePath = this.recordPath(stale.id);
      if (existsSync(filePath)) unlinkSync(filePath);
    }
  }
}
