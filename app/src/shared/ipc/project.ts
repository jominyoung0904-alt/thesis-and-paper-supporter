/**
 * `project:*` request/result shapes for multi-project management
 * (FR-PRJ-001~006).
 *
 * Mirrors (rather than imports) `core/project/model.ts`'s `ProjectInfo` and
 * `main/ipc/projectContext.ts` / `core/project/projectStore.ts`'s result
 * unions — the same shared/core decoupling pattern already used across this
 * codebase (see `common.ts`'s doc comment) so `shared/` never depends on
 * `main/`/`core/` internals.
 */

// --- shared shape ---

/** One project entry as exposed to the renderer. */
export interface IpcProjectInfo {
  id: string;
  name: string;
  createdAt: string;
  archived: boolean;
}

// --- project:list ---

export interface ProjectListResult {
  /** Non-archived projects only. */
  projects: IpcProjectInfo[];
  activeProjectId: string | null;
}

// --- project:create ---

export interface ProjectCreateRequest {
  /** Omit for an auto-generated "내 연구 N" name. */
  name?: string;
}

export type ProjectCreateFailureReason = 'invalid_name';

export type ProjectCreateResult =
  | { ok: true; project: IpcProjectInfo }
  | { ok: false; reason: ProjectCreateFailureReason };

// --- project:rename ---

export interface ProjectRenameRequest {
  id: string;
  name: string;
}

export type ProjectRenameFailureReason = 'invalid_name' | 'not_found';

export type ProjectRenameResult =
  | { ok: true; project: IpcProjectInfo }
  | { ok: false; reason: ProjectRenameFailureReason };

// --- project:switch ---

export interface ProjectSwitchRequest {
  id: string;
}

export type ProjectSwitchFailureReason = 'not_found' | 'archived';

export type ProjectSwitchResult =
  | { ok: true; projectId: string }
  | { ok: false; reason: ProjectSwitchFailureReason };

// --- project:archive ---

export interface ProjectArchiveRequest {
  id: string;
}

export type ProjectArchiveFailureReason = 'not_found' | 'last_active_project';

export type ProjectArchiveResult =
  | { ok: true; project: IpcProjectInfo }
  | { ok: false; reason: ProjectArchiveFailureReason };
