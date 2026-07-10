/**
 * IPC handlers for multi-project management (`project:list`, `project:create`,
 * `project:rename`, `project:switch`, `project:archive`) — FR-PRJ-001~006.
 *
 * Thin IPC boundary over the T39 `ProjectContext` (switch/service
 * reassembly) and its underlying `ProjectIndexStore` (list/create/rename/
 * archive). Both share the SAME `ProjectIndexStore` instance constructed
 * once in `handlers.ts`, so a mutation made here is immediately visible to
 * `ProjectContext`.
 *
 * `create`/`archive` route through `ProjectContext.switchProject()` even
 * though `ProjectIndexStore` already flips `activeProjectId` on its own —
 * only `ProjectContext.switchProject()` re-assembles the project-scoped
 * services and fires `onSwitch` listeners (e.g. the ConversationManager
 * reset wired in `handlers.ts`), so skipping it would leave stale services
 * pointed at the old project (FR-PRJ-002).
 */

import { ipcMain } from 'electron';

import type { ProjectInfo } from '../../core/project/model';
import type { ProjectIndexStore } from '../../core/project/projectStore';
import { IpcChannels } from '../../shared/ipc-channels';
import type {
  IpcProjectInfo,
  ProjectArchiveRequest,
  ProjectArchiveResult,
  ProjectCreateRequest,
  ProjectCreateResult,
  ProjectListResult,
  ProjectRenameRequest,
  ProjectRenameResult,
  ProjectSwitchRequest,
  ProjectSwitchResult,
} from '../../shared/ipc-channels';
import type { ProjectContext } from './projectContext';
import { isValidOptionalProjectName, isValidProjectId, isValidProjectName } from './projectGuards';

export interface ProjectHandlerDeps {
  indexStore: ProjectIndexStore;
  projectContext: ProjectContext;
}

function toIpcProjectInfo(project: ProjectInfo): IpcProjectInfo {
  return { id: project.id, name: project.name, createdAt: project.createdAt, archived: project.archived };
}

/** Registers `project:list`, `project:create`, `project:rename`, `project:switch`, `project:archive`. */
export function registerProjectHandlers(deps: ProjectHandlerDeps): void {
  const { indexStore, projectContext } = deps;

  ipcMain.handle(IpcChannels.PROJECT_LIST, async (): Promise<ProjectListResult> => {
    return {
      projects: indexStore.list().map(toIpcProjectInfo),
      activeProjectId: projectContext.getActiveProjectId(),
    };
  });

  ipcMain.handle(
    IpcChannels.PROJECT_CREATE,
    async (_event, payload: ProjectCreateRequest): Promise<ProjectCreateResult> => {
      if (!isValidOptionalProjectName(payload?.name)) {
        return { ok: false, reason: 'invalid_name' };
      }

      // `create()` also marks the new project active in-memory (FR-PRJ-001,
      // S1: "즉시 해당 프로젝트로 전환된다") — `switchProject` below re-runs
      // that same transition through ProjectContext (see module doc comment).
      const project = indexStore.create(payload?.name);
      indexStore.save();
      projectContext.switchProject(project.id);

      return { ok: true, project: toIpcProjectInfo(project) };
    },
  );

  ipcMain.handle(
    IpcChannels.PROJECT_RENAME,
    async (_event, payload: ProjectRenameRequest): Promise<ProjectRenameResult> => {
      if (!isValidProjectId(payload?.id) || !isValidProjectName(payload?.name)) {
        return { ok: false, reason: 'invalid_name' };
      }

      const project = indexStore.rename(payload.id, payload.name);
      if (!project) {
        return { ok: false, reason: 'not_found' };
      }

      indexStore.save();
      return { ok: true, project: toIpcProjectInfo(project) };
    },
  );

  ipcMain.handle(
    IpcChannels.PROJECT_SWITCH,
    async (_event, payload: ProjectSwitchRequest): Promise<ProjectSwitchResult> => {
      if (!isValidProjectId(payload?.id)) {
        return { ok: false, reason: 'not_found' };
      }
      return projectContext.switchProject(payload.id);
    },
  );

  ipcMain.handle(
    IpcChannels.PROJECT_ARCHIVE,
    async (_event, payload: ProjectArchiveRequest): Promise<ProjectArchiveResult> => {
      if (!isValidProjectId(payload?.id)) {
        return { ok: false, reason: 'not_found' };
      }

      const wasActive = projectContext.getActiveProjectId() === payload.id;
      const result = indexStore.archive(payload.id);
      if (!result.ok) {
        return result;
      }
      indexStore.save();

      // The archived project may have been the active one — ProjectIndexStore
      // already re-picked a fallback active id internally, but ProjectContext
      // does not observe that mutation on its own. Re-run the switch through
      // ProjectContext so services (and onSwitch listeners) re-assemble
      // against the new active project.
      if (wasActive) {
        const fallback = indexStore.getActive();
        if (fallback) {
          projectContext.switchProject(fallback.id);
        }
      }

      return { ok: true, project: toIpcProjectInfo(result.project) };
    },
  );
}
