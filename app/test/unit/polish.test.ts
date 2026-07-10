import { describe, expect, it, vi } from 'vitest';

import type { LlmAdapter, LlmRequest, LlmResponse } from '../../src/core/llm/types';
import type { SerializedMemory } from '../../src/core/memory/serializer';
import { runPolish } from '../../src/core/writing/polish';

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

const KO_TEXT = '이 연구는 진짜 중요한 얘기를 다루고 있다고 생각한다.';
const EN_TEXT = 'This paper talk about a very important thing that we found.';

const KO_JSON = JSON.stringify({
  polishedText: '본 연구는 중요한 논제를 다룬다.',
  changes: [{ before: '진짜 중요한 얘기를 다루고 있다고 생각한다', after: '중요한 논제를 다룬다', reason: '구어체를 학술 문체로 다듬었어요.' }],
  language: 'ko',
});

const EN_JSON = JSON.stringify({
  polishedText: 'This paper addresses an important issue that we identified.',
  changes: [{ before: 'talk about', after: 'addresses', reason: '시제와 어휘를 학술적으로 다듬었어요.' }],
  language: 'en',
});

const NO_CHANGE_JSON = JSON.stringify({
  polishedText: '이미 학술적인 문장이다.',
  changes: [],
  language: 'ko',
});

describe('runPolish — successful parsing', () => {
  it('returns the polished text, changes, and language on a valid first response', async () => {
    const { adapter } = mockLlm(KO_JSON);

    const result = await runPolish(KO_TEXT, { llm: adapter, model: 'm' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.polishedText).toBe('본 연구는 중요한 논제를 다룬다.');
    expect(result.language).toBe('ko');
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]!.reason).toContain('학술 문체');
  });

  it('sends the paragraph and model to the llm exactly once when the first response is valid', async () => {
    const { adapter, chat } = mockLlm(KO_JSON);

    await runPolish(KO_TEXT, { llm: adapter, model: 'my-model' });

    expect(chat).toHaveBeenCalledTimes(1);
    const req = chat.mock.calls[0]![0];
    expect(req.model).toBe('my-model');
    expect(req.messages[0]!.content).toContain(KO_TEXT);
  });

  it('strips markdown code fences before parsing the JSON response', async () => {
    const fenced = '```json\n' + KO_JSON + '\n```';
    const { adapter } = mockLlm(fenced);

    const result = await runPolish(KO_TEXT, { llm: adapter, model: 'm' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.polishedText).toBe('본 연구는 중요한 논제를 다룬다.');
  });

  it('accepts an empty changes array when no edits were needed', async () => {
    const { adapter } = mockLlm(NO_CHANGE_JSON);

    const result = await runPolish('이미 학술적인 문장이다.', { llm: adapter, model: 'm' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.changes).toEqual([]);
  });

  it('detects Korean as the response language', async () => {
    const { adapter } = mockLlm(KO_JSON);

    const result = await runPolish(KO_TEXT, { llm: adapter, model: 'm' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.language).toBe('ko');
  });

  it('detects English as the response language', async () => {
    const { adapter } = mockLlm(EN_JSON);

    const result = await runPolish(EN_TEXT, { llm: adapter, model: 'm' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.language).toBe('en');
    expect(result.polishedText).toContain('addresses');
  });

  it('injects serialized memory into the system prompt when deps.memory is provided', async () => {
    const { adapter, chat } = mockLlm(KO_JSON);
    const memory: SerializedMemory = {
      text: '## 프로젝트 개요\n제목: 테스트 논문',
      isEmpty: false,
      approxTokens: 20,
    };

    await runPolish(KO_TEXT, { llm: adapter, model: 'm', memory });

    const req = chat.mock.calls[0]![0];
    expect(req.system).toContain('테스트 논문');
  });
});

describe('runPolish — malformed/empty response handling (fail-closed, never silently returns the original text)', () => {
  it('retries once when the first response is not valid JSON, and succeeds using the second response', async () => {
    const { adapter, chat } = mockLlm('this is not json at all', KO_JSON);

    const result = await runPolish(KO_TEXT, { llm: adapter, model: 'm' });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  });

  it('returns ok:false with a Korean fallback reason when both attempts are malformed', async () => {
    const { adapter, chat } = mockLlm('nope', 'still nope');

    const result = await runPolish(KO_TEXT, { llm: adapter, model: 'm' });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toBe('자동 문장 다듬기에 실패했어요. 다시 시도해 주세요');
    // Fail-closed: the failure must never carry the original text back as "polished".
    expect(result).not.toHaveProperty('polishedText');
  });

  it('returns ok:false when both responses are empty strings', async () => {
    const { adapter, chat } = mockLlm('', '');

    const result = await runPolish(KO_TEXT, { llm: adapter, model: 'm' });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
  });

  it('treats a response with an unrecognized language value as invalid and retries', async () => {
    const badLanguage = JSON.stringify({ polishedText: '다듬은 문장', changes: [], language: 'fr' });
    const { adapter, chat } = mockLlm(badLanguage, KO_JSON);

    const result = await runPolish(KO_TEXT, { llm: adapter, model: 'm' });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  });

  it('treats a response with a missing/empty polishedText field as invalid', async () => {
    const missingText = JSON.stringify({ polishedText: '', changes: [], language: 'ko' });
    const { adapter, chat } = mockLlm(missingText, missingText);

    const result = await runPolish(KO_TEXT, { llm: adapter, model: 'm' });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
  });

  it('treats text containing braces but invalid JSON syntax as a parse failure', async () => {
    const brokenJson = '{ this is not: valid, json }';
    const { adapter, chat } = mockLlm(brokenJson, brokenJson);

    const result = await runPolish(KO_TEXT, { llm: adapter, model: 'm' });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
  });

  it('treats a change item missing a required field (reason) as invalid', async () => {
    const badChange = JSON.stringify({
      polishedText: '다듬은 문장',
      changes: [{ before: 'a', after: 'b' }],
      language: 'ko',
    });
    const { adapter, chat } = mockLlm(badChange, badChange);

    const result = await runPolish(KO_TEXT, { llm: adapter, model: 'm' });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
  });
});
