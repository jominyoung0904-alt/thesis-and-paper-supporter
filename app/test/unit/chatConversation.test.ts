import { describe, expect, it } from 'vitest';

import { ConversationManager } from '../../src/core/chat/conversation';
import type { ChatMessage } from '../../src/core/chat/types';
import type { LlmAdapter, LlmRequest, LlmUsage } from '../../src/core/llm';
import type { SerializedMemory } from '../../src/core/memory/serializer';

const MEMORY: SerializedMemory = {
  text: '## 프로젝트 개요\n제목: 메타인지 학습 전략 연구',
  isEmpty: false,
  approxTokens: 20,
};

function memoryOf(text: string): SerializedMemory {
  return { text, isEmpty: false, approxTokens: Math.ceil(text.length / 2.5) };
}

/** Records every request and replies with a scripted sequence (last entry repeats past the end). */
function makeLlm(replies: string[] = ['알겠습니다.']): { adapter: LlmAdapter; calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  let i = 0;
  const adapter: LlmAdapter = {
    provider: 'gemini',
    async chat(req: LlmRequest) {
      calls.push(req);
      const text = replies[Math.min(i, replies.length - 1)] ?? '';
      i += 1;
      const usage: LlmUsage = { inputTokens: 10 + i, outputTokens: 5 + i };
      return { text, usage, model: req.model };
    },
  };
  return { adapter, calls };
}

/**
 * Fails exactly the calls whose 1-based index is in `failAt`, and otherwise
 * replies with the next entry from `replies` (in call order).
 */
function makeFailOnCallLlm(failAt: number[], replies: string[]): { adapter: LlmAdapter; calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  let callCount = 0;
  let replyIndex = 0;
  const adapter: LlmAdapter = {
    provider: 'claude',
    async chat(req: LlmRequest) {
      calls.push(req);
      callCount += 1;
      if (failAt.includes(callCount)) throw new Error('network down');
      const text = replies[Math.min(replyIndex, replies.length - 1)] ?? '';
      replyIndex += 1;
      return { text, usage: { inputTokens: 1, outputTokens: 1 }, model: req.model };
    },
  };
  return { adapter, calls };
}

describe('ConversationManager.send', () => {
  it('completes a normal round trip: injects memory into the system prompt and returns reply + usage', async () => {
    const { adapter, calls } = makeLlm(['안녕하세요, 무엇을 도와드릴까요?']);
    const cm = new ConversationManager({ llm: adapter, model: 'gpt-x', getMemory: () => MEMORY });

    const result = await cm.send('연구 주제를 좁히고 싶어요.');

    expect(result.reply).toBe('안녕하세요, 무엇을 도와드릴까요?');
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 6 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.model).toBe('gpt-x');
    expect(calls[0]?.system).toContain(MEMORY.text);
    expect(calls[0]?.messages).toEqual([{ role: 'user', content: '연구 주제를 좁히고 싶어요.' }]);
  });

  it('includes the decision-tag protocol instruction in every system prompt', async () => {
    const { adapter, calls } = makeLlm();
    const cm = new ConversationManager({ llm: adapter, model: 'm', getMemory: () => MEMORY });

    await cm.send('테스트 메시지');

    expect(calls[0]?.system).toContain('<decision>');
    expect(calls[0]?.system).toContain('what');
  });

  it('parses a well-formed trailing decision tag and strips it from the reply body', async () => {
    const reply = '연구 방법론으로 질적 사례 연구를 채택하기로 했습니다.\n<decision>{"what":"질적 사례 연구 채택","why":"소규모 표본에 적합"}</decision>';
    const { adapter } = makeLlm([reply]);
    const cm = new ConversationManager({ llm: adapter, model: 'm', getMemory: () => MEMORY });

    const result = await cm.send('방법론을 질적 사례 연구로 정했어요.');

    expect(result.reply).toBe('연구 방법론으로 질적 사례 연구를 채택하기로 했습니다.');
    expect(result.reply).not.toContain('<decision>');
    expect(result.suggestedDecision).toEqual({ what: '질적 사례 연구 채택', why: '소규모 표본에 적합' });
  });

  it('silently ignores a malformed decision tag and leaves the full text untouched', async () => {
    const reply = '결정을 내렸습니다.\n<decision>{what: 안따옴표}</decision>';
    const { adapter } = makeLlm([reply]);
    const cm = new ConversationManager({ llm: adapter, model: 'm', getMemory: () => MEMORY });

    const result = await cm.send('메시지');

    expect(result.suggestedDecision).toBeUndefined();
    expect(result.reply).toBe(reply.trim());
  });

  it('does not set suggestedDecision when the reply has no decision tag at all', async () => {
    const { adapter } = makeLlm(['그냥 일반적인 답변입니다.']);
    const cm = new ConversationManager({ llm: adapter, model: 'm', getMemory: () => MEMORY });

    const result = await cm.send('메시지');

    expect(result.suggestedDecision).toBeUndefined();
    expect(result.reply).toBe('그냥 일반적인 답변입니다.');
  });

  it('sends the full accumulated history as alternating user/assistant turns on later messages', async () => {
    const { adapter, calls } = makeLlm(['첫 응답입니다.', '두번째 응답입니다.']);
    const cm = new ConversationManager({ llm: adapter, model: 'm', getMemory: () => MEMORY });

    await cm.send('첫 메시지');
    await cm.send('두번째 메시지');

    expect(calls).toHaveLength(2);
    expect(calls[1]?.messages).toEqual([
      { role: 'user', content: '첫 메시지' },
      { role: 'assistant', content: '첫 응답입니다.' },
      { role: 'user', content: '두번째 메시지' },
    ]);
  });

  it('propagates the LLM usage numbers unchanged on every turn', async () => {
    const { adapter } = makeLlm(['a', 'b']);
    const cm = new ConversationManager({ llm: adapter, model: 'm', getMemory: () => MEMORY });

    const first = await cm.send('첫 메시지');
    const second = await cm.send('두번째 메시지');

    expect(first.usage).toEqual({ inputTokens: 11, outputTokens: 6 });
    expect(second.usage).toEqual({ inputTokens: 12, outputTokens: 7 });
  });

  it('skips compaction while the history stays under the token threshold', async () => {
    const { adapter } = makeLlm(['응답1', '응답2']);
    const cm = new ConversationManager({
      llm: adapter,
      model: 'm',
      getMemory: () => MEMORY,
      compactionThresholdTokens: 20_000,
    });

    await cm.send('짧은 메시지');
    await cm.send('또 짧은 메시지');

    const history = cm.getHistory();
    expect(history.some((m) => m.role === 'summary')).toBe(false);
    expect(history).toHaveLength(4);
  });

  it('compacts the oldest half of the history into a summary once the token threshold is exceeded', async () => {
    const { adapter, calls } = makeLlm(['첫 답변입니다.', '요약: 핵심 논점과 미해결 질문을 보존했습니다.', '두번째 답변입니다.']);
    const cm = new ConversationManager({
      llm: adapter,
      model: 'm',
      getMemory: () => MEMORY,
      compactionThresholdTokens: 1,
    });

    await cm.send('첫 메시지');
    await cm.send('두번째 메시지');

    const history = cm.getHistory();
    expect(history[0]?.role).toBe('summary');
    expect(history[0]?.content).toBe('요약: 핵심 논점과 미해결 질문을 보존했습니다.');
    // 3 LLM calls total: turn 1 reply, compaction summary call, turn 2 reply.
    expect(calls).toHaveLength(3);
  });

  it('keeps the original history intact when the compaction LLM call fails', async () => {
    // Call #1 = turn-1 reply (succeeds), call #2 = the compaction attempt on
    // turn 2 (fails), call #3 = turn-2's own reply (succeeds) after
    // compaction gives up and falls back to the original history.
    const { adapter } = makeFailOnCallLlm([2], ['첫 답변입니다.', '두번째 답변입니다.']);
    const cm = new ConversationManager({
      llm: adapter,
      model: 'm',
      getMemory: () => MEMORY,
      compactionThresholdTokens: 1,
    });

    await cm.send('첫 메시지');
    const result = await cm.send('두번째 메시지');

    expect(result.reply).toBe('두번째 답변입니다.');
    const history = cm.getHistory();
    expect(history.some((m) => m.role === 'summary')).toBe(false);
    expect(history).toHaveLength(4);
  });

  it('restoreHistory replaces the transcript and later sends extend from the restored state', async () => {
    const restored: ChatMessage[] = [
      { role: 'user', content: '이전 세션 메시지', at: '2026-01-01T00:00:00.000Z' },
      { role: 'assistant', content: '이전 세션 응답', at: '2026-01-01T00:00:01.000Z' },
    ];
    const { adapter, calls } = makeLlm(['복원 이후 응답']);
    const cm = new ConversationManager({ llm: adapter, model: 'm', getMemory: () => MEMORY });

    cm.restoreHistory(restored);
    expect(cm.getHistory()).toEqual(restored);

    await cm.send('새 메시지');

    expect(calls[0]?.messages).toEqual([
      { role: 'user', content: '이전 세션 메시지' },
      { role: 'assistant', content: '이전 세션 응답' },
      { role: 'user', content: '새 메시지' },
    ]);
  });

  it('getHistory returns a defensive copy that does not leak internal mutation', async () => {
    const { adapter } = makeLlm(['응답']);
    const cm = new ConversationManager({ llm: adapter, model: 'm', getMemory: () => MEMORY });
    await cm.send('메시지');

    const snapshot = cm.getHistory();
    snapshot.push({ role: 'user', content: '유출된 메시지', at: 'x' });

    expect(cm.getHistory()).toHaveLength(2);
  });

  it('re-reads memory on every send so a stale snapshot is never reused', async () => {
    let title = '제목: 초기 제목';
    const { adapter, calls } = makeLlm(['응답1', '응답2']);
    const cm = new ConversationManager({ llm: adapter, model: 'm', getMemory: () => memoryOf(title) });

    await cm.send('첫 메시지');
    title = '제목: 변경된 제목';
    await cm.send('두번째 메시지');

    expect(calls[0]?.system).toContain('초기 제목');
    expect(calls[1]?.system).toContain('변경된 제목');
  });
});
