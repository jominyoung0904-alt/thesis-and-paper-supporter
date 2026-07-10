/**
 * "이 결과로 회의하기" button state for `ResearchProgress`'s finished-result
 * panel (Task T51, FR-RSH-003). Split out of `ResearchProgress.tsx`
 * (file-size-limit), same pattern as `useLibrarySaveState.ts`.
 *
 * Deliberately generic about HOW the target research record's id is
 * resolved — `trigger()` takes the whole "resolve id + call
 * `research-handoff:start`" thunk as an argument, because the two callers
 * that reuse `ResearchProgress` need different resolution strategies:
 * `ChatScreen.tsx` looks up the most recently saved research-history entry
 * (a freshly finished `research:run` result has no id of its own), while
 * `ResearchHistoryScreen.tsx`'s detail view already knows `record.id`
 * directly. This hook only owns the shared loading/error UX around whatever
 * thunk it is given.
 */
import { useState } from 'react';

import type { IpcChatMessage } from '../../shared/ipc/chatHistory';
import type { ResearchHandoffStartFailureReason, ResearchHandoffStartResult } from '../../shared/ipc/researchHandoff';

export type HandoffButtonStatus = 'idle' | 'loading' | 'error';

export interface ResearchHandoffButtonState {
  status: HandoffButtonStatus;
  errorMessage: string | null;
  /** Runs `action` (id resolution + `research-handoff:start`) and reports success via the hook's `onComplete`. */
  trigger(action: () => Promise<ResearchHandoffStartResult>): void;
}

const FAILURE_MESSAGES: Record<ResearchHandoffStartFailureReason, string> = {
  not_found: '리서치 기록을 찾을 수 없어요. 다시 시도해 주세요.',
  no_key: 'AI 기능을 사용하려면 먼저 설정에서 API 키를 등록해 주세요.',
};

/** `onComplete` fires only on a successful handoff, with the turns to render + the preview banner text. */
export function useResearchHandoffButtonState(
  onComplete: (messages: IpcChatMessage[], preview: string) => void,
): ResearchHandoffButtonState {
  const [status, setStatus] = useState<HandoffButtonStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function run(action: () => Promise<ResearchHandoffStartResult>): Promise<void> {
    setStatus('loading');
    setErrorMessage(null);
    try {
      const result = await action();
      if (!result.ok) {
        setStatus('error');
        setErrorMessage(FAILURE_MESSAGES[result.reason]);
        return;
      }
      setStatus('idle');
      onComplete(result.messages, result.preview);
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '회의를 시작하지 못했어요. 다시 시도해 주세요.');
    }
  }

  function trigger(action: () => Promise<ResearchHandoffStartResult>): void {
    void run(action);
  }

  return { status, errorMessage, trigger };
}
