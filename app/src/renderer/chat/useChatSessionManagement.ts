/**
 * Chat-history + cross-tab handoff session management (T54 sidebar,
 * SPEC-TSA-002 FR-CHM-002~004; handoff added T51/T62, FR-RSH-003). Split out
 * of `ChatScreen.tsx` (file-size-limit), same pattern as
 * `useResearchHandoffButtonState.ts` / `useLibrarySaveState.ts`.
 *
 * Owns every piece of state around "which saved session (if any) is loaded"
 * plus the handlers that load/replace the transcript from either the
 * history panel or a "이 결과로 회의하기" handoff (in-screen or cross-tab via
 * `pendingHandoff`), and the short preview banner shown right after a
 * handoff completes.
 */
import { useEffect, useState } from 'react';

import type { ChatAction } from './chatUiLogic';
import { mapIpcMessagesToChatMessages } from './chatHistoryLogic';
import type { ChatHistoryCallbacks } from '../appCallbacks';
import type { ChatHistoryLoadResult } from '../../shared/ipc-channels';
import type { IpcChatMessage } from '../../shared/ipc/chatHistory';

export interface ChatSessionManagement {
  historyOpen: boolean;
  toggleHistoryOpen(): void;
  closeHistory(): void;
  activeSessionId: string | null;
  historyActionError: string | null;
  handoffPreview: string | null;
  clearHandoffPreview(): void;
  handleSessionLoaded(result: Extract<ChatHistoryLoadResult, { ok: true }>): void;
  handleNewChat(): Promise<void>;
  handleHandoffComplete(messages: IpcChatMessage[], preview: string): void;
  handleActiveSessionRemoved(): void;
}

export function useChatSessionManagement(
  dispatch: (action: ChatAction) => void,
  historyCallbacks: ChatHistoryCallbacks,
  pendingHandoff: { messages: IpcChatMessage[]; preview: string } | null | undefined,
  onHandoffConsumed: (() => void) | undefined,
): ChatSessionManagement {
  const [historyOpen, setHistoryOpen] = useState(false);
  // The saved session (if any) currently loaded into the transcript — null
  // for a brand-new, never-loaded conversation. Only ever set by a
  // successful `chat-history:load`, and cleared by "새 대화" or by deleting
  // this very session from the panel.
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [historyActionError, setHistoryActionError] = useState<string | null>(null);
  // Short banner shown right after a "이 결과로 회의하기" handoff completes —
  // cleared on the next send/새 대화/session load so it never lingers past
  // the moment it describes.
  const [handoffPreview, setHandoffPreview] = useState<string | null>(null);

  // The main process already restored the ConversationManager and cleared
  // the active-session tracker (see `researchHandoffHandlers.ts`) — this only
  // needs to load the injected turns and reset local session state.
  function handleHandoffComplete(messages: IpcChatMessage[], preview: string): void {
    dispatch({ type: 'LOAD_HISTORY_SESSION', messages: mapIpcMessagesToChatMessages('handoff', messages) });
    setActiveSessionId(null);
    setHistoryOpen(false);
    setHistoryActionError(null);
    setHandoffPreview(preview);
  }

  // Cross-tab handoff (SPEC-TSA-002, T62): `pendingHandoff` is set once by
  // `App.tsx` right after the 🔍 리서치 tab's "이 결과로 회의하기" button
  // switches `mainTab` to 'chat'. Reuses the exact same load path as the
  // in-screen handoff button, then reports consumption so the parent clears
  // its own state and this never re-fires.
  useEffect(() => {
    if (!pendingHandoff) return;
    handleHandoffComplete(pendingHandoff.messages, pendingHandoff.preview);
    onHandoffConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHandoff]);

  // Loaded from the history panel — the main process has already restored
  // the ConversationManager, so the next chat turn continues right on.
  function handleSessionLoaded(result: Extract<ChatHistoryLoadResult, { ok: true }>): void {
    dispatch({ type: 'LOAD_HISTORY_SESSION', messages: mapIpcMessagesToChatMessages(result.id, result.messages) });
    setActiveSessionId(result.id);
    setHistoryOpen(false);
    setHistoryActionError(null);
    setHandoffPreview(null);
  }

  // "＋ 새 대화" header button (FR-CHM-004). Clears the backend's active
  // session tracker first so the next autosaved turn starts a fresh session
  // instead of appending to the one just left.
  async function handleNewChat(): Promise<void> {
    setHistoryActionError(null);
    setHandoffPreview(null);
    try {
      await historyCallbacks.newChatHistory();
      dispatch({ type: 'NEW_CHAT_SESSION' });
      setActiveSessionId(null);
      setHistoryOpen(false);
    } catch {
      setHistoryActionError('새 대화를 시작하지 못했어요. 다시 시도해 주세요.');
    }
  }

  // The currently-open session was deleted from the panel — the backend
  // already cleared its own active-session tracker, so only local UI state
  // needs resetting (no further IPC call needed).
  function handleActiveSessionRemoved(): void {
    dispatch({ type: 'NEW_CHAT_SESSION' });
    setActiveSessionId(null);
  }

  return {
    historyOpen,
    toggleHistoryOpen: () => setHistoryOpen((open) => !open),
    closeHistory: () => setHistoryOpen(false),
    activeSessionId,
    historyActionError,
    handoffPreview,
    clearHandoffPreview: () => setHandoffPreview(null),
    handleSessionLoaded,
    handleNewChat,
    handleHandoffComplete,
    handleActiveSessionRemoved,
  };
}
