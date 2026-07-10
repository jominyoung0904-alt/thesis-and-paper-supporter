/**
 * Per-project, per-run persistence for mock-review history (FR-WRT-011, "동일한
 * 저장 패턴" as FR-WRT-008).
 *
 * Structurally a copy of `GateHistoryStore` (gateHistoryStore.ts): one JSON
 * file per record, atomic write (`.tmp` then rename), corrupted records
 * silently skipped, capped at MAX_RECORDS oldest-pruned. The directory is
 * caller-supplied — this store has no opinion on where mock-review records
 * live on disk (see the module-level note in mockReview.ts's companion
 * report about `resolveProjectPaths` needing a `mockReviewDir` addition;
 * `projectPaths.ts` is out of scope for this task).
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { MockReviewOutcome } from './mockReview';

/** Keep at most this many records per project; oldest are pruned on every add(). */
const MAX_RECORDS = 30;
/** Number of leading characters shown in a MockReviewRecordSummary's textPreview. */
const PREVIEW_LENGTH = 60;

/** One stored mock-review run: the exact manuscript text checked, and its full outcome. */
export interface MockReviewRecord {
  id: string;
  /** ISO-8601 timestamp of when the mock review was run. */
  ranAt: string;
  text: string;
  result: MockReviewOutcome;
}

/** Lightweight listing entry — omits the full text/result for a cheap history list view. */
export interface MockReviewRecordSummary {
  id: string;
  ranAt: string;
  /** Mirrors `result.ok` — false when the LLM response could not be parsed (fail-closed run). */
  ok: boolean;
  /** First PREVIEW_LENGTH characters of the reviewed text. */
  textPreview: string;
}

/**
 * On-disk shape: a MockReviewRecord plus an internal write-order sequence
 * number. `seq` is never exposed on the public MockReviewRecord/Summary
 * types — it exists only so listSummaries() can sort "most recent first"
 * reliably even when two records are written within the same millisecond
 * (ranAt alone is not guaranteed to be strictly increasing at that
 * resolution).
 */
interface StoredMockReviewRecord extends MockReviewRecord {
  seq: number;
}

/** Structural validation for a parsed JSON value read back from a record file. */
function isStoredMockReviewRecord(value: unknown): value is StoredMockReviewRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.ranAt === 'string' &&
    typeof r.text === 'string' &&
    typeof r.seq === 'number' &&
    typeof r.result === 'object' &&
    r.result !== null &&
    typeof (r.result as Record<string, unknown>).ok === 'boolean'
  );
}

/**
 * File-per-record store for one project's mock-review history. Path
 * resolution is the caller's responsibility; this class only takes the
 * final directory path.
 */
export class MockReviewStore {
  private readonly dir: string;
  private seqCounter = 0;

  constructor(dir: string) {
    this.dir = dir;
  }

  /** Persists a new mock-review run and prunes history down to MAX_RECORDS (oldest first). */
  add(text: string, result: MockReviewOutcome): MockReviewRecord {
    const record: StoredMockReviewRecord = {
      id: randomUUID(),
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
  listSummaries(): MockReviewRecordSummary[] {
    return this.readAllRecords()
      .sort((a, b) => b.seq - a.seq)
      .map((r) => ({
        id: r.id,
        ranAt: r.ranAt,
        ok: r.result.ok,
        textPreview: r.text.slice(0, PREVIEW_LENGTH),
      }));
  }

  /** Returns the full record (text + outcome) for `id`, or undefined when missing/corrupted. */
  get(id: string): MockReviewRecord | undefined {
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
  private writeRecord(record: StoredMockReviewRecord): void {
    mkdirSync(this.dir, { recursive: true });
    const filePath = this.recordPath(record.id);
    const tmpPath = `${filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(record, null, 2), 'utf-8');
    renameSync(tmpPath, filePath);
  }

  private readRecord(id: string): StoredMockReviewRecord | undefined {
    const filePath = this.recordPath(id);
    if (!existsSync(filePath)) return undefined;
    return this.parseRecordFile(filePath);
  }

  /** Reads every `*.json` record file in the directory, skipping any that fail to parse or validate. */
  private readAllRecords(): StoredMockReviewRecord[] {
    if (!existsSync(this.dir)) return [];
    const entries = readdirSync(this.dir).filter((name) => name.endsWith('.json'));
    const records: StoredMockReviewRecord[] = [];
    for (const name of entries) {
      const record = this.parseRecordFile(join(this.dir, name));
      if (record) records.push(record);
    }
    return records;
  }

  /** Never throws — an unreadable, unparsable, or malformed record file is treated as absent. */
  private parseRecordFile(filePath: string): StoredMockReviewRecord | undefined {
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

    return isStoredMockReviewRecord(parsed) ? parsed : undefined;
  }

  private toPublicRecord(record: StoredMockReviewRecord): MockReviewRecord {
    return {
      id: record.id,
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
