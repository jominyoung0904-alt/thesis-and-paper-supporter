/**
 * Top-bar project switcher (T42, SPEC-TSA-002 FR-PRJ-001~006).
 *
 * Renders the active project's name as a trigger button; clicking it opens a
 * dropdown listing every non-archived project plus "새 연구 만들기". Each row
 * offers switch (click the name), rename (✏️), and archive (📦, with a
 * confirm dialog). All side effects flow through `ProjectScreenCallbacks`
 * (built by `createProjectScreenCallbacks()` in `appCallbacks.ts`) — this
 * component never touches `window.thesisApi` directly, matching every other
 * screen in this codebase.
 *
 * Project list + active id are owned by `App.tsx` (per T42's brief: "App
 * 상태로 유지") and passed down as props; this component only mutates them via
 * the `onProjectsChange`/`onActiveProjectChange` callbacks so `App.tsx` can
 * key the project-scoped screens off `activeProjectId` and force a remount
 * on switch/create (chat/writing-check local state reset).
 */
import { useEffect, useRef, useState } from 'react';

import type { ProjectScreenCallbacks } from '../appCallbacks';
import type { IpcProjectInfo } from '../../shared/ipc-channels';
import { ProjectListMode } from './ProjectListMode';
import { ProjectNameForm } from './ProjectNameForm';
import {
  buildArchiveConfirmMessage,
  canCreateProject,
  canRenameProject,
  getProjectFailureMessage,
  removeProject,
  resolveActiveProjectName,
  upsertProject,
} from './projectSwitcherHelpers';
import './projectSwitcher.css';

export interface ProjectSwitcherProps {
  callbacks: ProjectScreenCallbacks;
  projects: IpcProjectInfo[];
  activeProjectId: string | null;
  onProjectsChange: (projects: IpcProjectInfo[]) => void;
  onActiveProjectChange: (id: string) => void;
}

type SwitcherMode = 'list' | 'create' | 'rename';

export function ProjectSwitcher({
  callbacks,
  projects,
  activeProjectId,
  onProjectsChange,
  onActiveProjectChange,
}: ProjectSwitcherProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SwitcherMode>('list');
  const [nameInput, setNameInput] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on an outside click, KakaoTalk/gmail-menu style.
  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        closeAndReset();
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  function closeAndReset(): void {
    setOpen(false);
    setMode('list');
    setNameInput('');
    setRenamingId(null);
    setErrorMessage(null);
  }

  async function handleSwitch(id: string): Promise<void> {
    if (id === activeProjectId || busy) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await callbacks.switchProject(id);
      if (result.ok) {
        onActiveProjectChange(result.projectId);
        closeAndReset();
      } else {
        setErrorMessage(getProjectFailureMessage(result.reason));
      }
    } catch {
      setErrorMessage('전환하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(): Promise<void> {
    if (!canCreateProject(nameInput, busy)) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const trimmed = nameInput.trim();
      const result = await callbacks.createProject(trimmed.length > 0 ? trimmed : undefined);
      if (result.ok) {
        onProjectsChange(upsertProject(projects, result.project));
        onActiveProjectChange(result.project.id);
        closeAndReset();
      } else {
        setErrorMessage(getProjectFailureMessage(result.reason));
      }
    } catch {
      setErrorMessage('새 연구를 만들지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(id: string): Promise<void> {
    if (!canRenameProject(nameInput, busy)) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await callbacks.renameProject(id, nameInput.trim());
      if (result.ok) {
        onProjectsChange(upsertProject(projects, result.project));
        closeAndReset();
      } else {
        setErrorMessage(getProjectFailureMessage(result.reason));
      }
    } catch {
      setErrorMessage('이름을 바꾸지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive(project: IpcProjectInfo): Promise<void> {
    if (busy || !window.confirm(buildArchiveConfirmMessage(project.name))) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await callbacks.archiveProject(project.id);
      if (!result.ok) {
        setErrorMessage(getProjectFailureMessage(result.reason));
        return;
      }
      const nextProjects = removeProject(projects, project.id);
      onProjectsChange(nextProjects);
      // Archiving the active project moves activeProjectId on the main side —
      // re-list to pick up the fallback project the backend already chose.
      if (project.id === activeProjectId) {
        const listResult = await callbacks.listProjects();
        onProjectsChange(listResult.projects);
        if (listResult.activeProjectId) {
          onActiveProjectChange(listResult.activeProjectId);
        }
      }
    } catch {
      setErrorMessage('보관하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="project-switcher" ref={rootRef}>
      <button type="button" className="project-switcher-trigger" onClick={() => setOpen((v) => !v)}>
        📁 {resolveActiveProjectName(projects, activeProjectId)} ▾
      </button>

      {open && (
        <div className="project-switcher-dropdown" role="menu">
          {errorMessage && (
            <p className="project-switcher-error" role="alert">
              {errorMessage}
            </p>
          )}

          {mode === 'list' && (
            <ProjectListMode
              projects={projects}
              activeProjectId={activeProjectId}
              busy={busy}
              onSwitch={handleSwitch}
              onArchive={handleArchive}
              onStartRename={(project) => {
                setMode('rename');
                setRenamingId(project.id);
                setNameInput(project.name);
                setErrorMessage(null);
              }}
              onStartCreate={() => {
                setMode('create');
                setNameInput('');
                setErrorMessage(null);
              }}
            />
          )}

          {mode === 'create' && (
            <ProjectNameForm
              label="새 연구 이름"
              placeholder="이름을 입력해 주세요 (비워두면 자동으로 지어드려요)"
              value={nameInput}
              busy={busy}
              canSubmit={canCreateProject(nameInput, busy)}
              submitLabel="만들기"
              onChange={setNameInput}
              onSubmit={handleCreate}
              onCancel={() => setMode('list')}
            />
          )}

          {mode === 'rename' && renamingId && (
            <ProjectNameForm
              label="새 이름"
              placeholder="새 이름을 입력해 주세요"
              value={nameInput}
              busy={busy}
              canSubmit={canRenameProject(nameInput, busy)}
              submitLabel="바꾸기"
              onChange={setNameInput}
              onSubmit={() => handleRename(renamingId)}
              onCancel={() => setMode('list')}
            />
          )}
        </div>
      )}
    </div>
  );
}
