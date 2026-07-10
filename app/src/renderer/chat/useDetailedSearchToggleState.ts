/**
 * State for the "🔍+ 상세검색" toggle (paid-mode "상세검색" feature). Split out
 * of `ChatScreen.tsx` (file-size-limit), same pattern as
 * `useNaverDocBannerState.ts` / `useResearchHandoffButtonState.ts`.
 *
 * Fetches the current LLM mode once on mount via the optional
 * `getLlmStatus` callback — never re-fetched on a later mode switch, mirroring
 * `useNaverDocBannerState.ts`'s rationale (registration/mode rarely changes
 * mid-session). The checked state always starts `false` — paid mode alone
 * never auto-enables it, since a "상세검색" run doubles the search cost and
 * must always be an explicit user choice.
 */
import { useEffect, useState } from 'react';

import type { IpcLlmMode } from '../../shared/ipc-channels';
import { isDetailedSearchAvailable } from './detailedSearchLogic';

export interface DetailedSearchToggleState {
  /** Whether the checkbox is selectable right now (paid mode only). */
  available: boolean;
  /** Current toggle value — always starts `false`; the caller passes this to `runResearch`. */
  checked: boolean;
  setChecked(checked: boolean): void;
}

export function useDetailedSearchToggleState(
  getLlmStatus: (() => Promise<{ mode: IpcLlmMode }>) | undefined,
): DetailedSearchToggleState {
  const [llmMode, setLlmMode] = useState<IpcLlmMode | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!getLlmStatus) {
      return undefined;
    }
    let cancelled = false;
    getLlmStatus()
      .then((status) => {
        if (!cancelled) {
          setLlmMode(status.mode);
        }
      })
      .catch(() => {
        // Non-critical: the toggle just stays locked until the status
        // resolves — same fallback as `useNaverDocBannerState`.
      });
    return () => {
      cancelled = true;
    };
    // Runs once on mount — deliberately not re-run per mode switch, see the
    // module doc comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const available = isDetailedSearchAvailable(llmMode);

  return {
    available,
    // A toggle that became unavailable mid-session (should not normally
    // happen, since mode is fetched once) never silently sends `detailed:
    // true` — always report unchecked while locked.
    checked: available && checked,
    setChecked,
  };
}
