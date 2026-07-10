/**
 * Root shell component (Wave 4.5 central integration / SPEC-TSA-001; review-fix
 * HIGH#1 wired up the writing-check tab; T42/SPEC-TSA-002 wired up the
 * project switcher).
 *
 * On mount, asks the main process whether this is a first run (no LLM
 * provider key registered yet). First-run users see the setup wizard;
 * everyone else land on the main screen, which now offers two tabs:
 * "💬 대화" (the original single-chat interface) and "✍️ 서론 점검" (the
 * FR-WRT-001/002 quality-gate screen). Both screens are pure — every side
 * effect flows through `window.thesisApi` via the callback factories in
 * `appCallbacks.ts`.
 *
 * `activeProjectId`/`projects` are owned here (FR-PRJ) and loaded once the
 * user lands on the main screen (never during the wizard flow). The
 * project-scoped screens (chat/writing-check) are keyed off
 * `activeProjectId` so a switch or a newly-created project force-remounts
 * them, resetting their renderer-local state to match the main process's own
 * conversation reset on `project:switch`/`project:create` (see T41's
 * completion report).
 *
 * `FontSizeControl` is intentionally NOT mounted here — it lives in its own
 * DOM root outside `#root` (see `main.tsx`/`index.html`) so the zoom-based
 * font-scale it applies to `#root` never scales the control widget itself
 * (Task T35 fix#3).
 */
import { useEffect, useState } from 'react';

import { ChatScreen } from './chat';
import {
  createChatScreenCallbacks,
  createProjectScreenCallbacks,
  createSettingsScreenCallbacks,
  createWizardCallbacks,
  createWritingCheckCallbacks,
} from './appCallbacks';
import { ProjectSwitcher } from './project/ProjectSwitcher';
import type { IpcProjectInfo } from '../shared/ipc-channels';
import { SettingsScreen } from './settings/SettingsScreen';
import { Wizard } from './settings/wizard';
import { WritingCheckScreen } from './writing/WritingCheckScreen';
import './appTabs.css';

type BootStatus = 'loading' | 'wizard' | 'chat';
type MainTab = 'chat' | 'writing' | 'settings';

export function App(): JSX.Element {
  const [status, setStatus] = useState<BootStatus>('loading');
  const [mainTab, setMainTab] = useState<MainTab>('chat');
  const [projects, setProjects] = useState<IpcProjectInfo[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    window.thesisApi
      .getStartupState()
      .then((state) => {
        if (!cancelled) {
          setStatus(state.firstRun ? 'wizard' : 'chat');
        }
      })
      .catch(() => {
        // Startup-state lookup should never realistically fail (it only
        // reads the local key store), but fail open to the chat screen
        // rather than stranding the user on a permanent loading state.
        if (!cancelled) {
          setStatus('chat');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Load the project list only once the user is actually on the main screen
  // (never during the first-run wizard) — mirrors the getStartupState effect
  // above.
  useEffect(() => {
    if (status !== 'chat') return undefined;
    let cancelled = false;

    createProjectScreenCallbacks()
      .listProjects()
      .then((result) => {
        if (!cancelled) {
          setProjects(result.projects);
          setActiveProjectId(result.activeProjectId);
        }
      })
      .catch(() => {
        // Non-critical: the switcher just shows an empty list until the user
        // retries via its own dropdown actions.
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  return renderBody(status, mainTab, setStatus, setMainTab, {
    projects,
    activeProjectId,
    setProjects,
    setActiveProjectId,
  });
}

interface ProjectState {
  projects: IpcProjectInfo[];
  activeProjectId: string | null;
  setProjects: (projects: IpcProjectInfo[]) => void;
  setActiveProjectId: (id: string) => void;
}

function renderBody(
  status: BootStatus,
  mainTab: MainTab,
  setStatus: (status: BootStatus) => void,
  setMainTab: (tab: MainTab) => void,
  projectState: ProjectState,
): JSX.Element {
  if (status === 'loading') {
    return (
      <main className="app-loading">
        <p>불러오는 중이에요...</p>
      </main>
    );
  }

  if (status === 'wizard') {
    return <Wizard callbacks={createWizardCallbacks()} onComplete={() => setStatus('chat')} />;
  }

  const { projects, activeProjectId, setProjects, setActiveProjectId } = projectState;
  const screenKey = activeProjectId ?? 'default';

  return (
    <div className="app-main">
      <ProjectSwitcher
        callbacks={createProjectScreenCallbacks()}
        projects={projects}
        activeProjectId={activeProjectId}
        onProjectsChange={setProjects}
        onActiveProjectChange={setActiveProjectId}
      />
      <div className="app-tabs" role="tablist" aria-label="주요 화면 전환">
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === 'chat'}
          className={`app-tab-btn${mainTab === 'chat' ? ' app-tab-btn-active' : ''}`}
          onClick={() => setMainTab('chat')}
        >
          💬 대화
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === 'writing'}
          className={`app-tab-btn${mainTab === 'writing' ? ' app-tab-btn-active' : ''}`}
          onClick={() => setMainTab('writing')}
        >
          ✍️ 서론 점검
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === 'settings'}
          className={`app-tab-btn${mainTab === 'settings' ? ' app-tab-btn-active' : ''}`}
          onClick={() => setMainTab('settings')}
        >
          ⚙️ 설정
        </button>
      </div>

      {mainTab === 'chat' && <ChatScreen key={screenKey} callbacks={createChatScreenCallbacks()} />}
      {mainTab === 'writing' && <WritingCheckScreen key={screenKey} callbacks={createWritingCheckCallbacks()} />}
      {mainTab === 'settings' && <SettingsScreen callbacks={createSettingsScreenCallbacks()} />}
    </div>
  );
}
