/**
 * Single-chat interface shell (Task T17 / SPEC-TSA-001, FR-CHT-001/002;
 * chat-history sidebar added in T54, SPEC-TSA-002 FR-CHM-002~004).
 *
 * The whole product is reachable from one chat: this screen switches
 * between "아이디어 회의" (free chat) and "논문 찾기" (deep research) by mode
 * toggle, never by navigating to a different screen. Like `Wizard.tsx`, it
 * performs no IPC of its own for the chat/research turn itself — every such
 * side effect goes through `ChatScreenCallbacks`, supplied by the central
 * app shell. The chat-history sidebar is the one exception: it builds its
 * own `ChatHistoryCallbacks` directly from `appCallbacks.ts` (same "type
 * mirror adapter" factory every other screen uses), rather than threading a
 * second callback bag through `ChatScreenProps` — this keeps T54's surface
 * self-contained without requiring an `App.tsx` prop-plumbing change.
 *
 * Layout (Task T35 fix#1): the screen is viewport-fixed — only
 * `.chat-scroll-area` (messages + research panel + decision card) scrolls;
 * `MessageInput` (mode toggle + textarea) is a non-scrolling flex sibling
 * that always stays visible at the bottom, KakaoTalk-style, instead of being
 * pushed off-screen by a long research report. A bottom anchor element is
 * scrolled into view whenever a new message arrives or a research run
 * finishes, so the latest content is always in view without the user
 * having to scroll manually. The history panel (when open) sits between the
 * header and `.chat-scroll-area`, outside the scrolling messages area, so it
 * never gets pushed away by a long conversation.
 */
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { canSendMessage, canSwitchMode, chatReducer, createInitialChatState } from './chatUiLogic';
import { mapIpcMessagesToChatMessages } from './chatHistoryLogic';
import { startHandoffFromLatestResult } from './researchHandoffLogic';
import { SLOW_RESPONSE_DELAY_MS, SLOW_RESPONSE_MESSAGE } from './slowResponseLogic';
import type { ChatScreenProps } from './chatTypes';
import { createChatHistoryCallbacks, createResearchHistoryScreenCallbacks } from '../appCallbacks';
import type { ChatHistoryLoadResult } from '../../shared/ipc-channels';
import type { IpcChatMessage } from '../../shared/ipc/chatHistory';
import type { ResearchHandoffStartResult } from '../../shared/ipc/researchHandoff';
import { ChatHistoryPanel } from './ChatHistoryPanel';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ResearchProgress } from './ResearchProgress';
import { DecisionConfirmCard } from './DecisionConfirmCard';
import './chat.css';

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ChatScreen({ callbacks, pendingHandoff, onHandoffConsumed }: ChatScreenProps): JSX.Element {
  const [state, dispatch] = useReducer(chatReducer, createInitialChatState());
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const historyCallbacks = useMemo(() => createChatHistoryCallbacks(), []);
  const [historyOpen, setHistoryOpen] = useState(false);
  // The saved session (if any) currently loaded into `state.messages` — null
  // for a brand-new, never-loaded conversation. Only ever set by a
  // successful `chat-history:load`, and cleared by "새 대화" or by deleting
  // this very session from the panel.
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [historyActionError, setHistoryActionError] = useState<string | null>(null);
  // Short banner shown right after a "이 결과로 회의하기" handoff completes
  // (FR-RSH-003, T51) — cleared on the next send/새 대화/session load so it
  // never lingers past the moment it describes.
  const [handoffPreview, setHandoffPreview] = useState<string | null>(null);
  const isBusy = state.sending || state.research.active;
  // Rate-limit visibility (defensive follow-up to the field debugger's
  // investigation into an intermittent chat/research stall — root cause
  // unconfirmed): if a turn stays busy for `SLOW_RESPONSE_DELAY_MS` straight,
  // tell the user it may be a free-tier rate limit instead of leaving them
  // to guess whether the app has hung. Cleared the instant `isBusy` flips
  // back to false, so it never lingers past the turn it describes.
  const [showSlowResponseBanner, setShowSlowResponseBanner] = useState(false);
  useEffect(() => {
    if (!isBusy) {
      setShowSlowResponseBanner(false);
      return undefined;
    }
    const timer = setTimeout(() => setShowSlowResponseBanner(true), SLOW_RESPONSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isBusy]);

  // Auto-scroll to the latest content on new messages and on research
  // start/finish (active flips, or a result/error lands) — not on every
  // keystroke or progress-stage tick, so it doesn't fight manual scrolling.
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [state.messages.length, state.research.active, state.research.result, state.research.errorMessage]);

  // Cross-tab handoff (SPEC-TSA-002, T62): `pendingHandoff` is set once by
  // `App.tsx` right after the 🔍 리서치 tab's "이 결과로 회의하기" button
  // switches `mainTab` to 'chat'. Reuses the exact same load path as the
  // in-screen handoff button (`handleHandoffComplete`), then reports
  // consumption so the parent clears its own state and this never re-fires.
  useEffect(() => {
    if (!pendingHandoff) return;
    handleHandoffComplete(pendingHandoff.messages, pendingHandoff.preview);
    onHandoffConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHandoff]);

  async function handleSend(): Promise<void> {
    const text = state.inputText.trim();
    if (!canSendMessage(state) || text.length === 0) {
      return;
    }
    setHandoffPreview(null);

    if (state.mode === 'research') {
      dispatch({ type: 'RESEARCH_START', id: makeId(), question: text, now: Date.now() });
      try {
        const result = await callbacks.runResearch(text, (event) => {
          dispatch({ type: 'RESEARCH_PROGRESS', stage: event.stage, detail: event.detail });
        });
        dispatch({ type: 'RESEARCH_SUCCESS', result });
      } catch (error) {
        dispatch({
          type: 'RESEARCH_FAILURE',
          message: error instanceof Error ? error.message : '논문을 찾는 중 문제가 생겼어요.',
        });
      }
      return;
    }

    dispatch({ type: 'SEND_CHAT_START', id: makeId(), text, now: Date.now() });
    try {
      const result = await callbacks.sendChat(text);
      dispatch({
        type: 'SEND_CHAT_SUCCESS',
        id: makeId(),
        now: Date.now(),
        reply: result.reply,
        suggestedDecision: result.suggestedDecision,
      });
    } catch (error) {
      dispatch({
        type: 'SEND_CHAT_FAILURE',
        id: makeId(),
        now: Date.now(),
        message: error instanceof Error ? error.message : '답변을 가져오는 중 문제가 생겼어요. 다시 시도해 주세요.',
      });
    }
  }

  async function handleConfirmDecision(decision: { what: string; why: string }): Promise<void> {
    dispatch({ type: 'DECISION_SAVE_START' });
    try {
      await callbacks.saveDecision(decision.what, decision.why);
      dispatch({ type: 'DECISION_SAVE_SUCCESS' });
    } catch (error) {
      dispatch({
        type: 'DECISION_SAVE_FAILURE',
        message: error instanceof Error ? error.message : '기록에 실패했어요. 다시 시도해 주세요.',
      });
    }
  }

  // Loaded from the history panel — the main process has already restored
  // the ConversationManager, so the next `handleSend` continues right on.
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

  // "이 결과로 회의하기" from a freshly finished research result (FR-RSH-003,
  // T51): the result itself has no history id, so this resolves it from the
  // most recently saved research-history entry — see `researchHandoffLogic.ts`.
  async function handleStartHandoffFromLatestResult(): Promise<ResearchHandoffStartResult> {
    if (!callbacks.startResearchHandoff) {
      return { ok: false, reason: 'not_found' };
    }
    return startHandoffFromLatestResult(
      () => createResearchHistoryScreenCallbacks().listResearchHistory(),
      callbacks.startResearchHandoff,
    );
  }

  // The main process already restored the ConversationManager and cleared
  // the active-session tracker (see `researchHandoffHandlers.ts`) — the
  // renderer only needs to load the injected turns and reset local session
  // state, same as `handleNewChat`.
  function handleHandoffComplete(messages: IpcChatMessage[], preview: string): void {
    dispatch({ type: 'LOAD_HISTORY_SESSION', messages: mapIpcMessagesToChatMessages('handoff', messages) });
    setActiveSessionId(null);
    setHistoryOpen(false);
    setHistoryActionError(null);
    setHandoffPreview(preview);
  }

  // The currently-open session was deleted from the panel — the backend
  // already cleared its own active-session tracker, so only local UI state
  // needs resetting (no further IPC call needed).
  function handleActiveSessionRemoved(): void {
    dispatch({ type: 'NEW_CHAT_SESSION' });
    setActiveSessionId(null);
  }

  return (
    <div className="chat-screen">
      <div className="chat-header">
        <button
          type="button"
          className="chat-history-toggle-btn"
          aria-expanded={historyOpen}
          aria-label="대화 목록 열기/닫기"
          onClick={() => setHistoryOpen((v) => !v)}
        >
          📑 대화 목록
        </button>
        <button type="button" className="chat-new-btn" aria-label="새 대화 시작" onClick={() => void handleNewChat()}>
          ＋ 새 대화
        </button>
      </div>
      {historyActionError && (
        <p className="chat-history-action-error" role="alert">
          {historyActionError}
        </p>
      )}
      {handoffPreview && (
        <p className="chat-handoff-preview" role="status">
          {handoffPreview}
        </p>
      )}
      <ChatHistoryPanel
        open={historyOpen}
        callbacks={historyCallbacks}
        activeSessionId={activeSessionId}
        onClose={() => setHistoryOpen(false)}
        onSessionLoaded={handleSessionLoaded}
        onActiveSessionRemoved={handleActiveSessionRemoved}
      />
      <div className="chat-scroll-area">
        <MessageList messages={state.messages} />
        <ResearchProgress
          research={state.research}
          onOpenLink={callbacks.openLink}
          onStartHandoff={callbacks.startResearchHandoff ? handleStartHandoffFromLatestResult : undefined}
          onHandoffComplete={handleHandoffComplete}
        />
        <DecisionConfirmCard
          card={state.decisionCard}
          onConfirm={handleConfirmDecision}
          onDismiss={() => dispatch({ type: 'DECISION_DISMISS' })}
        />
        <div className="chat-scroll-anchor" ref={scrollAnchorRef} />
      </div>
      {showSlowResponseBanner && (
        <p className="chat-slow-response-banner" role="status">
          {SLOW_RESPONSE_MESSAGE}
        </p>
      )}
      <MessageInput
        mode={state.mode}
        text={state.inputText}
        canSend={canSendMessage(state)}
        modeLocked={!canSwitchMode(state)}
        busy={isBusy}
        onChangeMode={(mode) => dispatch({ type: 'SET_MODE', mode })}
        onChangeText={(text) => dispatch({ type: 'SET_INPUT', text })}
        onSend={handleSend}
      />
    </div>
  );
}
