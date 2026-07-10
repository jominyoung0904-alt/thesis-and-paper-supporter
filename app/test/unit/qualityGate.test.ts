import { describe, expect, it, vi } from 'vitest';

import type { LlmAdapter, LlmRequest, LlmResponse } from '../../src/core/llm/types';
import type { SectionGateDefinition } from '../../src/core/writing/gateDefinitions';
import { introductionGateDefinition } from '../../src/core/writing/gateDefinitions';
import { checkCitationPresence, runQualityGate } from '../../src/core/writing/qualityGate';

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

const PASS_JSON = JSON.stringify({
  results: [
    { criterionId: 'research-gap', passed: true, feedback: '연구 갭이 명확히 드러나요.' },
    { criterionId: 'contribution', passed: true, feedback: '기여가 잘 명시되어 있어요.' },
  ],
});

const ONE_FAIL_JSON = JSON.stringify({
  results: [
    { criterionId: 'research-gap', passed: false, feedback: '연구 갭이 아직 불분명해요.' },
    { criterionId: 'contribution', passed: true, feedback: '기여가 잘 명시되어 있어요.' },
  ],
});

const CITED_TEXT = '선행연구는 이 문제를 다루지 않았다 (홍길동, 2020).\n\n본 연구는 이 빈틈을 다룬다 (김민영, 2021).';
const NO_CITATION_TEXT = '이 연구는 중요한 주제를 다룬다.\n\n앞으로 이를 살펴본다.';

describe('runQualityGate — introduction (llm criteria)', () => {
  it('passes when every criterion (llm + rule) is satisfied', async () => {
    const { adapter } = mockLlm(PASS_JSON);

    const result = await runQualityGate(introductionGateDefinition, CITED_TEXT, { llm: adapter, model: 'm' });

    expect(result.sectionId).toBe('introduction');
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(3);
    expect(result.results.every((r) => r.passed)).toBe(true);
    expect(result.summary).toContain('모두 충족');
  });

  it('fails the gate when one llm criterion is not satisfied', async () => {
    const { adapter } = mockLlm(ONE_FAIL_JSON);

    const result = await runQualityGate(introductionGateDefinition, CITED_TEXT, { llm: adapter, model: 'm' });

    expect(result.passed).toBe(false);
    const gap = result.results.find((r) => r.criterionId === 'research-gap');
    expect(gap?.passed).toBe(false);
    expect(gap?.feedback).toContain('불분명');
    expect(result.summary).toContain('3개 기준 중 2개');
    expect(result.summary).toContain('연구 갭 명시');
  });

  it('sends the section text and model to the llm exactly once when the first response is valid', async () => {
    const { adapter, chat } = mockLlm(PASS_JSON);

    await runQualityGate(introductionGateDefinition, CITED_TEXT, { llm: adapter, model: 'my-model' });

    expect(chat).toHaveBeenCalledTimes(1);
    const req = chat.mock.calls[0]![0];
    expect(req.model).toBe('my-model');
    expect(req.messages[0]!.content).toContain(CITED_TEXT);
  });

  it('preserves the definition criterion order in the result regardless of llm response order', async () => {
    const reordered = JSON.stringify({
      results: [
        { criterionId: 'contribution', passed: true, feedback: '기여 명시됨' },
        { criterionId: 'research-gap', passed: true, feedback: '갭 명시됨' },
      ],
    });
    const { adapter } = mockLlm(reordered);

    const result = await runQualityGate(introductionGateDefinition, CITED_TEXT, { llm: adapter, model: 'm' });

    expect(result.results.map((r) => r.criterionId)).toEqual(['research-gap', 'contribution', 'citation-presence']);
  });
});

describe('runQualityGate — malformed JSON handling (FR-WRT-002: never fail open)', () => {
  it('retries once when the first response is not valid JSON, and succeeds using the second response', async () => {
    const { adapter, chat } = mockLlm('this is not json at all', PASS_JSON);

    const result = await runQualityGate(introductionGateDefinition, CITED_TEXT, { llm: adapter, model: 'm' });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.passed).toBe(true);
  });

  it('falls back to failed + Korean fallback feedback for every llm criterion when both attempts are malformed', async () => {
    const { adapter, chat } = mockLlm('nope', 'still nope');

    const result = await runQualityGate(introductionGateDefinition, CITED_TEXT, { llm: adapter, model: 'm' });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.passed).toBe(false);
    const gap = result.results.find((r) => r.criterionId === 'research-gap')!;
    const contribution = result.results.find((r) => r.criterionId === 'contribution')!;
    expect(gap.passed).toBe(false);
    expect(gap.feedback).toBe('자동 검사에 실패했어요. 다시 시도해 주세요');
    expect(contribution.passed).toBe(false);
    expect(contribution.feedback).toBe('자동 검사에 실패했어요. 다시 시도해 주세요');
  });

  it('treats a response missing one required criterion as invalid and retries', async () => {
    const missingOne = JSON.stringify({
      results: [{ criterionId: 'research-gap', passed: true, feedback: '괜찮아요' }],
    });
    const { adapter, chat } = mockLlm(missingOne, PASS_JSON);

    const result = await runQualityGate(introductionGateDefinition, CITED_TEXT, { llm: adapter, model: 'm' });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.passed).toBe(true);
  });
});

describe('checkCitationPresence — rule-based citation check', () => {
  it('fails when there are zero citation markers', () => {
    const r = checkCitationPresence('citation-presence', NO_CITATION_TEXT);
    expect(r.passed).toBe(false);
    expect(r.feedback).toContain('찾을 수 없어요');
  });

  it('passes with the (Author, Year) pattern when count meets paragraph count', () => {
    const r = checkCitationPresence('citation-presence', '이 결과는 중요하다 (홍길동, 2020).');
    expect(r.passed).toBe(true);
  });

  it('passes with the [n] numeric bracket pattern', () => {
    const r = checkCitationPresence('citation-presence', '이 결과는 중요하다 [1].');
    expect(r.passed).toBe(true);
  });

  it('passes with the [^n] footnote pattern', () => {
    const r = checkCitationPresence('citation-presence', '이 결과는 중요하다 [^1].');
    expect(r.passed).toBe(true);
  });

  it('fails when citation count is below the paragraph count', () => {
    const twoParagraphsOneCitation = '주장 A (홍길동, 2020).\n\n주장 B는 인용이 없다.';
    const r = checkCitationPresence('citation-presence', twoParagraphsOneCitation);
    expect(r.passed).toBe(false);
    expect(r.feedback).toContain('부족');
  });
});

describe('gate definition extensibility (FR-WRT-007)', () => {
  it('reuses runQualityGate for an unrelated fake "conclusion" section definition', async () => {
    const fakeConclusionDef: SectionGateDefinition = {
      sectionId: 'conclusion',
      sectionLabel: '결론',
      criteria: [
        { id: 'coherence', label: '일관성', description: '결론이 서론/본론과 일관되는가', check: 'llm' },
        { id: 'citation-presence', label: '인용 존재', description: '결론에도 인용 근거가 있는가', check: 'rule' },
      ],
    };
    const coherencePassJson = JSON.stringify({
      results: [{ criterionId: 'coherence', passed: true, feedback: '일관성이 있어요.' }],
    });
    const { adapter } = mockLlm(coherencePassJson);

    const result = await runQualityGate(fakeConclusionDef, CITED_TEXT, { llm: adapter, model: 'm' });

    expect(result.sectionId).toBe('conclusion');
    expect(result.results.map((r) => r.criterionId)).toEqual(['coherence', 'citation-presence']);
    expect(result.passed).toBe(true);
  });

  it('fails closed for a rule criterion id that has no registered checker, instead of silently passing', async () => {
    const unknownRuleDef: SectionGateDefinition = {
      sectionId: 'body',
      sectionLabel: '본론',
      criteria: [{ id: 'not-registered-yet', label: '미구현 규칙', description: '아직 구현되지 않음', check: 'rule' }],
    };
    const { adapter } = mockLlm();

    const result = await runQualityGate(unknownRuleDef, CITED_TEXT, { llm: adapter, model: 'm' });

    expect(result.passed).toBe(false);
    expect(result.results[0]!.feedback).toContain('찾을 수 없어요');
  });
});
