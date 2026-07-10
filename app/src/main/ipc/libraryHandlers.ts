/**
 * IPC handlers for the literature library (`library:save`, `library:list`,
 * `library:update-memo`, `library:remove`) — FR-LIB-001/002.
 *
 * Each call constructs a fresh `LibraryStore` against
 * `deps.getLibraryFile()`, re-invoked on every call (rather than captured
 * once) so a project switch is reflected on the very next channel
 * invocation — the same `getMemoryStore`/FR-PRJ-002 pattern used by
 * `researchGateHandlers.ts`. This is safe because `LibraryStore` only holds
 * an in-memory working copy for the duration of a single `load()` ->
 * mutate -> `save()` sequence; nothing is cached across handler calls.
 *
 * Split out of `handlers.ts` (T44, SPEC-TSA-002) — still registered from
 * `registerIpcHandlers`, the single composition root for all channels (see
 * this task's completion report for the exact wiring snippet, since
 * `handlers.ts` is owned by another in-flight task during Wave 3).
 */

import { ipcMain } from 'electron';

import type { PaperMetadata } from '../../core/academic-api/types';
import { MEMO_MAX_LENGTH } from '../../core/library/model';
import type { SavedPaper } from '../../core/library/model';
import { LibraryStore } from '../../core/library/store';
import { LibraryChannels } from '../../shared/ipc/library';
import type {
  IpcSavedPaper,
  LibraryListResult,
  LibraryRemoveRequest,
  LibraryRemoveResult,
  LibrarySaveRequest,
  LibrarySaveResult,
  LibraryUpdateMemoRequest,
  LibraryUpdateMemoResult,
} from '../../shared/ipc/library';
import { isBoundedString } from './guards';

export interface LibraryHandlerDeps {
  /** Returns the ACTIVE project's library file path. Re-invoked per call (FR-PRJ-002). */
  getLibraryFile: () => string;
}

const MAX_ID_LENGTH = 200;
const KNOWN_SOURCES = ['kci', 'scienceon', 'semanticscholar', 'openalex', 'googlecse', 'naverdoc'] as const;

function toIpcSavedPaper(paper: SavedPaper): IpcSavedPaper {
  return {
    id: paper.id,
    paper: paper.paper,
    savedAt: paper.savedAt,
    sourceResearchId: paper.sourceResearchId,
    memo: paper.memo,
  };
}

/**
 * Runtime shape guard for `library:save`'s `paper` field — mirrors the
 * private `isPaperMetadata` check in `core/library/model.ts` (not exported
 * from there, so re-declared here per the IPC boundary's own
 * re-validate-every-payload rule; see `guards.ts`'s doc comment).
 */
function isValidPaperMetadata(value: unknown): value is PaperMetadata {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.source === 'string' &&
    (KNOWN_SOURCES as readonly string[]).includes(candidate.source) &&
    typeof candidate.externalId === 'string' &&
    typeof candidate.title === 'string' &&
    Array.isArray(candidate.authors)
  );
}

/** Registers `library:save`, `library:list`, `library:update-memo`, `library:remove`. */
export function registerLibraryHandlers(deps: LibraryHandlerDeps): void {
  const { getLibraryFile } = deps;

  ipcMain.handle(
    LibraryChannels.LIBRARY_SAVE,
    async (_event, payload: LibrarySaveRequest): Promise<LibrarySaveResult> => {
      const paper = payload?.paper;
      if (!isValidPaperMetadata(paper)) {
        return { ok: false, reason: 'invalid_request' };
      }
      const sourceResearchId = payload?.sourceResearchId;
      if (sourceResearchId !== undefined && !isBoundedString(sourceResearchId, MAX_ID_LENGTH)) {
        return { ok: false, reason: 'invalid_request' };
      }

      const store = new LibraryStore(getLibraryFile());
      store.load();
      const result = store.add(paper, sourceResearchId);
      if (!result.ok) {
        return { ok: false, reason: 'duplicate' };
      }
      store.save();
      return { ok: true, paper: toIpcSavedPaper(result.paper) };
    },
  );

  ipcMain.handle(LibraryChannels.LIBRARY_LIST, async (): Promise<LibraryListResult> => {
    const store = new LibraryStore(getLibraryFile());
    store.load();
    return { papers: store.list().map(toIpcSavedPaper) };
  });

  ipcMain.handle(
    LibraryChannels.LIBRARY_UPDATE_MEMO,
    async (_event, payload: LibraryUpdateMemoRequest): Promise<LibraryUpdateMemoResult> => {
      const id = payload?.id;
      const memo = payload?.memo;
      if (!isBoundedString(id, MAX_ID_LENGTH) || typeof memo !== 'string') {
        return { ok: false, reason: 'invalid_request' };
      }
      if (memo.length > MEMO_MAX_LENGTH) {
        return { ok: false, reason: 'memo_too_long' };
      }

      const store = new LibraryStore(getLibraryFile());
      store.load();
      const updated = store.updateMemo(id, memo);
      if (!updated) {
        return { ok: false, reason: 'not_found' };
      }
      store.save();
      return { ok: true, paper: toIpcSavedPaper(updated) };
    },
  );

  ipcMain.handle(
    LibraryChannels.LIBRARY_REMOVE,
    async (_event, payload: LibraryRemoveRequest): Promise<LibraryRemoveResult> => {
      const id = payload?.id;
      if (!isBoundedString(id, MAX_ID_LENGTH)) {
        return { ok: false, reason: 'not_found' };
      }

      const store = new LibraryStore(getLibraryFile());
      store.load();
      const removed = store.remove(id);
      if (!removed) {
        return { ok: false, reason: 'not_found' };
      }
      store.save();
      return { ok: true };
    },
  );
}
