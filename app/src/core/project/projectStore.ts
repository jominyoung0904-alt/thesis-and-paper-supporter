/**
 * JSON-file-backed store for the project index (FR-PRJ-001~006).
 *
 * Mirrors the atomic-write and corruption-recovery pattern established by
 * `src/core/memory/store.ts::MemoryStore` — see that file for the rationale.
 * Path resolution is the caller's responsibility; this class only takes the
 * final `data/projects/index.json` file path.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { ProjectIndex, ProjectInfo } from './model';
import {
  createEmptyProjectIndex,
  createProjectInfo,
  isProjectIndex,
  nextDefaultProjectName,
  ProjectValidationError,
} from './model';

export type ProjectIndexLoadStatus = 'created' | 'loaded' | 'recovered';

export interface ProjectIndexLoadResult {
  status: ProjectIndexLoadStatus;
  /** Present only when status is 'recovered': where the corrupted file was preserved. */
  backupPath?: string;
}

export type ArchiveFailureReason = 'not_found' | 'last_active_project';

export type ArchiveResult =
  | { ok: true; project: ProjectInfo }
  | { ok: false; reason: ArchiveFailureReason };

export type SetActiveFailureReason = 'not_found' | 'archived';

export type SetActiveResult = { ok: true; project: ProjectInfo } | { ok: false; reason: SetActiveFailureReason };

export interface ListOptions {
  /** When true, archived projects are included in the result (default: false). */
  includeArchived?: boolean;
}

/**
 * In-memory working copy of a ProjectIndex backed by a single JSON file.
 * Mutations (create/rename/archive/setActive) apply immediately in memory;
 * call `save()` to persist them atomically to disk.
 */
export class ProjectIndexStore {
  private readonly filePath: string;
  private index: ProjectIndex;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.index = createEmptyProjectIndex();
  }

  /**
   * Loads the index from disk. Creates a fresh empty index when the file
   * does not exist yet. When the file exists but cannot be parsed as JSON or
   * does not match the expected shape, the corrupted file is preserved as
   * `<file>.bak` and a fresh empty index is used instead (never throws on
   * corruption — the app must stay usable).
   */
  load(): ProjectIndexLoadResult {
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

    if (!isProjectIndex(parsed)) {
      return this.recoverFromCorruption();
    }

    this.index = parsed;
    return { status: 'loaded' };
  }

  private recoverFromCorruption(): ProjectIndexLoadResult {
    const backupPath = `${this.filePath}.bak`;
    renameSync(this.filePath, backupPath);
    this.index = createEmptyProjectIndex();
    return { status: 'recovered', backupPath };
  }

  /** Atomically persists the current in-memory state: write to a temp file, then rename over the target. */
  save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(this.index, null, 2), 'utf-8');
    renameSync(tmpPath, this.filePath);
  }

  /** Lists projects, excluding archived ones unless `includeArchived` is set. */
  list(options: ListOptions = {}): ProjectInfo[] {
    const projects = [...this.index.projects];
    return options.includeArchived ? projects : projects.filter((project) => !project.archived);
  }

  /**
   * Creates a new project and immediately switches to it (FR-PRJ-001, S1:
   * "즉시 해당 프로젝트로 전환된다"). When `name` is omitted, a default name
   * ("내 연구 N") is generated from the existing projects.
   */
  create(name?: string): ProjectInfo {
    const resolvedName = name?.trim() ? name : nextDefaultProjectName(this.index.projects);
    const project = createProjectInfo({ name: resolvedName });
    this.index.projects.push(project);
    this.index.activeProjectId = project.id;
    return project;
  }

  /** Renames a project (FR-PRJ-004). Returns undefined when `id` is not found. */
  rename(id: string, name: string): ProjectInfo | undefined {
    const project = this.index.projects.find((p) => p.id === id);
    if (!project) return undefined;

    const trimmed = name.trim();
    if (!trimmed) {
      throw new ProjectValidationError('프로젝트 이름은 비어 있을 수 없습니다.');
    }

    project.name = trimmed;
    return project;
  }

  /**
   * Archives (soft-deletes) a project (FR-PRJ-005). Rejects archiving the
   * last remaining non-archived project — the switch list must never become
   * completely empty. When the archived project was the active one, the
   * active selection is reassigned to another remaining non-archived project.
   */
  archive(id: string): ArchiveResult {
    const project = this.index.projects.find((p) => p.id === id);
    if (!project) return { ok: false, reason: 'not_found' };
    if (project.archived) return { ok: true, project };

    const remainingActiveCount = this.index.projects.filter((p) => !p.archived && p.id !== id).length;
    if (remainingActiveCount === 0) {
      return { ok: false, reason: 'last_active_project' };
    }

    project.archived = true;
    if (this.index.activeProjectId === id) {
      const fallback = this.index.projects.find((p) => !p.archived);
      this.index.activeProjectId = fallback?.id ?? null;
    }

    return { ok: true, project };
  }

  /** Switches the active project (FR-PRJ-002). Rejects unknown or archived targets. */
  setActive(id: string): SetActiveResult {
    const project = this.index.projects.find((p) => p.id === id);
    if (!project) return { ok: false, reason: 'not_found' };
    if (project.archived) return { ok: false, reason: 'archived' };

    this.index.activeProjectId = id;
    return { ok: true, project };
  }

  /** Returns the currently active project, or undefined when none is selected. */
  getActive(): ProjectInfo | undefined {
    if (!this.index.activeProjectId) return undefined;
    return this.index.projects.find((p) => p.id === this.index.activeProjectId);
  }
}
