import { describe, expect, it, vi } from 'vitest';

import type { LlmAdapter, LlmRequest, LlmResponse } from '../../src/core/llm/types';
import type { SerializedMemory } from '../../src/core/memory/serializer';
import { runMockReview } from '../../src/core/writing/mockReview';

/** Builds a minimal LlmResponse from plain text. */
function textResponse(text: string): LlmResponse {
  return { text, usage: { inputTokens: 10, outputTokens: 10 }, model: 'test-model' };
}

/** Builds a mock LlmAdapter whose `chat` is a vi.fn, queued via mockResolvedValueOnce. */
function mockLlm(...responses: string[]): { adapter: LlmAdapter; chat: ReturnType<typeof vi.fn> } {
  const chat = vi.fn<(req: LlmRequest) => Promise<LlmResponse>>();
  for (const r of responses) chat.mockResolvedValueOnce(textResponse(r));
  return { adapter: { provider: 'claude', chat }, chat };
}

const MANUSCRIPT_TEXT = '본 연구는 인공지능 기반 논문 작성 지원 도구의 사용성을 분석한다.';

function makeValidBody(overrides?: {
  questionCount?: number;
  weaknessCount?: number;
  severity?: 'minor' | 'major';
}) {
  const questionCount = overrides?.questionCount ?? 3;
  const weaknessCount = overrides?.weaknessCount ?? 2;
  const severity = overrides?.severity ?? 'major';

  return {
    questions: Array.from({ length: questionCount }, (_, i) => ({
      question: `예상 질문 ${i + 1}은 무엇인가요?`,
      basis: `근거 ${i + 1}이에요.`,
    })),
    weaknesses: Array.from({ length: weaknessCount }, (_, i) => ({
      weakness: `약점 ${i + 1}이 있어요.`,
      severity,
      suggestion: `보완 제안 ${i + 1}이에요.`,
    })),
    overallComment: '전반적으로 논지는 명확하지만 보완이 필요해요.',
  };
}

const VALID_JSON = JSON.stringify(makeValidBody());

describe('runMockReview — successful parsing', () => {
  it('returns questions, weaknesses, and overallComment on a valid first response', async () => {
    const { adapter } = mockLlm(VALID_JSON);

    const result = await runMockReview(MANUSCRIPT_TEXT, { llm: adapter, model: 'm' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.questions).toHaveLength(3);
    expect(result.weaknesses).toHaveLength(2);
    expect(result.overallComment).toContain('보완');
  });

  it('sends the manuscript text and model to the llm exactly once when the first response is valid', async () => {
    const { adapter, chat } = mockLlm(VALID_JSON);

    await runMockReview(MANUSCRIPT_TEXT, { llm: adapter, model: 'my-model' });

    expect(chat).toHaveBeenCalledTimes(1);
    const req = chat.mock.calls[0]![0];
    expect(req.model).toBe('my-model');
    expect(req.messages[0]!.content).toContain(MANUSCRIPT_TEXT);
  });

  it('strips markdown code fences before parsing the JSON response', async () => {
    const fenced = '```json\n' + VALID_JSON + '\n```';
    const { adapter } = mockLlm(fenced);

    const result = await runMockReview(MANUSCRIPT_TEXT, { llm: adapter, model: 'm' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.questions).toHaveLength(3);
  });

  it('accepts the maximum allowed question and weakness counts (7 and 5)', async () => {
    const body = makeValidBody({ questionCount: 7, weaknessCount: 5 });
    const { adapter } = mockLlm(JSON.stringify(body));

    const result = await runMockReview(MANUSCRIPT_TEXT, { llm: adapter, model: 'm' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.questions).toHaveLength(7);
    expect(result.weaknesses).toHaveLength(5);
  });

  it('accepts a "minor" severity weakness', async () => {
    const body = makeValidBody({ severity: 'minor' });
    const { adapter } = mockLlm(JSON.stringify(body));

    const result = await runMockReview(MANUSCRIPT_TEXT, { llm: adapter, model: 'm' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.weaknesses[0]!.severity).toBe('minor');
  });

  it('injects serialized memory into the system prompt when deps.memory is provided', async () => {
    const { adapter, chat } = mockLlm(VALID_JSON);
    const memory: SerializedMemory = {
      text: '## 프로젝트 개요\n제목: 테스트 논문',
      isEmpty: false,
      approxTokens: 20,
    };

    await runMockReview(MANUSCRIPT_TEXT, { llm: adapter, model: 'm', memory });

    const req = chat.mock.calls[0]![0];
    expect(req.system).toContain('테스트 논문');
  });
});

describe('runMockReview — malformed/empty response handling (fail-closed, never a silent partial review)', () => {
  it('retries once when the first response is not valid JSON, and succeeds using the second response', async () => {
    const { adapter, chat } = mockLlm('this is not json at all', VALID_JSON);

    const result = await runMockReview(MANUSCRIPT_TEXT, { llm: adapter, model: 'm' });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  });

  it('returns ok:false with a Korean fallback reason when both attempts are malformed', async () => {
    const { adapter, chat } = mockLlm('nope', 'still nope');

    const result = await runMockReview(MANUSCRIPT_TEXT, { llm: adapter, model: 'm' });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toBe('자동 모의 심사에 실패했어요. 다시 시도해 주세요');
    // Fail-closed: the failure must never carry partial review data back.
    expect(result).not.toHaveProperty('questions');
  });

  it('returns ok:false when both responses are empty strings', async () => {
    const { adapter, chat } = mockLlm('', '');

    const result = await runMockReview(MANUSCRIPT_TEXT, { llm: adapter, model: 'm' });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
  });

  it('rejects a response with fewer than 3 questions (below the minimum)', async () => {
    const body = makeValidBody({ questionCount: 2 });
    const { adapter, chat } = mockLlm(JSON.stringify(body), VALID_JSON);

    const result = await runMockReview(MANUSCRIPT_TEXT, { llm: adapter, model: 'm' });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  });

  it('rejects a response with more than 7 questions (above the maximum)', async () => {
    const body = makeValidBody({ questionCount: 8 });
    const { adapter, chat } = mockLlm(JSON.stringify(body), JSON.stringify(body));

    const result = await runMockReview(MANUSCRIPT_TEXT, { llm: adapter, model: 'm' });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
  });

  it('rejects a response with fewer than 2 weaknesses (below the minimum)', async () => {
    const body = makeValidBody({ weaknessCount: 1 });
    const { adapter, chat } = mockLlm(JSON.stringify(body), JSON.stringify(body));

    const result = await runMockReview(MANUSCRIPT_TEXT, { llm: adapter, model: 'm' });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
  });

  it('rejects a response with an invalid severity value', async () => {
    const invalidBody = {
      ...makeValidBody(),
      weaknesses: [{ weakness: '약점', severity: 'critical', suggestion: '제안' }, { weakness: '약점2', severity: 'minor', suggestion: '제안2' }],
    };
    const { adapter, chat } = mockLlm(JSON.stringify(invalidBody), JSON.stringify(invalidBody));

    const result = await runMockReview(MANUSCRIPT_TEXT, { llm: adapter, model: 'm' });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
  });

  it('rejects a response with a missing/empty overallComment field', async () => {
    const missingComment = JSON.stringify({ ...makeValidBody(), overallComment: '' });
    const { adapter, chat } = mockLlm(missingComment, missingComment);

    const result = await runMockReview(MANUSCRIPT_TEXT, { llm: adapter, model: 'm' });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
  });

  it('treats text containing braces but invalid JSON syntax as a parse failure', async () => {
    const brokenJson = '{ this is not: valid, json }';
    const { adapter, chat } = mockLlm(brokenJson, brokenJson);

    const result = await runMockReview(MANUSCRIPT_TEXT, { llm: adapter, model: 'm' });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
  });

  it('rejects a question item missing a required field (basis)', async () => {
    const badQuestion = JSON.stringify({
      ...makeValidBody(),
      questions: [
        { question: '질문만 있어요' },
        { question: '질문2', basis: '근거2' },
        { question: '질문3', basis: '근거3' },
      ],
    });
    const { adapter, chat } = mockLlm(badQuestion, badQuestion);

    const result = await runMockReview(MANUSCRIPT_TEXT, { llm: adapter, model: 'm' });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
  });
});
