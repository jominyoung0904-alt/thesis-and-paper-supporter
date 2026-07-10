/**
 * Default-project auto-migration (FR-PRJ-003, NFR-OPS-003).
 *
 * Runs once at app startup (wiring is T39's responsibility — this module only
 * exposes the pure orchestration function). Consumes the T36 project index
 * public API (`ProjectIndexStore`, `createProjectInfo`, `createEmptyProjectIndex`)
 * and the T37 path resolver (`indexFilePath`, `resolveProjectPaths`) — this
 * file does not redefine any path or index logic.
 *
 * Three branches (spec order matters — checked top to bottom):
 * 1. `data/projects/index.json` already exists → migration already ran.
 * 2. No index, but `data/projects/default/` exists (Sprint 1 user) → absorb
 *    the default directory into a freshly-minted project.
 * 3. No index, no default directory (brand-new user) → create an empty
 *    index with a single default project.
 *
 * Per NFR-OPS-003 ("실패=결과값"), no branch ever throws — every failure is
 * surfaced as a `MigrationResult` so a bootstrap error can never block the
 * app from starting.
 */

import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

import type { ProjectIndex, ProjectInfo } from '../../core/project/model';
import { createEmptyProjectIndex, createProjectInfo } from '../../core/project/model';
import { ProjectIndexStore } from '../../core/project/projectStore';
import { indexFilePath, resolveProjectPaths } from './projectPaths';

export type MigrationFailureReason = 'already-indexed' | 'error';

export interface MigrationResult {
  /** `true` when a new index/project was created by this call. */
  migrated: boolean;
  /** Present only when `migrated` is `false`. */
  reason?: MigrationFailureReason;
  /** `true` only for the brand-new-user branch (no prior Sprint 1 data). */
  fresh?: boolean;
  /** The project the Sprint 1 (or brand-new) data was recorded under. */
  project?: ProjectInfo;
  /** Korean, plain-language message ready to show the user. Present only on error. */
  userMessage?: string;
}

/**
 * Filesystem functions that may need to be swapped out in tests (mainly to
 * simulate a rename failure without relying on flaky OS-level permission
 * tricks). Defaults to the real `node:fs` implementations.
 */
export interface MigrationFsOverrides {
  existsSync?: typeof existsSync;
  renameSync?: typeof renameSync;
}

const MIGRATION_ERROR_MESSAGE =
  '기존 프로젝트 정보를 불러오는 중 문제가 발생했어요. 앱은 계속 사용할 수 있으며, 문제가 반복되면 문의해 주세요.';

/**
 * Migrates the Sprint 1 single-project layout to the Sprint 2 multi-project
 * index. Idempotent — once `index.json` exists, every subsequent call is a
 * no-op (branch 1). See module doc for the full branch breakdown.
 */
// @AX:ANCHOR: [AUTO] three-branch migration gate — branch order is spec-mandated, never throws (NFR-OPS-003). Related: SPEC-TSA-002 T39
export function migrateDefaultProject(dataDir: string, fsOverrides: MigrationFsOverrides = {}): MigrationResult {
  const exists = fsOverrides.existsSync ?? existsSync;
  const rename = fsOverrides.renameSync ?? renameSync;

  try {
    const indexPath = indexFilePath(dataDir);
    if (exists(indexPath)) {
      return { migrated: false, reason: 'already-indexed' };
    }

    const defaultPaths = resolveProjectPaths(dataDir, 'default');
    const hasSprint1Data = exists(defaultPaths.root);

    if (!hasSprint1Data) {
      return createFreshIndex(indexPath);
    }

    return absorbDefaultProject(dataDir, indexPath, defaultPaths.root, rename);
  } catch {
    return { migrated: false, reason: 'error', userMessage: MIGRATION_ERROR_MESSAGE };
  }
}

/** Branch 3: brand-new user — empty index, one default project, no data to move. */
function createFreshIndex(indexPath: string): MigrationResult {
  const store = new ProjectIndexStore(indexPath);
  store.load();
  const project = store.create();
  store.save();
  return { migrated: true, fresh: true, project };
}

/**
 * Branch 2: Sprint 1 user — absorbs `data/projects/default/` into a new
 * UUID-keyed project. Falls back to keeping the literal `'default'` id (and
 * leaving the directory in place) when the rename fails, e.g. a locked file
 * on Windows — the migration must still complete rather than block startup.
 */
function absorbDefaultProject(
  dataDir: string,
  indexPath: string,
  defaultRoot: string,
  rename: typeof renameSync,
): MigrationResult {
  const candidateId = randomUUID();
  let project: ProjectInfo;

  try {
    const targetPaths = resolveProjectPaths(dataDir, candidateId);
    rename(defaultRoot, targetPaths.root);
    project = createProjectInfo({ id: candidateId, name: '내 연구 1' });
  } catch {
    project = createProjectInfo({ id: 'default', name: '내 연구 1' });
  }

  const index = createEmptyProjectIndex();
  index.projects.push(project);
  index.activeProjectId = project.id;
  writeIndexAtomically(indexPath, index);

  return { migrated: true, project };
}

/**
 * Writes the index file with the same atomic (temp-file + rename) pattern as
 * `ProjectIndexStore.save()`. Used here because the store's public API has
 * no way to insert a project with a caller-chosen id (needed for the
 * rename-fallback case above), so this branch builds the `ProjectIndex`
 * directly from `model.ts`'s public builders instead of going through
 * `ProjectIndexStore`.
 */
function writeIndexAtomically(indexPath: string, index: ProjectIndex): void {
  mkdirSync(dirname(indexPath), { recursive: true });
  const tmpPath = `${indexPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(index, null, 2), 'utf-8');
  renameSync(tmpPath, indexPath);
}
