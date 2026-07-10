/**
 * Root shell component (Wave 4.5 central integration / SPEC-TSA-001).
 *
 * On mount, asks the main process whether this is a first run (no LLM
 * provider key registered yet). First-run users see the setup wizard;
 * everyone else goes straight to the single-chat interface. Both screens are
 * pure — every side effect flows through `window.thesisApi` via the callback
 * factories in `appCallbacks.ts`.
 *
 * QualityGateView (the writing/quality-gate screen) is NOT wired up here —
 * the writing screen itself is a later sprint's deliverable (Sprint 2+),
 * out of this integration's scope.
 */
import { useEffect, useState } from 'react';

import { ChatScreen } from './chat';
import { createChatScreenCallbacks, createWizardCallbacks } from './appCallbacks';
import { Wizard } from './settings/wizard';

type BootStatus = 'loading' | 'wizard' | 'chat';

export function App(): JSX.Element {
  const [status, setStatus] = useState<BootStatus>('loading');

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

  return <ChatScreen callbacks={createChatScreenCallbacks()} />;
}
