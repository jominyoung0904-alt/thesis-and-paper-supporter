import { describe, expect, it } from 'vitest';

import { resolveScrollIntent } from '../../src/renderer/chat/chatScrollLogic';

describe('resolveScrollIntent (실사용 피드백 #3/#4)', () => {
  it('resolves every message-adding action to "bottom", except a finished research result', () => {
    expect(resolveScrollIntent('SEND_CHAT_START')).toBe('bottom');
    expect(resolveScrollIntent('SEND_CHAT_SUCCESS')).toBe('bottom');
    expect(resolveScrollIntent('SEND_CHAT_FAILURE')).toBe('bottom');
    expect(resolveScrollIntent('RESEARCH_START')).toBe('bottom');
    expect(resolveScrollIntent('RESEARCH_FAILURE')).toBe('bottom');
    expect(resolveScrollIntent('ADD_SUMMARY_MESSAGE')).toBe('bottom');
    // A handed-off conversation's opening turns scroll to the bottom too —
    // same as any other fresh transcript (regression coverage for 실사용
    // 피드백 #4).
    expect(resolveScrollIntent('LOAD_HISTORY_SESSION')).toBe('bottom');
  });

  it('resolves a finished research result to "research-top" (실사용 피드백 #3)', () => {
    expect(resolveScrollIntent('RESEARCH_SUCCESS')).toBe('research-top');
  });

  it('resolves progress ticks, decision-card actions, and a fresh empty session to "none" (never auto-scrolls)', () => {
    expect(resolveScrollIntent('RESEARCH_PROGRESS')).toBe('none');
    expect(resolveScrollIntent('DECISION_SAVE_START')).toBe('none');
    expect(resolveScrollIntent('DECISION_SAVE_SUCCESS')).toBe('none');
    expect(resolveScrollIntent('DECISION_SAVE_FAILURE')).toBe('none');
    expect(resolveScrollIntent('DECISION_DISMISS')).toBe('none');
    expect(resolveScrollIntent('SET_MODE')).toBe('none');
    expect(resolveScrollIntent('SET_INPUT')).toBe('none');
    // NEW_CHAT_SESSION resets to an empty transcript — nothing to scroll
    // to, and `chatReducerCore` must keep returning
    // `createInitialChatState()` byte-for-byte (see the pre-existing
    // regression coverage in chatHistoryLogic.test.ts).
    expect(resolveScrollIntent('NEW_CHAT_SESSION')).toBe('none');
  });

  it('falls back to "none" for any unrecognized action type', () => {
    expect(resolveScrollIntent('SOME_FUTURE_ACTION')).toBe('none');
  });
});
