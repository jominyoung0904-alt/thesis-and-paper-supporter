/**
 * Root shell component (Wave 4.5 central integration / SPEC-TSA-001;
 * T42/SPEC-TSA-002 wired up the project switcher; T62/SPEC-TSA-002
 * re-organized the main screen into the current five-tab layout).
 *
 * On mount, asks the main process whether this is a first run (no LLM
 * provider key registered yet). First-run users see the setup wizard;
 * everyone else lands on the main screen, which now offers five tabs:
 * "💬 대화" (free chat + deep-research mode toggle, unchanged), "🔍 리서치"
 * (saved deep-research history — browsing/reuse only; running a new deep
 * research still happens from the 대화 tab's mode toggle), "📚 보관함"
 * (saved literature library), "✍️ 글쓰기" (the FR-WRT-001/002/010/011
 * writing-support suite, T59's `WritingScreen`), and "⚙️ 설정". Every screen
 * is pure — every side effect flows through `window.thesisApi` via the
 * callback factories in `appCallbacks.ts`.
 *
 * `activeProjectId`/`projects` are owned here (FR-PRJ) and loaded once the
 * user lands on the main screen (never during the wizard flow). The
 * project-scoped screens (every tab but 설정) are keyed off `activeProjectId`
 * so a switch or a newly-created project force-remounts them, resetting
 * their renderer-local state to match the main process's own conversation
 * reset on `project:switch`/`project:create` (see T41's completion report).
 *
 * Cross-tab handoff (FR-RSH-003, T51/T62): clicking "이 결과로 회의하기" from
 * the 🔍 리서치 tab's record detail view starts the handoff, then hands the
 * injected transcript + preview banner to this shell via
 * `ResearchHistoryScreen.onHandoffComplete`, which stores it as
 * `pendingHandoff` and switches `mainTab` to 'chat'. `ChatScreen` consumes
 * `pendingHandoff` on mount/update and reports back via `onHandoffConsumed`
 * so the same handoff is never re-injected on a later re-render.
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
  createLibraryScreenCallbacks,
  createProjectScreenCallbacks,
  createResearchHistoryScreenCallbacks,
  createSettingsScreenCallbacks,
  createWizardCallbacks,
  createWritingScreenCallbacks,
} from './appCallbacks';
import { LibraryScreen } from './library/LibraryScreen';
import { ProjectSwitcher } from './project/ProjectSwitcher';
import { ResearchHistoryScreen } from './research/ResearchHistoryScreen';
import type { IpcProjectInfo } from '../shared/ipc-channels';
import type { IpcChatMessage } from '../shared/ipc/chatHistory';
import { SettingsScreen } from './settings/SettingsScreen';
import { Wizard } from './settings/wizard';
import { WritingScreen } from './writing/WritingScreen';
import './appTabs.css';

type BootStatus = 'loading' | 'wizard' | 'chat';
type MainTab = 'chat' | 'research' | 'library' | 'writing' | 'settings';

/** A handoff waiting to be consumed by `ChatScreen` after switching to it (T62). */
type PendingHandoff = { messages: IpcChatMessage[]; preview: string } | null;

const MAIN_TABS: ReadonlyArray<{ id: MainTab; label: string }> = [
  { id: 'chat', label: '💬 대화' },
  { id: 'research', label: '🔍 리서치' },
  { id: 'library', label: '📚 보관함' },
  { id: 'writing', label: '✍️ 글쓰기' },
  { id: 'settings', label: '⚙️ 설정' },
];

export function App(): JSX.Element {
  const [status, setStatus] = useState<BootStatus>('loading');
  const [mainTab, setMainTab] = useState<MainTab>('chat');
  const [projects, setProjects] = useState<IpcProjectInfo[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [pendingHandoff, setPendingHandoff] = useState<PendingHandoff>(null);

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
        {MAIN_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={mainTab === tab.id}
            className={`app-tab-btn${mainTab === tab.id ? ' app-tab-btn-active' : ''}`}
            onClick={() => setMainTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mainTab === 'chat' && (
        <ChatScreen
          key={screenKey}
          callbacks={createChatScreenCallbacks()}
          pendingHandoff={pendingHandoff}
          onHandoffConsumed={() => setPendingHandoff(null)}
        />
      )}
      {mainTab === 'research' && (
        <ResearchHistoryScreen
          key={screenKey}
          callbacks={createResearchHistoryScreenCallbacks()}
          openLink={(url) => window.thesisApi.openExternal(url)}
          startResearchHandoff={(researchId) => window.thesisApi.startResearchHandoff(researchId)}
          onHandoffComplete={(messages, preview) => {
            setPendingHandoff({ messages, preview });
            setMainTab('chat');
          }}
        />
      )}
      {mainTab === 'library' && <LibraryScreen key={screenKey} callbacks={createLibraryScreenCallbacks()} />}
      {mainTab === 'writing' && <WritingScreen key={screenKey} callbacks={createWritingScreenCallbacks()} />}
      {mainTab === 'settings' && <SettingsScreen callbacks={createSettingsScreenCallbacks()} />}
    </div>
  );
}
