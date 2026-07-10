import { describe, expect, it } from 'vitest';

import type { IpcChatMessage, IpcChatSessionSummary } from '../../src/shared/ipc/chatHistory';
import {
  buildRemoveSessionConfirmMessage,
  buildSessionSubtitle,
  formatSessionUpdatedAt,
  mapIpcMessagesToChatMessages,
  resolveLoadFailureMessage,
  resolveRemoveFailureMessage,
  sortSessionsByRecency,
} from '../../src/renderer/chat/chatHistoryLogic';
import { chatReducer, createInitialChatState } from '../../src/renderer/chat/chatUiLogic';

function makeSummary(overrides: Partial<IpcChatSessionSummary> = {}): IpcChatSessionSummary {
  return { id: 's1', title: '연구 아이디어 논의', updatedAt: '2026-07-10T09:00:00.000Z', messageCount: 4, ...overrides };
}

describe('mapIpcMessagesToChatMessages', () => {
  it('maps role/content/at into id/role/text/createdAt, deriving a stable id from session id + index', () => {
    const messages: IpcChatMessage[] = [
      { role: 'user', content: '안녕하세요', at: '2026-07-10T09:00:00.000Z' },
      { role: 'assistant', content: '안녕하세요! 무엇을 도와드릴까요?', at: '2026-07-10T09:00:05.000Z' },
    ];
    const result = mapIpcMessagesToChatMessages('sess-1', messages);
    expect(result).toEqual([
      { id: 'sess-1-0', role: 'user', text: '안녕하세요', createdAt: Date.parse('2026-07-10T09:00:00.000Z') },
      {
        id: 'sess-1-1',
        role: 'assistant',
        text: '안녕하세요! 무엇을 도와드릴까요?',
        createdAt: Date.parse('2026-07-10T09:00:05.000Z'),
      },
    ]);
  });

  it('falls back to 0 for an unparseable timestamp instead of NaN', () => {
    const result = mapIpcMessagesToChatMessages('sess-1', [{ role: 'user', content: 'hi', at: 'not-a-date' }]);
    expect(result[0]?.createdAt).toBe(0);
  });

  it('returns an empty array for an empty transcript', () => {
    expect(mapIpcMessagesToChatMessages('sess-1', [])).toEqual([]);
  });

  it('preserves the summary role', () => {
    const result = mapIpcMessagesToChatMessages('sess-1', [
      { role: 'summary', content: '이전 대화 요약', at: '2026-07-10T09:00:00.000Z' },
    ]);
    expect(result[0]?.role).toBe('summary');
  });
});

describe('formatSessionUpdatedAt', () => {
  it('formats a valid ISO timestamp as Korean locale date+time', () => {
    const formatted = formatSessionUpdatedAt('2026-07-10T09:00:00.000Z');
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).not.toBe('2026-07-10T09:00:00.000Z');
  });

  it('falls back to the raw string for an unparseable timestamp', () => {
    expect(formatSessionUpdatedAt('not-a-date')).toBe('not-a-date');
  });
});

describe('buildSessionSubtitle', () => {
  it('combines the formatted date and message count', () => {
    const subtitle = buildSessionSubtitle(makeSummary({ messageCount: 6 }));
    expect(subtitle).toContain('메시지 6개');
    expect(subtitle).toContain('·');
  });
});

describe('sortSessionsByRecency', () => {
  it('sorts sessions by updatedAt, most recent first', () => {
    const older = makeSummary({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' });
    const newer = makeSummary({ id: 'b', updatedAt: '2026-07-10T00:00:00.000Z' });
    expect(sortSessionsByRecency([older, newer]).map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the input array', () => {
    const older = makeSummary({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' });
    const newer = makeSummary({ id: 'b', updatedAt: '2026-07-10T00:00:00.000Z' });
    const input = [older, newer];
    sortSessionsByRecency(input);
    expect(input).toEqual([older, newer]);
  });
});

describe('buildRemoveSessionConfirmMessage', () => {
  it('includes the session title and an irreversibility warning', () => {
    const message = buildRemoveSessionConfirmMessage('연구 아이디어 논의');
    expect(message).toContain('연구 아이디어 논의');
    expect(message).toContain('되돌릴 수 없어요');
  });
});

describe('resolveLoadFailureMessage', () => {
  it('translates not_found into Korean copy', () => {
    expect(resolveLoadFailureMessage('not_found')).toContain('찾을 수 없어요');
  });

  it('falls back to a generic message for an unrecognized reason', () => {
    expect(resolveLoadFailureMessage('something_unexpected' as never)).toBe('대화를 불러오지 못했어요. 다시 시도해 주세요.');
  });
});

describe('resolveRemoveFailureMessage', () => {
  it('translates not_found into Korean copy', () => {
    expect(resolveRemoveFailureMessage('not_found')).toContain('삭제된 대화');
  });

  it('falls back to a generic message for an unrecognized reason', () => {
    expect(resolveRemoveFailureMessage('something_unexpected' as never)).toBe('삭제하지 못했어요. 다시 시도해 주세요.');
  });
});

describe('chatReducer: LOAD_HISTORY_SESSION', () => {
  it('replaces the transcript, resets busy/decision/research state, and forces discuss mode', () => {
    const busyResearchState = {
      ...createInitialChatState(),
      mode: 'research' as const,
      sending: true,
      decisionCard: { status: 'pending' as const, decision: { what: 'X', why: 'Y' }, errorMessage: null },
      research: { active: true, stage: 'searching', detail: null, result: null, errorMessage: null },
    };
    const loaded = [{ id: 's-0', role: 'user' as const, text: '안녕하세요', createdAt: 1 }];
    const next = chatReducer(busyResearchState, { type: 'LOAD_HISTORY_SESSION', messages: loaded });

    expect(next.messages).toEqual(loaded);
    expect(next.mode).toBe('discuss');
    expect(next.sending).toBe(false);
    expect(next.decisionCard.status).toBe('hidden');
    expect(next.research.active).toBe(false);
    expect(next.inputText).toBe('');
  });
});

describe('chatReducer: NEW_CHAT_SESSION', () => {
  it('resets to the initial chat state, discarding messages and in-flight state', () => {
    const dirtyState = {
      ...createInitialChatState(),
      messages: [{ id: 'm1', role: 'user' as const, text: 'hi', createdAt: 1 }],
      inputText: 'draft',
      sending: true,
    };
    const next = chatReducer(dirtyState, { type: 'NEW_CHAT_SESSION' });
    expect(next).toEqual(createInitialChatState());
  });
});
