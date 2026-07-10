/**
 * JSON-file-backed store for a single project's literature library
 * (FR-LIB-001/002). Mirrors the atomic save + corruption-recovery pattern of
 * `src/core/memory/store.ts` (SPEC-TSA-001 design decision 1) so both stores
 * behave identically from the user's point of view.
 *
 * Path resolution is the caller's responsibility (see
 * `src/main/project/projectPaths.ts::ProjectPaths.libraryFile`); this class
 * only takes the final file path.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { AcademicSource, PaperMetadata } from '../academic-api/types';
import type { LibraryFile, SavedPaper } from './model';
import { createEmptyLibraryFile, createSavedPaper, isLibraryFile, LibraryValidationError, MEMO_MAX_LENGTH } from './model';

export type LibraryLoadStatus = 'created' | 'loaded' | 'recovered';

export interface LibraryLoadResult {
  status: LibraryLoadStatus;
  /** Present only when status is 'recovered': where the corrupted file was preserved. */
  backupPath?: string;
}

export type AddPaperResult = { ok: true; paper: SavedPaper } | { ok: false; reason: 'duplicate' };

/**
 * In-memory working copy of a LibraryFile backed by a single JSON file.
 * Mutations (add/updateMemo/remove) apply immediately in memory; call
 * `save()` to persist them atomically to disk.
 */
export class LibraryStore {
  private readonly filePath: string;
  private library: LibraryFile;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.library = createEmptyLibraryFile();
  }

  /**
   * Loads the library from disk. Creates a fresh empty library when the
   * file does not exist yet. When the file exists but cannot be parsed as
   * JSON or does not match the expected shape, the corrupted file is
   * preserved as `<file>.bak` and a fresh empty library is used instead
   * (never throws on corruption — the app must stay usable).
   */
  load(): LibraryLoadResult {
    if (!existsSync(this.filePath)) {
      return { status: 'created' };
    }

    const raw = readFileSync(this.filePath, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return this.recoverFromCorruption();
    }

    if (!isLibraryFile(parsed)) {
      return this.recoverFromCorruption();
    }

    this.library = parsed;
    return { status: 'loaded' };
  }

  private recoverFromCorruption(): LibraryLoadResult {
    const backupPath = `${this.filePath}.bak`;
    renameSync(this.filePath, backupPath);
    this.library = createEmptyLibraryFile();
    return { status: 'recovered', backupPath };
  }

  /** Atomically persists the current in-memory state: write to a temp file, then rename over the target. */
  save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(this.library, null, 2), 'utf-8');
    renameSync(tmpPath, this.filePath);
  }

  /** Lists saved papers, most recently saved first. */
  list(): SavedPaper[] {
    return [...this.library.papers].sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
  }

  /**
   * Saves a paper into the library (FR-LIB-001). Rejects duplicates by
   * `(source, externalId)` — the same paper cannot be saved twice, even from
   * two different research runs.
   */
  add(paper: PaperMetadata, sourceResearchId?: string): AddPaperResult {
    if (this.has(paper.externalId, paper.source)) {
      return { ok: false, reason: 'duplicate' };
    }

    const saved = createSavedPaper({ paper, sourceResearchId });
    this.library.papers.push(saved);
    return { ok: true, paper: saved };
  }

  /**
   * Updates the one-line memo on a saved paper (FR-LIB-002). Throws
   * `LibraryValidationError` when the memo exceeds {@link MEMO_MAX_LENGTH}
   * characters; the paper's id must exist or `undefined` is returned.
   */
  updateMemo(id: string, memo: string): SavedPaper | undefined {
    if (memo.length > MEMO_MAX_LENGTH) {
      throw new LibraryValidationError(`메모는 ${MEMO_MAX_LENGTH}자를 초과할 수 없습니다.`);
    }

    const index = this.library.papers.findIndex((entry) => entry.id === id);
    if (index === -1) return undefined;
    const current = this.library.papers[index];
    if (!current) return undefined;

    const updated: SavedPaper = { ...current, memo };
    this.library.papers[index] = updated;
    return updated;
  }

  /** Hard-deletes a saved paper by id (FR-LIB-002; confirmation dialog is the UI's responsibility). */
  remove(id: string): boolean {
    const index = this.library.papers.findIndex((entry) => entry.id === id);
    if (index === -1) return false;
    this.library.papers.splice(index, 1);
    return true;
  }

  /** Whether a paper with the given `(externalId, source)` is already saved — used for the research screen's "saved" badge. */
  has(externalId: string, source: AcademicSource): boolean {
    return this.library.papers.some((entry) => entry.paper.externalId === externalId && entry.paper.source === source);
  }
}
