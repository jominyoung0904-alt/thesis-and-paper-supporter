import { describe, expect, it } from 'vitest';

import { resolveScrollIntent, resolveScrollTop } from '../../src/renderer/chat/chatScrollLogic';

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

describe('resolveScrollTop (실사용 피드백 #4 재발 — deterministic scroll execution)', () => {
  it('returns null for "none" so the scroll position is left untouched', () => {
    expect(resolveScrollTop('none', { maxScrollTop: 500, researchTopOffset: 120 })).toBeNull();
  });

  it('pins to the container bottom for "bottom" regardless of researchTopOffset', () => {
    // The handoff→send regression: intent was always "bottom", so this MUST
    // resolve to maxScrollTop (the bottom) and never to the research offset.
    expect(resolveScrollTop('bottom', { maxScrollTop: 800, researchTopOffset: 0 })).toBe(800);
    expect(resolveScrollTop('bottom', { maxScrollTop: 800, researchTopOffset: 300 })).toBe(800);
  });

  it('never returns a negative bottom target when content fits (maxScrollTop <= 0)', () => {
    expect(resolveScrollTop('bottom', { maxScrollTop: -40, researchTopOffset: 0 })).toBe(0);
  });

  it('lands at the research panel top for "research-top" (실사용 피드백 #3 preserved)', () => {
    expect(resolveScrollTop('research-top', { maxScrollTop: 900, researchTopOffset: 150 })).toBe(150);
  });

  it('clamps a "research-top" target that would over-scroll a short report to the bottom', () => {
    // A report that already fits: its computed top offset exceeds the max
    // scroll — clamp so the container never tries to scroll past its end.
    expect(resolveScrollTop('research-top', { maxScrollTop: 100, researchTopOffset: 400 })).toBe(100);
  });

  it('clamps a negative "research-top" offset up to 0', () => {
    expect(resolveScrollTop('research-top', { maxScrollTop: 500, researchTopOffset: -30 })).toBe(0);
  });
});
