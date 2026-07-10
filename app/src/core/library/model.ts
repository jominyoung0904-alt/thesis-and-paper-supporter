/**
 * Domain model for the literature library core (FR-LIB-001/002).
 *
 * A `SavedPaper` wraps a `PaperMetadata` (sourced exclusively from the
 * academic API layer per FR-RES-005 — see src/core/academic-api/types.ts)
 * with library-only bookkeeping fields (save time, originating research run,
 * user memo). The library never mutates `paper` itself, preserving the
 * deterministic-bibliography invariant.
 */

import { randomUUID } from 'node:crypto';

import type { AcademicSource, PaperMetadata } from '../academic-api/types';

/** Bump when the on-disk shape of `LibraryFile` changes incompatibly. */
export const LIBRARY_SCHEMA_VERSION = 1;

/** FR-LIB-002: memo is a short one-line note, capped to keep the UI list readable. */
export const MEMO_MAX_LENGTH = 500;

/** Raised when a library mutation rejects invalid input (e.g. memo too long). */
export class LibraryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibraryValidationError';
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

/** A single saved literature entry (FR-LIB-001). */
export interface SavedPaper {
  id: string;
  paper: PaperMetadata;
  savedAt: string;
  /** Research run this paper was saved from, when saved via a research result screen. */
  sourceResearchId?: string;
  memo: string;
}

export interface CreateSavedPaperInput {
  paper: PaperMetadata;
  sourceResearchId?: string;
  memo?: string;
}

export function createSavedPaper(input: CreateSavedPaperInput): SavedPaper {
  return {
    id: randomUUID(),
    paper: input.paper,
    savedAt: nowIso(),
    sourceResearchId: input.sourceResearchId,
    memo: input.memo ?? '',
  };
}

/** The full on-disk library for a single project. */
export interface LibraryFile {
  schemaVersion: number;
  papers: SavedPaper[];
}

/** Builds a fresh, empty library file. */
export function createEmptyLibraryFile(): LibraryFile {
  return { schemaVersion: LIBRARY_SCHEMA_VERSION, papers: [] };
}

const KNOWN_SOURCES: readonly AcademicSource[] = [
  'kci',
  'scienceon',
  'semanticscholar',
  'openalex',
  'googlecse',
  'naverdoc',
];

function isPaperMetadata(value: unknown): value is PaperMetadata {
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

function isSavedPaper(value: unknown): value is SavedPaper {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === 'string' &&
    isPaperMetadata(candidate.paper) &&
    typeof candidate.savedAt === 'string' &&
    typeof candidate.memo === 'string' &&
    (candidate.sourceResearchId === undefined || typeof candidate.sourceResearchId === 'string')
  );
}

/**
 * Runtime shape check used by LibraryStore.load() to decide whether a JSON
 * file on disk is a well-formed LibraryFile or should be treated as
 * corrupted (backed up + replaced with a fresh empty library).
 */
export function isLibraryFile(value: unknown): value is LibraryFile {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;

  if (typeof candidate.schemaVersion !== 'number') return false;
  if (!Array.isArray(candidate.papers)) return false;

  return candidate.papers.every(isSavedPaper);
}
