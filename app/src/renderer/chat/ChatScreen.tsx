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
 * pushed off-screen by a long research report. The history panel (when
 * open) sits between the header and `.chat-scroll-area`, outside the
 * scrolling messages area, so it never gets pushed away by a long
 * conversation.
 *
 * Auto-scroll (실사용 피드백 #3/#4): the reducer stamps a `scrollSignal`
 * intent on each action (see `chatScrollLogic.ts`) and a `useLayoutEffect`
 * sets `.chat-scroll-area`'s `scrollTop` directly to the target computed by
 * `resolveScrollTop` — every message-adding action follows the conversation
 * to the bottom, except a finished research result, which lands at the TOP of
 * that block since a long report should be read from its start. Setting
 * `scrollTop` on the container (rather than `scrollIntoView`-ing a zero-height
 * anchor, the approach whose no-op/anchoring races let 실사용 피드백 #4 regress
 * — see `chatScrollLogic.ts`'s top doc comment) makes a handed-off
 * conversation follow its own turns deterministically.
 */
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';

import { canSendMessage, canSwitchMode, chatReducer, createInitialChatState } from './chatUiLogic';
import { resolveScrollTop } from './chatScrollLogic';
import { startHandoffFromLatestResult } from './researchHandoffLogic';
import { SLOW_RESPONSE_DELAY_MS, SLOW_RESPONSE_MESSAGE } from './slowResponseLogic';
import { useChatSessionManagement } from './useChatSessionManagement';
import { useDetailedSearchToggleState } from './useDetailedSearchToggleState';
import { useNaverDocBannerState } from './useNaverDocBannerState';
import type { ChatScreenProps } from './chatTypes';
import { createChatHistoryCallbacks, createResearchHistoryScreenCallbacks } from '../appCallbacks';
import type { ResearchHandoffStartResult } from '../../shared/ipc/researchHandoff';
import { ChatHistoryPanel } from './ChatHistoryPanel';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { NaverDocBanner } from './NaverDocBanner';
import { ResearchProgress } from './ResearchProgress';
import { DecisionConfirmCard } from './DecisionConfirmCard';
import './chat.css';
import './chatBanners.css';

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ChatScreen({
  callbacks,
  pendingHandoff,
  onHandoffConsumed,
  onNavigateToSettings,
}: ChatScreenProps): JSX.Element {
  const [state, dispatch] = useReducer(chatReducer, createInitialChatState());
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const researchPanelRef = useRef<HTMLDivElement>(null);
  const historyCallbacks = useMemo(() => createChatHistoryCallbacks(), []);
  const naverBanner = useNaverDocBannerState(state.mode, callbacks.getAcademicKeyStatus);
  const detailedSearch = useDetailedSearchToggleState(callbacks.getLlmStatus);
  // Chat-history sidebar + cross-tab handoff (T54, T51/T62) — see
  // `useChatSessionManagement.ts`.
  const session = useChatSessionManagement(dispatch, historyCallbacks, pendingHandoff, onHandoffConsumed);
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

  // Auto-scroll, driven by `state.scrollSignal` (fresh object per intended
  // scroll — see `chatScrollLogic.ts`). 실사용 피드백 #4 재발 fix: we set the
  // container's `scrollTop` directly from `resolveScrollTop` instead of
  // calling `Element.scrollIntoView` on the zero-height `.chat-scroll-anchor`.
  // A numeric target can't no-op on a zero-height box and never walks up to
  // scroll unrelated ancestors, so a handed-off conversation (whose message
  // array was wholesale-replaced by `LOAD_HISTORY_SESSION`) reliably follows
  // its own turns to the bottom instead of getting stranded at the top where
  // the DOM rebuild left it. Runs in `useLayoutEffect` (pre-paint) so it wins
  // the race against the browser's native scroll anchoring rather than
  // fighting it a frame later. `research-top` lands at the START of a finished
  // report (실사용 피드백 #3), everything else follows the conversation down.
  useLayoutEffect(() => {
    const area = scrollAreaRef.current;
    if (!area || state.scrollSignal.intent === 'none') {
      return;
    }
    const panel = researchPanelRef.current;
    const researchTopOffset = panel
      ? area.scrollTop + (panel.getBoundingClientRect().top - area.getBoundingClientRect().top)
      : 0;
    const target = resolveScrollTop(state.scrollSignal.intent, {
      maxScrollTop: area.scrollHeight - area.clientHeight,
      researchTopOffset,
    });
    if (target === null) {
      return;
    }
    area.scrollTo({ top: target, behavior: 'smooth' });
  }, [state.scrollSignal]);

  async function handleSend(): Promise<void> {
    const text = state.inputText.trim();
    if (!canSendMessage(state) || text.length === 0) {
      return;
    }
    session.clearHandoffPreview();

    if (state.mode === 'research') {
      dispatch({ type: 'RESEARCH_START', id: makeId(), question: text, now: Date.now() });
      try {
        const result = await callbacks.runResearch(
          text,
          (event) => {
            dispatch({ type: 'RESEARCH_PROGRESS', stage: event.stage, detail: event.detail });
          },
          detailedSearch.checked,
        );
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

  return (
    <div className="chat-screen">
      <div className="chat-header">
        <button
          type="button"
          className="chat-history-toggle-btn"
          aria-expanded={session.historyOpen}
          aria-label="대화 목록 열기/닫기"
          onClick={session.toggleHistoryOpen}
        >
          📑 대화 목록
        </button>
        <button
          type="button"
          className="chat-new-btn"
          aria-label="새 대화 시작"
          onClick={() => void session.handleNewChat()}
        >
          ＋ 새 대화
        </button>
      </div>
      {session.historyActionError && (
        <p className="chat-history-action-error" role="alert">
          {session.historyActionError}
        </p>
      )}
      {session.handoffPreview && (
        <p className="chat-handoff-preview" role="status">
          {session.handoffPreview}
        </p>
      )}
      <ChatHistoryPanel
        open={session.historyOpen}
        callbacks={historyCallbacks}
        activeSessionId={session.activeSessionId}
        onClose={session.closeHistory}
        onSessionLoaded={session.handleSessionLoaded}
        onActiveSessionRemoved={session.handleActiveSessionRemoved}
      />
      <div className="chat-scroll-area" ref={scrollAreaRef}>
        <MessageList messages={state.messages} />
        <div ref={researchPanelRef}>
          <ResearchProgress
            research={state.research}
            onOpenLink={callbacks.openLink}
            onStartHandoff={callbacks.startResearchHandoff ? handleStartHandoffFromLatestResult : undefined}
            onHandoffComplete={session.handleHandoffComplete}
          />
        </div>
        <DecisionConfirmCard
          card={state.decisionCard}
          onConfirm={handleConfirmDecision}
          onDismiss={() => dispatch({ type: 'DECISION_DISMISS' })}
        />
      </div>
      {naverBanner.visible && (
        <NaverDocBanner onNavigateToSettings={onNavigateToSettings} onDismiss={naverBanner.dismiss} />
      )}
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
        detailedSearchAvailable={detailedSearch.available}
        detailedSearchChecked={detailedSearch.checked}
        onChangeMode={(mode) => dispatch({ type: 'SET_MODE', mode })}
        onChangeText={(text) => dispatch({ type: 'SET_INPUT', text })}
        onSend={handleSend}
        onToggleDetailedSearch={detailedSearch.setChecked}
      />
    </div>
  );
}
