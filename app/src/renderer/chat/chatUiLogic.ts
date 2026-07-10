/**
 * Pure state machine for the single-chat screen (Task T17 / SPEC-TSA-001).
 *
 * Deliberately framework-free (no React), following the same pattern as
 * `settings/wizard/wizardLogic.ts`, so it is unit-testable without a DOM
 * (see `vitest.config.ts`: `environment: 'node'`). `ChatScreen.tsx` wires
 * this reducer into `useReducer` and performs the actual async calls
 * (`callbacks.sendChat` / `runResearch` / `saveDecision`), dispatching the
 * results back in as plain actions.
 *
 * `scrollSignal` (실사용 피드백 #3/#4) drives `ChatScreen.tsx`'s auto-scroll
 * effect — see `chatScrollLogic.ts` for the full rationale and the
 * `resolveScrollIntent` helper this reducer calls on every action.
 */

import type { ChatMessage, ChatMode, ResearchView, SuggestedDecision } from './chatTypes';
import { resolveScrollIntent, type ScrollSignal } from './chatScrollLogic';

export interface ResearchRunState {
  active: boolean;
  stage: string | null;
  detail: string | null;
  result: ResearchView | null;
  errorMessage: string | null;
}

export type DecisionCardStatus = 'hidden' | 'pending' | 'saving' | 'saved' | 'dismissed';

export interface DecisionCardState {
  status: DecisionCardStatus;
  decision: SuggestedDecision | null;
  errorMessage: string | null;
}

export interface ChatState {
  mode: ChatMode;
  messages: ChatMessage[];
  inputText: string;
  sending: boolean;
  decisionCard: DecisionCardState;
  research: ResearchRunState;
  /** Drives `ChatScreen.tsx`'s auto-scroll effect. See this module's doc comment. */
  scrollSignal: ScrollSignal;
}

export function createInitialChatState(): ChatState {
  return {
    mode: 'discuss',
    messages: [],
    inputText: '',
    sending: false,
    decisionCard: { status: 'hidden', decision: null, errorMessage: null },
    research: { active: false, stage: null, detail: null, result: null, errorMessage: null },
    scrollSignal: { intent: 'none', seq: 0 },
  };
}

/** Whether a chat turn is busy right now — blocks sending, mode switching, and re-triggering research. */
function isBusy(state: Pick<ChatState, 'sending' | 'research'>): boolean {
  return state.sending || state.research.active;
}

/** Whether the [보내기] button should be enabled. Blocks empty/whitespace-only input (FR-CHT-001). */
export function canSendMessage(state: Pick<ChatState, 'inputText' | 'sending' | 'research'>): boolean {
  return !isBusy(state) && state.inputText.trim().length > 0;
}

/** Whether the mode toggle is interactive right now. Locked mid-turn so a run can't be switched out from under itself. */
export function canSwitchMode(state: Pick<ChatState, 'sending' | 'research'>): boolean {
  return !isBusy(state);
}

export type ChatAction =
  | { type: 'SET_MODE'; mode: ChatMode }
  | { type: 'SET_INPUT'; text: string }
  | { type: 'SEND_CHAT_START'; id: string; text: string; now: number }
  | { type: 'SEND_CHAT_SUCCESS'; id: string; now: number; reply: string; suggestedDecision?: SuggestedDecision }
  | { type: 'SEND_CHAT_FAILURE'; id: string; now: number; message: string }
  | { type: 'RESEARCH_START'; id: string; question: string; now: number }
  | { type: 'RESEARCH_PROGRESS'; stage: string; detail?: string }
  | { type: 'RESEARCH_SUCCESS'; result: ResearchView }
  | { type: 'RESEARCH_FAILURE'; message: string }
  | { type: 'DECISION_SAVE_START' }
  | { type: 'DECISION_SAVE_SUCCESS' }
  | { type: 'DECISION_SAVE_FAILURE'; message: string }
  | { type: 'DECISION_DISMISS' }
  | { type: 'ADD_SUMMARY_MESSAGE'; id: string; text: string; now: number }
  | { type: 'LOAD_HISTORY_SESSION'; messages: ChatMessage[] }
  | { type: 'NEW_CHAT_SESSION' };

function userMessage(id: string, text: string, now: number): ChatMessage {
  return { id, role: 'user', text, createdAt: now };
}

function assistantMessage(id: string, text: string, now: number): ChatMessage {
  return { id, role: 'assistant', text, createdAt: now };
}

/**
 * Public reducer: runs the actual state transition (`chatReducerCore`) and
 * then stamps the resulting state with the next `scrollSignal`, if any. A
 * no-op transition (e.g. a blocked `SEND_CHAT_START` while already busy,
 * which returns the exact same `state` reference) never bumps `seq` — only
 * a real state change can trigger a scroll.
 */
export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  const nextState = chatReducerCore(state, action);
  if (nextState === state) {
    return nextState;
  }
  const intent = resolveScrollIntent(action.type);
  if (intent === 'none') {
    return nextState;
  }
  return { ...nextState, scrollSignal: { intent, seq: state.scrollSignal.seq + 1 } };
}

function chatReducerCore(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_MODE': {
      if (!canSwitchMode(state)) {
        return state;
      }
      return { ...state, mode: action.mode };
    }

    case 'SET_INPUT':
      return { ...state, inputText: action.text };

    case 'SEND_CHAT_START': {
      if (isBusy(state) || action.text.trim().length === 0) {
        return state;
      }
      return {
        ...state,
        messages: [...state.messages, userMessage(action.id, action.text, action.now)],
        inputText: '',
        sending: true,
      };
    }

    case 'SEND_CHAT_SUCCESS': {
      const nextDecisionCard: DecisionCardState = action.suggestedDecision
        ? { status: 'pending', decision: action.suggestedDecision, errorMessage: null }
        : state.decisionCard;
      return {
        ...state,
        sending: false,
        messages: [...state.messages, assistantMessage(action.id, action.reply, action.now)],
        decisionCard: nextDecisionCard,
      };
    }

    case 'SEND_CHAT_FAILURE': {
      return {
        ...state,
        sending: false,
        messages: [...state.messages, assistantMessage(action.id, action.message, action.now)],
      };
    }

    case 'RESEARCH_START': {
      if (isBusy(state) || action.question.trim().length === 0) {
        return state;
      }
      return {
        ...state,
        messages: [...state.messages, userMessage(action.id, action.question, action.now)],
        inputText: '',
        research: { active: true, stage: null, detail: null, result: null, errorMessage: null },
      };
    }

    case 'RESEARCH_PROGRESS': {
      if (!state.research.active) {
        return state;
      }
      return {
        ...state,
        research: { ...state.research, stage: action.stage, detail: action.detail ?? null },
      };
    }

    case 'RESEARCH_SUCCESS': {
      return {
        ...state,
        research: { ...state.research, active: false, result: action.result, errorMessage: null },
      };
    }

    case 'RESEARCH_FAILURE': {
      return {
        ...state,
        research: { ...state.research, active: false, errorMessage: action.message },
      };
    }

    case 'DECISION_SAVE_START': {
      if (state.decisionCard.status !== 'pending') {
        return state;
      }
      return { ...state, decisionCard: { ...state.decisionCard, status: 'saving', errorMessage: null } };
    }

    case 'DECISION_SAVE_SUCCESS': {
      return { ...state, decisionCard: { ...state.decisionCard, status: 'saved', errorMessage: null } };
    }

    case 'DECISION_SAVE_FAILURE': {
      // Revert to `pending` (not `saving`) so the user can retry the save.
      return {
        ...state,
        decisionCard: { ...state.decisionCard, status: 'pending', errorMessage: action.message },
      };
    }

    case 'DECISION_DISMISS': {
      if (state.decisionCard.status !== 'pending') {
        return state;
      }
      return { ...state, decisionCard: { ...state.decisionCard, status: 'dismissed', errorMessage: null } };
    }

    case 'ADD_SUMMARY_MESSAGE': {
      return {
        ...state,
        messages: [...state.messages, { id: action.id, role: 'summary', text: action.text, createdAt: action.now }],
      };
    }

    // Replaces the transcript with a loaded saved session (FR-CHM-003). The
    // backend's ConversationManager is already restored by the time this
    // fires — sending the next turn continues the loaded conversation
    // seamlessly. Any in-flight research/decision-card UI is cleared since
    // it belonged to the previous (now-replaced) transcript.
    case 'LOAD_HISTORY_SESSION': {
      return {
        ...state,
        mode: 'discuss',
        messages: action.messages,
        inputText: '',
        sending: false,
        decisionCard: { status: 'hidden', decision: null, errorMessage: null },
        research: { active: false, stage: null, detail: null, result: null, errorMessage: null },
      };
    }

    // Clears the screen for a brand-new conversation (FR-CHM-004) — mirrors
    // `createInitialChatState()` exactly.
    case 'NEW_CHAT_SESSION': {
      return createInitialChatState();
    }

    default:
      return state;
  }
}
