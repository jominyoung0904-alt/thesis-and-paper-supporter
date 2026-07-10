import { describe, expect, it } from 'vitest';

import {
  canSendMessage,
  canSwitchMode,
  chatReducer,
  createInitialChatState,
  type ChatState,
} from '../../src/renderer/chat/chatUiLogic';
import { parseInlineRuns, parseMarkdownLite } from '../../src/renderer/chat/markdownLite';
import { researchStageIndex, researchStageLabel, RESEARCH_STAGE_COUNT } from '../../src/renderer/chat/progressStages';

describe('createInitialChatState', () => {
  it('starts in discuss mode with no messages and a hidden decision card', () => {
    const state = createInitialChatState();
    expect(state.mode).toBe('discuss');
    expect(state.messages).toEqual([]);
    expect(state.decisionCard.status).toBe('hidden');
    expect(state.research.active).toBe(false);
  });
});

describe('mode toggle', () => {
  it('switches from discuss to research on SET_MODE', () => {
    const state = createInitialChatState();
    const next = chatReducer(state, { type: 'SET_MODE', mode: 'research' });
    expect(next.mode).toBe('research');
  });

  it('ignores SET_MODE while a chat reply is in flight', () => {
    const state: ChatState = { ...createInitialChatState(), sending: true };
    const next = chatReducer(state, { type: 'SET_MODE', mode: 'research' });
    expect(next.mode).toBe('discuss');
  });

  it('ignores SET_MODE while research is active', () => {
    const state: ChatState = {
      ...createInitialChatState(),
      mode: 'research',
      research: { active: true, stage: 'searching', detail: null, result: null, errorMessage: null },
    };
    const next = chatReducer(state, { type: 'SET_MODE', mode: 'discuss' });
    expect(next.mode).toBe('research');
  });

  it('canSwitchMode is false exactly when busy', () => {
    expect(canSwitchMode(createInitialChatState())).toBe(true);
    expect(canSwitchMode({ sending: true, research: createInitialChatState().research })).toBe(false);
    expect(
      canSwitchMode({
        sending: false,
        research: { active: true, stage: null, detail: null, result: null, errorMessage: null },
      }),
    ).toBe(false);
  });
});

describe('canSendMessage: empty input blocking', () => {
  it('blocks sending an empty input', () => {
    const state = { ...createInitialChatState(), inputText: '' };
    expect(canSendMessage(state)).toBe(false);
  });

  it('blocks sending a whitespace-only input', () => {
    const state = { ...createInitialChatState(), inputText: '   \n  ' };
    expect(canSendMessage(state)).toBe(false);
  });

  it('allows sending once there is non-whitespace text', () => {
    const state = { ...createInitialChatState(), inputText: '연구 질문입니다' };
    expect(canSendMessage(state)).toBe(true);
  });

  it('blocks sending while a request is already in flight', () => {
    const state = { ...createInitialChatState(), inputText: '질문', sending: true };
    expect(canSendMessage(state)).toBe(false);
  });

  it('SEND_CHAT_START is a no-op when sending is blocked (e.g. already sending)', () => {
    const state: ChatState = { ...createInitialChatState(), inputText: 'x', sending: true };
    const next = chatReducer(state, { type: 'SEND_CHAT_START', id: '1', text: 'x', now: 1 });
    expect(next).toBe(state);
  });
});

describe('chat turn lifecycle', () => {
  it('SEND_CHAT_START appends a user bubble, clears input, and sets sending', () => {
    const state = { ...createInitialChatState(), inputText: '질문입니다' };
    const next = chatReducer(state, { type: 'SEND_CHAT_START', id: 'u1', text: '질문입니다', now: 100 });
    expect(next.messages).toEqual([{ id: 'u1', role: 'user', text: '질문입니다', createdAt: 100 }]);
    expect(next.inputText).toBe('');
    expect(next.sending).toBe(true);
  });

  it('SEND_CHAT_SUCCESS appends the assistant bubble and clears sending', () => {
    let state = chatReducer(
      { ...createInitialChatState(), inputText: 'q' },
      { type: 'SEND_CHAT_START', id: 'u1', text: 'q', now: 1 },
    );
    state = chatReducer(state, { type: 'SEND_CHAT_SUCCESS', id: 'a1', now: 2, reply: '답변입니다' });
    expect(state.sending).toBe(false);
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1]).toEqual({ id: 'a1', role: 'assistant', text: '답변입니다', createdAt: 2 });
    expect(state.decisionCard.status).toBe('hidden');
  });

  it('SEND_CHAT_SUCCESS with a suggestedDecision opens the decision card as pending', () => {
    const decision = { what: '설문 대신 인터뷰로 진행', why: '표본이 작아 질적 접근이 더 적합함' };
    const state = chatReducer(createInitialChatState(), {
      type: 'SEND_CHAT_SUCCESS',
      id: 'a1',
      now: 2,
      reply: '답변입니다',
      suggestedDecision: decision,
    });
    expect(state.decisionCard).toEqual({ status: 'pending', decision, errorMessage: null });
  });
});

describe('research run lifecycle', () => {
  it('RESEARCH_START adds the question bubble and marks research active', () => {
    const state = { ...createInitialChatState(), mode: 'research' as const, inputText: '몰입교육 효과' };
    const next = chatReducer(state, { type: 'RESEARCH_START', id: 'r1', question: '몰입교육 효과', now: 5 });
    expect(next.research.active).toBe(true);
    expect(next.inputText).toBe('');
    expect(next.messages[0]).toEqual({ id: 'r1', role: 'user', text: '몰입교육 효과', createdAt: 5 });
  });

  it('RESEARCH_PROGRESS updates the current stage only while active', () => {
    let state = chatReducer(
      { ...createInitialChatState(), mode: 'research' },
      { type: 'RESEARCH_START', id: 'r1', question: 'q', now: 1 },
    );
    state = chatReducer(state, { type: 'RESEARCH_PROGRESS', stage: 'searching', detail: '2/3' });
    expect(state.research.stage).toBe('searching');
    expect(state.research.detail).toBe('2/3');

    const idle = createInitialChatState();
    const untouched = chatReducer(idle, { type: 'RESEARCH_PROGRESS', stage: 'searching' });
    expect(untouched).toBe(idle);
  });

  it('RESEARCH_SUCCESS stores the result and clears active', () => {
    const result = { report: '요약', papers: [], citedPapers: [], relatedPapers: [], failedSources: [] };
    let state = chatReducer(
      { ...createInitialChatState(), mode: 'research' },
      { type: 'RESEARCH_START', id: 'r1', question: 'q', now: 1 },
    );
    state = chatReducer(state, { type: 'RESEARCH_SUCCESS', result });
    expect(state.research.active).toBe(false);
    expect(state.research.result).toEqual(result);
  });

  it('RESEARCH_FAILURE clears active and records an error message', () => {
    let state = chatReducer(
      { ...createInitialChatState(), mode: 'research' },
      { type: 'RESEARCH_START', id: 'r1', question: 'q', now: 1 },
    );
    state = chatReducer(state, { type: 'RESEARCH_FAILURE', message: '네트워크 오류' });
    expect(state.research.active).toBe(false);
    expect(state.research.errorMessage).toBe('네트워크 오류');
  });
});

describe('decision card state transitions', () => {
  const pendingState: ChatState = {
    ...createInitialChatState(),
    decisionCard: {
      status: 'pending',
      decision: { what: 'A', why: 'B' },
      errorMessage: null,
    },
  };

  it('DECISION_SAVE_START moves pending -> saving', () => {
    const next = chatReducer(pendingState, { type: 'DECISION_SAVE_START' });
    expect(next.decisionCard.status).toBe('saving');
  });

  it('DECISION_SAVE_START is a no-op when not pending', () => {
    const hidden = createInitialChatState();
    expect(chatReducer(hidden, { type: 'DECISION_SAVE_START' })).toBe(hidden);
  });

  it('DECISION_SAVE_SUCCESS moves saving -> saved', () => {
    const saving = chatReducer(pendingState, { type: 'DECISION_SAVE_START' });
    const saved = chatReducer(saving, { type: 'DECISION_SAVE_SUCCESS' });
    expect(saved.decisionCard.status).toBe('saved');
  });

  it('DECISION_SAVE_FAILURE reverts saving -> pending and records the error message', () => {
    const saving = chatReducer(pendingState, { type: 'DECISION_SAVE_START' });
    const failed = chatReducer(saving, { type: 'DECISION_SAVE_FAILURE', message: '기록 실패' });
    expect(failed.decisionCard.status).toBe('pending');
    expect(failed.decisionCard.errorMessage).toBe('기록 실패');
  });

  it('DECISION_DISMISS moves pending -> dismissed, hiding the card', () => {
    const dismissed = chatReducer(pendingState, { type: 'DECISION_DISMISS' });
    expect(dismissed.decisionCard.status).toBe('dismissed');
  });
});

describe('researchStageLabel / researchStageIndex', () => {
  it('maps every known stage to a distinct, non-empty Korean label', () => {
    const stages = ['query-gen', 'searching', 'screening', 'report'];
    const labels = stages.map(researchStageLabel);
    expect(new Set(labels).size).toBe(stages.length);
    for (const label of labels) {
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('mentions the 2~3 minute wait for the searching stage', () => {
    expect(researchStageLabel('searching')).toContain('2~3분');
  });

  it('falls back to a generic label for an unknown stage', () => {
    expect(researchStageLabel('unknown-stage')).toBe('처리하고 있어요...');
  });

  it('reports stage index in canonical order and total count', () => {
    expect(researchStageIndex('query-gen')).toBe(0);
    expect(researchStageIndex('report')).toBe(RESEARCH_STAGE_COUNT - 1);
    expect(researchStageIndex('unknown-stage')).toBe(0);
  });
});

describe('parseInlineRuns (bold)', () => {
  it('splits plain text into a single non-bold run', () => {
    expect(parseInlineRuns('그냥 텍스트')).toEqual([{ text: '그냥 텍스트', bold: false }]);
  });

  it('extracts a bold run from **markers**', () => {
    expect(parseInlineRuns('이것은 **중요**합니다')).toEqual([
      { text: '이것은 ', bold: false },
      { text: '중요', bold: true },
      { text: '합니다', bold: false },
    ]);
  });

  it('handles multiple bold runs in one line', () => {
    const runs = parseInlineRuns('**첫째** 그리고 **둘째**');
    expect(runs).toEqual([
      { text: '첫째', bold: true },
      { text: ' 그리고 ', bold: false },
      { text: '둘째', bold: true },
    ]);
  });
});

describe('parseMarkdownLite', () => {
  it('parses a general paragraph with no markdown syntax', () => {
    const blocks = parseMarkdownLite('그냥 평범한 문장입니다.');
    expect(blocks).toEqual([{ type: 'paragraph', runs: [{ text: '그냥 평범한 문장입니다.', bold: false }] }]);
  });

  it('parses a heading line', () => {
    const blocks = parseMarkdownLite('## 연구 배경');
    expect(blocks).toEqual([{ type: 'heading', level: 2, runs: [{ text: '연구 배경', bold: false }] }]);
  });

  it('parses consecutive list lines into one list block', () => {
    const blocks = parseMarkdownLite('- 첫 번째 항목\n- 두 번째 항목');
    expect(blocks).toEqual([
      {
        type: 'list',
        items: [
          [{ text: '첫 번째 항목', bold: false }],
          [{ text: '두 번째 항목', bold: false }],
        ],
      },
    ]);
  });

  it('parses bold text within a paragraph', () => {
    const blocks = parseMarkdownLite('이 결과는 **매우 중요**해요.');
    expect(blocks).toEqual([
      {
        type: 'paragraph',
        runs: [
          { text: '이 결과는 ', bold: false },
          { text: '매우 중요', bold: true },
          { text: '해요.', bold: false },
        ],
      },
    ]);
  });

  it('parses a mixed document with heading, paragraph, and list blocks in order', () => {
    const text = '# 제목\n본문 문장입니다.\n\n- 항목 하나\n- 항목 둘';
    const blocks = parseMarkdownLite(text);
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list']);
  });
});
