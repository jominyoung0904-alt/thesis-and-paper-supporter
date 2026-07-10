/**
 * Root shell component (Wave 4.5 central integration / SPEC-TSA-001; review-fix
 * HIGH#1 wired up the writing-check tab).
 *
 * On mount, asks the main process whether this is a first run (no LLM
 * provider key registered yet). First-run users see the setup wizard;
 * everyone else land on the main screen, which now offers two tabs:
 * "💬 대화" (the original single-chat interface) and "✍️ 서론 점검" (the
 * FR-WRT-001/002 quality-gate screen). Both screens are pure — every side
 * effect flows through `window.thesisApi` via the callback factories in
 * `appCallbacks.ts`.
 */
import { useEffect, useState } from 'react';

import { ChatScreen } from './chat';
import {
  createChatScreenCallbacks,
  createSettingsScreenCallbacks,
  createWizardCallbacks,
  createWritingCheckCallbacks,
} from './appCallbacks';
import { SettingsScreen } from './settings/SettingsScreen';
import { Wizard } from './settings/wizard';
import { WritingCheckScreen } from './writing/WritingCheckScreen';
import './appTabs.css';

type BootStatus = 'loading' | 'wizard' | 'chat';
type MainTab = 'chat' | 'writing' | 'settings';

export function App(): JSX.Element {
  const [status, setStatus] = useState<BootStatus>('loading');
  const [mainTab, setMainTab] = useState<MainTab>('chat');

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

  return (
    <div className="app-main">
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

      {mainTab === 'chat' && <ChatScreen callbacks={createChatScreenCallbacks()} />}
      {mainTab === 'writing' && <WritingCheckScreen callbacks={createWritingCheckCallbacks()} />}
      {mainTab === 'settings' && <SettingsScreen callbacks={createSettingsScreenCallbacks()} />}
    </div>
  );
}
