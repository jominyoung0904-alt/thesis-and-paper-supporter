/**
 * `library:*` request/result shapes for the literature library (FR-LIB-001/002).
 *
 * Mirrors (rather than imports) `core/library/model.ts`'s `SavedPaper` and
 * `core/academic-api/types.ts`'s `PaperMetadata` — the same shared/core
 * decoupling pattern already used across this codebase (see
 * `shared/ipc/project.ts`'s doc comment) so `shared/` never depends on
 * `main/`/`core/` internals.
 *
 * `LibraryChannels` is declared here (not in `shared/ipc/channels.ts`) so
 * `libraryHandlers.ts` can import channel names without waiting on the
 * central `IpcChannels` integration (T44 file-ownership constraint, Wave 3).
 * Once integrated, `channels.ts` re-exposes the same string values under
 * `IpcChannels` — see the wiring spec in this task's completion report.
 */

export const LibraryChannels = {
  /** Saves a paper's full metadata into the current project's library (FR-LIB-001). */
  LIBRARY_SAVE: 'library:save',
  /** Lists the current project's saved papers, most recently saved first (FR-LIB-002). */
  LIBRARY_LIST: 'library:list',
  /** Updates the one-line memo on a saved paper (FR-LIB-002). */
  LIBRARY_UPDATE_MEMO: 'library:update-memo',
  /** Removes a saved paper (FR-LIB-002). */
  LIBRARY_REMOVE: 'library:remove',
} as const;

// --- shared shape ---

/** Mirrors `core/academic-api/types.ts`'s `AcademicSource`. */
export type IpcAcademicSource = 'kci' | 'scienceon' | 'semanticscholar' | 'openalex' | 'googlecse' | 'naverdoc';

/** Mirrors `core/academic-api/types.ts`'s `PaperMetadata` — saved in full per FR-LIB-001. */
export interface IpcPaperMetadata {
  source: IpcAcademicSource;
  externalId: string;
  title: string;
  authors: string[];
  year: number | null;
  abstract: string | null;
  venue: string | null;
  url: string | null;
  citationCount: number | null;
}

/** One saved literature entry as exposed to the renderer. Mirrors `core/library/model.ts`'s `SavedPaper`. */
export interface IpcSavedPaper {
  id: string;
  paper: IpcPaperMetadata;
  savedAt: string;
  /** Research run this paper was saved from, when saved via a research result screen. */
  sourceResearchId?: string;
  memo: string;
}

// --- library:save ---

export interface LibrarySaveRequest {
  paper: IpcPaperMetadata;
  sourceResearchId?: string;
}

export type LibrarySaveFailureReason = 'duplicate' | 'invalid_request';

export type LibrarySaveResult = { ok: true; paper: IpcSavedPaper } | { ok: false; reason: LibrarySaveFailureReason };

// --- library:list ---

export interface LibraryListResult {
  papers: IpcSavedPaper[];
}

// --- library:update-memo ---

export interface LibraryUpdateMemoRequest {
  id: string;
  memo: string;
}

export type LibraryUpdateMemoFailureReason = 'not_found' | 'memo_too_long' | 'invalid_request';

export type LibraryUpdateMemoResult =
  | { ok: true; paper: IpcSavedPaper }
  | { ok: false; reason: LibraryUpdateMemoFailureReason };

// --- library:remove ---

export interface LibraryRemoveRequest {
  id: string;
}

export type LibraryRemoveFailureReason = 'not_found';

export type LibraryRemoveResult = { ok: true } | { ok: false; reason: LibraryRemoveFailureReason };
