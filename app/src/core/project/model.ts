/**
 * Domain model for the multi-project index (FR-PRJ-001~006).
 *
 * A ProjectIndex is the single source of truth for "which research projects
 * exist" and "which one is currently active". Per-project payload data
 * (memory.json, library.json, chats/, research/, gate/) lives under
 * `data/projects/{id}/` and is resolved separately (see src/main/project) —
 * this module only models the lightweight index record itself.
 */

import { randomUUID } from 'node:crypto';

/** Bump when the on-disk shape of `ProjectIndex` changes incompatibly. */
export const PROJECT_INDEX_SCHEMA_VERSION = 1;

/** Raised when a create/rename input violates a required invariant (e.g. blank name). */
export class ProjectValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectValidationError';
  }
}

const DEFAULT_NAME_PATTERN = /^내 연구 (\d+)$/;

function nowIso(): string {
  return new Date().toISOString();
}

/** A single project's index entry. Payload data lives elsewhere, keyed by `id`. */
export interface ProjectInfo {
  id: string;
  name: string;
  createdAt: string;
  /** Soft-delete flag (FR-PRJ-005): archived projects are hidden from the switch list. */
  archived: boolean;
}

export interface CreateProjectInfoInput {
  name: string;
  id?: string;
  createdAt?: string;
  archived?: boolean;
}

/**
 * Builds a validated ProjectInfo. Rejects a blank (or whitespace-only) name —
 * every project must have a human-readable label.
 */
export function createProjectInfo(input: CreateProjectInfoInput): ProjectInfo {
  const name = input.name.trim();
  if (!name) {
    throw new ProjectValidationError('프로젝트 이름은 비어 있을 수 없습니다.');
  }

  return {
    id: input.id ?? randomUUID(),
    name,
    createdAt: input.createdAt ?? nowIso(),
    archived: input.archived ?? false,
  };
}

/**
 * Computes the next default project name ("내 연구 N") given the projects
 * that already exist (archived ones included, so a re-used number never
 * collides with an archived project's name).
 */
export function nextDefaultProjectName(existingProjects: readonly ProjectInfo[]): string {
  let maxN = 0;
  for (const project of existingProjects) {
    const match = DEFAULT_NAME_PATTERN.exec(project.name);
    if (match?.[1]) {
      const n = Number.parseInt(match[1], 10);
      if (n > maxN) maxN = n;
    }
  }
  return `내 연구 ${maxN + 1}`;
}

/** The full on-disk project index: the list of projects plus which one is active. */
export interface ProjectIndex {
  schemaVersion: number;
  activeProjectId: string | null;
  projects: ProjectInfo[];
}

/** Builds a fresh, empty ProjectIndex with no projects and no active selection. */
export function createEmptyProjectIndex(): ProjectIndex {
  return {
    schemaVersion: PROJECT_INDEX_SCHEMA_VERSION,
    activeProjectId: null,
    projects: [],
  };
}

/**
 * Runtime shape check used by ProjectIndexStore.load() to decide whether a
 * JSON file on disk is a well-formed ProjectIndex or should be treated as
 * corrupted (backed up + replaced with a fresh empty index).
 */
export function isProjectIndex(value: unknown): value is ProjectIndex {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;

  if (typeof candidate.schemaVersion !== 'number') return false;
  if (candidate.activeProjectId !== null && typeof candidate.activeProjectId !== 'string') return false;
  if (!Array.isArray(candidate.projects)) return false;

  return candidate.projects.every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const project = entry as Record<string, unknown>;
    return (
      typeof project.id === 'string' &&
      typeof project.name === 'string' &&
      typeof project.createdAt === 'string' &&
      typeof project.archived === 'boolean'
    );
  });
}
