/**
 * Single-chat interface shell (Task T17 / SPEC-TSA-001, FR-CHT-001/002).
 *
 * The whole product is reachable from one chat: this screen switches
 * between "아이디어 회의" (free chat) and "논문 찾기" (deep research) by mode
 * toggle, never by navigating to a different screen. Like `Wizard.tsx`, it
 * performs no IPC of its own — every side effect goes through
 * `ChatScreenCallbacks`, supplied by the central app shell.
 *
 * Layout (Task T35 fix#1): the screen is viewport-fixed — only
 * `.chat-scroll-area` (messages + research panel + decision card) scrolls;
 * `MessageInput` (mode toggle + textarea) is a non-scrolling flex sibling
 * that always stays visible at the bottom, KakaoTalk-style, instead of being
 * pushed off-screen by a long research report. A bottom anchor element is
 * scrolled into view whenever a new message arrives or a research run
 * finishes, so the latest content is always in view without the user
 * having to scroll manually.
 */
import { useEffect, useReducer, useRef } from 'react';

import { canSendMessage, canSwitchMode, chatReducer, createInitialChatState } from './chatUiLogic';
import type { ChatScreenProps } from './chatTypes';
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

  return (
    <div className="chat-screen">
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
