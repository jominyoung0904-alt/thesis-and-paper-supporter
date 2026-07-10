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
import type { ChatScreenProps } from './chatTypes';
import { createChatHistoryCallbacks } from '../appCallbacks';
import type { ChatHistoryLoadResult } from '../../shared/ipc-channels';
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

export function ChatScreen({ callbacks }: ChatScreenProps): JSX.Element {
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

  // Auto-scroll to the latest content on new messages and on research
  // start/finish (active flips, or a result/error lands) — not on every
  // keystroke or progress-stage tick, so it doesn't fight manual scrolling.
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [state.messages.length, state.research.active, state.research.result, state.research.errorMessage]);

  async function handleSend(): Promise<void> {
    const text = state.inputText.trim();
    if (!canSendMessage(state) || text.length === 0) {
      return;
    }

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
  }

  // "＋ 새 대화" header button (FR-CHM-004). Clears the backend's active
  // session tracker first so the next autosaved turn starts a fresh session
  // instead of appending to the one just left.
  async function handleNewChat(): Promise<void> {
    setHistoryActionError(null);
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
        <ResearchProgress research={state.research} onOpenLink={callbacks.openLink} />
        <DecisionConfirmCard
          card={state.decisionCard}
          onConfirm={handleConfirmDecision}
          onDismiss={() => dispatch({ type: 'DECISION_DISMISS' })}
        />
        <div className="chat-scroll-anchor" ref={scrollAnchorRef} />
      </div>
      <MessageInput
        mode={state.mode}
        text={state.inputText}
        canSend={canSendMessage(state)}
        modeLocked={!canSwitchMode(state)}
        busy={state.sending || state.research.active}
        onChangeMode={(mode) => dispatch({ type: 'SET_MODE', mode })}
        onChangeText={(text) => dispatch({ type: 'SET_INPUT', text })}
        onSend={handleSend}
      />
    </div>
  );
}
