/**
 * "list" mode body of `ProjectSwitcher`'s dropdown — the project rows (switch
 * / rename / archive) plus the "새 연구 만들기" trigger. Split out purely to
 * keep `ProjectSwitcher.tsx` under the project's 300-line file limit.
 */
import type { IpcProjectInfo } from '../../shared/ipc-channels';

export interface ProjectListModeProps {
  projects: IpcProjectInfo[];
  activeProjectId: string | null;
  busy: boolean;
  onSwitch: (id: string) => void;
  onArchive: (project: IpcProjectInfo) => void;
  onStartRename: (project: IpcProjectInfo) => void;
  onStartCreate: () => void;
}

export function ProjectListMode({
  projects,
  activeProjectId,
  busy,
  onSwitch,
  onArchive,
  onStartRename,
  onStartCreate,
}: ProjectListModeProps): JSX.Element {
  return (
    <>
      <ul className="project-switcher-list">
        {projects.map((project) => (
          <li key={project.id} className="project-switcher-item">
            <button
              type="button"
              className={`project-switcher-item-name${project.id === activeProjectId ? ' project-switcher-item-active' : ''}`}
              onClick={() => onSwitch(project.id)}
              disabled={busy}
            >
              {project.id === activeProjectId ? '✓ ' : ''}
              {project.name}
            </button>
            <button
              type="button"
              className="project-switcher-icon-btn"
              title="이름 바꾸기"
              aria-label={`${project.name} 이름 바꾸기`}
              onClick={() => onStartRename(project)}
              disabled={busy}
            >
              ✏️
            </button>
            <button
              type="button"
              className="project-switcher-icon-btn"
              title="보관하기"
              aria-label={`${project.name} 보관하기`}
              onClick={() => onArchive(project)}
              disabled={busy}
            >
              📦
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="project-switcher-create-btn" onClick={onStartCreate} disabled={busy}>
        ➕ 새 연구 만들기
      </button>
    </>
  );
}
