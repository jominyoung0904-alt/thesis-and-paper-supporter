/**
 * Per-project path layout resolver (FR-PRJ-001).
 *
 * This module computes `data/projects/{projectId}/...` sub-paths from an
 * already-resolved `AppPaths.dataDir`. It intentionally does NOT depend on
 * `src/main/paths.ts::resolveAppPaths` signature or import `electron` — it
 * only consumes a plain `dataDir` string, so it stays unit-testable and does
 * not touch the high-fan-in `resolveAppPaths` function (research.md: "경로
 * 해석" section, ARCHITECTURE invariant 1).
 *
 * File layout kept identical to the Sprint 1 `data/projects/default/`
 * convention (memory.json, library.json) so the FR-PRJ-003 migration can
 * reuse existing files without renaming them.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Absolute paths for a single project's persisted data. */
export interface ProjectPaths {
  /** Project root: data/projects/{id}/ */
  root: string;
  /** Research memory file (Sprint 1 convention preserved for migration compatibility). */
  memoryFile: string;
  /** Literature library (saved papers) file. */
  libraryFile: string;
  /** Directory holding per-conversation chat session files. */
  chatsDir: string;
  /** Directory holding per-research-run history files. */
  researchDir: string;
  /** Directory holding writing-gate / mock-review check history files. */
  gateDir: string;
  /** Deep-research checkpoint file (resume-from-last-step). */
  checkpointFile: string;
}

/** Accepts the literal 'default' or a canonical UUID (any RFC 4122 version/variant byte). */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates a project id before it is ever interpolated into a filesystem
 * path. Rejects anything that could escape `data/projects/` (path
 * separators, `..` segments, absolute-path fragments, empty strings) —
 * only the literal `'default'` or a canonical UUID string is allowed.
 *
 * Throws a plain `Error` on invalid input; callers decide how to surface it
 * (this module has no UI/IPC concerns).
 */
export function assertValidProjectId(projectId: string): void {
  if (projectId === 'default') return;
  if (UUID_PATTERN.test(projectId)) return;
  throw new Error(`Invalid project id: ${JSON.stringify(projectId)}`);
}

/**
 * Resolves the full path layout for a single project. Pure function — no
 * filesystem access, so it is safe to call speculatively (e.g. to compute a
 * path before deciding whether to create it).
 */
export function resolveProjectPaths(dataDir: string, projectId: string): ProjectPaths {
  assertValidProjectId(projectId);

  const root = join(dataDir, 'projects', projectId);

  return {
    root,
    memoryFile: join(root, 'memory.json'),
    libraryFile: join(root, 'library.json'),
    chatsDir: join(root, 'chats'),
    researchDir: join(root, 'research'),
    gateDir: join(root, 'gate'),
    checkpointFile: join(root, 'research-checkpoint.json'),
  };
}

/**
 * Ensures the project's directories exist, creating them recursively when
 * missing. Safe to call multiple times (idempotent) — mirrors
 * `ensureAppDirectories` in `src/main/paths.ts`.
 */
export function ensureProjectDirectories(paths: ProjectPaths): void {
  mkdirSync(paths.root, { recursive: true });
  mkdirSync(paths.chatsDir, { recursive: true });
  mkdirSync(paths.researchDir, { recursive: true });
  mkdirSync(paths.gateDir, { recursive: true });
}

/**
 * Path to the cross-project index file (project list, active project,
 * archived flags). Lives one level above individual project directories:
 * `data/projects/index.json`. Consumed by the T36 project index store.
 */
export function indexFilePath(dataDir: string): string {
  return join(dataDir, 'projects', 'index.json');
}
