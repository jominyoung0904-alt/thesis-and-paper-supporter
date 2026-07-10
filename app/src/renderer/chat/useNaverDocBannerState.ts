/**
 * State for the naverdoc-connect info banner (실사용 피드백 #2). Split out of
 * `ChatScreen.tsx` (file-size-limit), same pattern as
 * `useResearchHandoffButtonState.ts` / `useLibrarySaveState.ts`.
 *
 * Fetches the naverdoc key status once on mount via the optional
 * `getAcademicKeyStatus` callback — never re-fetched on a later mode switch,
 * since `shouldShowNaverDocBanner` only needs the status to already be
 * loaded by the time the user switches to research mode, and the
 * registration rarely changes mid-session. Tracks a session-only
 * "dismissed" flag once the user clicks 닫기 — in-memory state is enough per
 * the feature request, no need to persist it across app restarts.
 */
import { useEffect, useState } from 'react';

import type { AcademicKeyStatus } from '../../shared/ipc-channels';
import type { ChatMode } from './chatTypes';
import { shouldShowNaverDocBanner } from './naverDocBannerLogic';

export interface NaverDocBannerState {
  visible: boolean;
  dismiss(): void;
}

export function useNaverDocBannerState(
  mode: ChatMode,
  getAcademicKeyStatus: (() => Promise<AcademicKeyStatus>) | undefined,
): NaverDocBannerState {
  const [naverDocRegistered, setNaverDocRegistered] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!getAcademicKeyStatus) {
      return undefined;
    }
    let cancelled = false;
    getAcademicKeyStatus()
      .then((status) => {
        if (!cancelled) {
          setNaverDocRegistered(status.naverdoc);
        }
      })
      .catch(() => {
        // Non-critical: the banner just stays hidden until the status
        // resolves — it's purely informational, never blocking.
      });
    return () => {
      cancelled = true;
    };
    // Runs once on mount — deliberately not re-run per mode switch, see the
    // module doc comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    visible: shouldShowNaverDocBanner({ mode, naverDocRegistered, dismissed }),
    dismiss: () => setDismissed(true),
  };
}
