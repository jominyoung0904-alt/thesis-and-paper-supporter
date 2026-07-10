/**
 * Pure logic for `ProjectSwitcher` (T42, SPEC-TSA-002 FR-PRJ). Framework-free
 * so it can be unit-tested without a DOM environment, following the same
 * split used by `settingsScreenLogic.ts` / `wizardLogic.ts`.
 *
 * Name-length bound mirrors `main/ipc/projectGuards.ts`'s
 * `MAX_PROJECT_NAME_LENGTH` (100) — duplicated here rather than imported
 * because renderer code must not reach into `main/` internals (same
 * shared/core decoupling boundary documented in `shared/ipc/project.ts`).
 */
import type {
  IpcProjectInfo,
  ProjectArchiveFailureReason,
  ProjectCreateFailureReason,
  ProjectRenameFailureReason,
  ProjectSwitchFailureReason,
} from '../../shared/ipc-channels';

/** Mirrors `MAX_PROJECT_NAME_LENGTH` in `main/ipc/projectGuards.ts`. */
export const PROJECT_NAME_MAX_LENGTH = 100;

type ProjectFailureReason =
  | ProjectCreateFailureReason
  | ProjectRenameFailureReason
  | ProjectSwitchFailureReason
  | ProjectArchiveFailureReason;

/** Plain-Korean copy for every `project:*` failure reason (FR-PRJ-006). */
const FAILURE_MESSAGES: Record<ProjectFailureReason, string> = {
  invalid_name: '이름은 1~100자 사이로 입력해 주세요.',
  not_found: '해당 연구를 찾을 수 없어요. 목록을 새로고침해 주세요.',
  archived: '보관된 연구예요. 다른 연구를 선택해 주세요.',
  last_active_project: '마지막 남은 연구는 보관할 수 없어요.',
};

/** Translates a `project:*` IPC failure reason into user-facing Korean copy. */
export function getProjectFailureMessage(reason: ProjectFailureReason): string {
  return FAILURE_MESSAGES[reason] ?? '알 수 없는 문제가 발생했어요. 다시 시도해 주세요.';
}

/**
 * Gate for the "새 연구 만들기" submit button. An empty (or whitespace-only)
 * name is allowed here — the backend auto-generates a name in that case
 * (`ProjectCreateRequest.name` is optional) — only length and in-flight
 * state are checked.
 */
export function canCreateProject(name: string, saving: boolean): boolean {
  return !saving && name.trim().length <= PROJECT_NAME_MAX_LENGTH;
}

/** Gate for the "이름 바꾸기" submit button — unlike create, a non-empty name is required. */
export function canRenameProject(name: string, saving: boolean): boolean {
  const trimmed = name.trim();
  return !saving && trimmed.length > 0 && trimmed.length <= PROJECT_NAME_MAX_LENGTH;
}

/**
 * Inserts or replaces `project` by id in `projects`, preserving the existing
 * order (append when new). Used after a successful `create`/`rename` to fold
 * the single returned `IpcProjectInfo` back into the switcher's list without
 * a full re-fetch.
 */
export function upsertProject(projects: readonly IpcProjectInfo[], project: IpcProjectInfo): IpcProjectInfo[] {
  const index = projects.findIndex((p) => p.id === project.id);
  if (index === -1) {
    return [...projects, project];
  }
  const next = [...projects];
  next[index] = project;
  return next;
}

/** Removes a project by id, used after a successful `archive` (list only ever holds non-archived projects). */
export function removeProject(projects: readonly IpcProjectInfo[], id: string): IpcProjectInfo[] {
  return projects.filter((p) => p.id !== id);
}

/** Resolves the display name shown on the switcher trigger button. */
export function resolveActiveProjectName(projects: readonly IpcProjectInfo[], activeProjectId: string | null): string {
  const active = projects.find((p) => p.id === activeProjectId);
  return active?.name ?? '연구 선택';
}

/** Builds the confirm-dialog copy for archiving `projectName` (FR-PRJ-005). */
export function buildArchiveConfirmMessage(projectName: string): string {
  return `'${projectName}'을(를) 보관하시겠어요?\n보관하면 목록에서 숨겨져요. 데이터는 지워지지 않아요.`;
}
