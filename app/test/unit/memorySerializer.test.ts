import { describe, expect, it } from 'vitest';

import { MEMORY_SCHEMA_VERSION } from '../../src/core/memory/model';
import type { ProjectMemory } from '../../src/core/memory/model';
import { buildSystemPrompt, serializeMemoryForPrompt } from '../../src/core/memory/serializer';

function baseMemory(overrides: Partial<ProjectMemory> = {}): ProjectMemory {
  return {
    schemaVersion: MEMORY_SCHEMA_VERSION,
    project: {
      id: 'proj-1',
      title: '메타인지 전략 연구',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    researchQuestions: [],
    hypotheses: [],
    termDefinitions: [],
    decisions: [],
    advisorFeedback: [],
    ...overrides,
  };
}

describe('serializeMemoryForPrompt', () => {
  it('is deterministic: serializing the same snapshot twice yields byte-identical text', () => {
    const memory = baseMemory({
      researchQuestions: [{ id: 'q1', text: '연구 질문 A', status: 'active', createdAt: '2026-01-02T00:00:00.000Z' }],
      decisions: [
        { id: 'd1', what: '표본 30명', why: '선행연구 참고', decidedAt: '2026-01-03T00:00:00.000Z', source: 'manual' },
      ],
    });

    const first = serializeMemoryForPrompt(memory);
    const second = serializeMemoryForPrompt(memory);

    expect(first.text).toBe(second.text);
    expect(first).toEqual(second);
  });

  it('marks an empty memory as isEmpty and only renders the overview section', () => {
    const memory = baseMemory();

    const result = serializeMemoryForPrompt(memory);

    expect(result.isEmpty).toBe(true);
    expect(result.text).toContain('## 프로젝트 개요');
    expect(result.text).not.toContain('## 연구 질문');
    expect(result.text).not.toContain('## 가설');
    expect(result.text).not.toContain('## 용어 정의');
    expect(result.text).not.toContain('## 최근 연구 결정');
    expect(result.text).not.toContain('## 지도교수 피드백');
  });

  it('sets isEmpty to false when at least one collection has content', () => {
    const memory = baseMemory({
      hypotheses: [{ id: 'h1', text: 'H1: X는 Y에 영향을 준다', createdAt: '2026-01-02T00:00:00.000Z' }],
    });

    const result = serializeMemoryForPrompt(memory);

    expect(result.isEmpty).toBe(false);
  });

  it('treats memory with only fully-addressed feedback (and nothing else) as isEmpty', () => {
    const memory = baseMemory({
      advisorFeedback: [
        { id: 'f1', content: '반영 완료된 피드백', receivedAt: '2026-01-01T00:00:00.000Z', status: 'addressed', response: '완료' },
      ],
    });

    const result = serializeMemoryForPrompt(memory);

    expect(result.isEmpty).toBe(true);
    expect(result.text).not.toContain('## 지도교수 피드백');
  });

  it('omits sections that have no items while keeping populated ones', () => {
    const memory = baseMemory({
      researchQuestions: [{ id: 'q1', text: '연구 질문 A', status: 'active', createdAt: '2026-01-02T00:00:00.000Z' }],
    });

    const result = serializeMemoryForPrompt(memory);

    expect(result.text).toContain('## 연구 질문');
    expect(result.text).not.toContain('## 가설');
    expect(result.text).not.toContain('## 용어 정의');
    expect(result.text).not.toContain('## 최근 연구 결정');
  });

  it('sorts collections deterministically by createdAt then id, independent of input order', () => {
    const memory = baseMemory({
      termDefinitions: [
        { id: 'z-term', term: 'Z', definition: 'z 정의', createdAt: '2026-01-05T00:00:00.000Z' },
        { id: 'a-term', term: 'A', definition: 'a 정의', createdAt: '2026-01-05T00:00:00.000Z' },
        { id: 'mid-term', term: 'M', definition: 'm 정의', createdAt: '2026-01-01T00:00:00.000Z' },
      ],
    });

    const result = serializeMemoryForPrompt(memory);

    const mIndex = result.text.indexOf('M: m 정의');
    const aIndex = result.text.indexOf('A: a 정의');
    const zIndex = result.text.indexOf('Z: z 정의');
    expect(mIndex).toBeGreaterThanOrEqual(0);
    expect(mIndex).toBeLessThan(aIndex);
    expect(aIndex).toBeLessThan(zIndex);
  });

  it('truncates decisions to maxDecisions, keeping the most recent ones first', () => {
    const memory = baseMemory({
      decisions: Array.from({ length: 12 }, (_, i) => ({
        id: `d${i}`,
        what: `결정 ${i}`,
        why: `이유 ${i}`,
        decidedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
        source: 'manual' as const,
      })),
    });

    const result = serializeMemoryForPrompt(memory, { maxDecisions: 3 });

    expect(result.text).toContain('결정 11');
    expect(result.text).toContain('결정 10');
    expect(result.text).toContain('결정 9');
    expect(result.text).not.toContain('결정 8');
    const idx11 = result.text.indexOf('결정 11');
    const idx10 = result.text.indexOf('결정 10');
    expect(idx11).toBeLessThan(idx10);
  });

  it('only includes pending advisor feedback, excluding addressed items entirely', () => {
    const memory = baseMemory({
      advisorFeedback: [
        { id: 'f1', content: '서론 보완 필요', receivedAt: '2026-01-01T00:00:00.000Z', status: 'pending' },
        {
          id: 'f2',
          content: '결론 이미 반영함',
          receivedAt: '2026-01-02T00:00:00.000Z',
          status: 'addressed',
          response: '반영 완료',
        },
      ],
    });

    const result = serializeMemoryForPrompt(memory);

    expect(result.text).toContain('서론 보완 필요');
    expect(result.text).not.toContain('결론 이미 반영함');
  });

  it('truncates pending feedback to maxFeedback', () => {
    const memory = baseMemory({
      advisorFeedback: Array.from({ length: 8 }, (_, i) => ({
        id: `f${i}`,
        content: `피드백 ${i}`,
        receivedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
        status: 'pending' as const,
      })),
    });

    const result = serializeMemoryForPrompt(memory, { maxFeedback: 2 });

    const matches = result.text.match(/피드백 \d/g) ?? [];
    expect(matches).toHaveLength(2);
  });

  it('approxTokens grows monotonically as more content is added', () => {
    const small = serializeMemoryForPrompt(baseMemory());
    const larger = serializeMemoryForPrompt(
      baseMemory({
        researchQuestions: [
          {
            id: 'q1',
            text: '연구 질문 A는 상당히 긴 텍스트를 포함하고 있어 문자 수가 늘어난다',
            status: 'active',
            createdAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      }),
    );

    expect(larger.approxTokens).toBeGreaterThan(small.approxTokens);
  });

  it('links a hypothesis to its related research question text when present', () => {
    const memory = baseMemory({
      researchQuestions: [
        {
          id: 'q1',
          text: '메타인지 전략이 학업 성취에 영향을 주는가?',
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      hypotheses: [
        {
          id: 'h1',
          text: 'H1: 메타인지 전략은 학업 성취를 높인다',
          relatedQuestionId: 'q1',
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    });

    const result = serializeMemoryForPrompt(memory);

    expect(result.text).toContain('관련 연구 질문: 메타인지 전략이 학업 성취에 영향을 주는가?');
  });

  it('marks archived research questions distinctly from active ones', () => {
    const memory = baseMemory({
      researchQuestions: [{ id: 'q1', text: '보류된 질문', status: 'archived', createdAt: '2026-01-01T00:00:00.000Z' }],
    });

    const result = serializeMemoryForPrompt(memory);

    expect(result.text).toContain('보류된 질문');
    expect(result.text).toMatch(/보류된 질문.*\[보류\]/);
  });

  it('includes the term source only when present', () => {
    const memory = baseMemory({
      termDefinitions: [
        { id: 't1', term: '메타인지', definition: '자신의 인지 과정을 아는 것', source: '교재 3장', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 't2', term: '자기효능감', definition: '스스로에 대한 믿음', createdAt: '2026-01-02T00:00:00.000Z' },
      ],
    });

    const result = serializeMemoryForPrompt(memory);

    expect(result.text).toContain('메타인지: 자신의 인지 과정을 아는 것 (출처: 교재 3장)');
    expect(result.text).toContain('자기효능감: 스스로에 대한 믿음');
    expect(result.text).not.toContain('스스로에 대한 믿음 (출처');
  });
});

describe('buildSystemPrompt', () => {
  it('combines the fixed preamble, serialized memory, and task instruction in order', () => {
    const memory = baseMemory({
      researchQuestions: [{ id: 'q1', text: '연구 질문 A', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    const serialized = serializeMemoryForPrompt(memory);

    const prompt = buildSystemPrompt(serialized, '초록을 3문단으로 요약하라.');

    const preambleIndex = prompt.indexOf('논문 작성 서포터');
    const memoryIndex = prompt.indexOf('## 프로젝트 개요');
    const taskIndex = prompt.indexOf('초록을 3문단으로 요약하라.');
    expect(preambleIndex).toBeGreaterThanOrEqual(0);
    expect(preambleIndex).toBeLessThan(memoryIndex);
    expect(memoryIndex).toBeLessThan(taskIndex);
  });

  it('produces the same fixed preamble text regardless of memory content, for cache-prefix stability', () => {
    const emptyPrompt = buildSystemPrompt(serializeMemoryForPrompt(baseMemory()), '작업 A');
    const filledMemory = baseMemory({
      hypotheses: [{ id: 'h1', text: 'H1', createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    const filledPrompt = buildSystemPrompt(serializeMemoryForPrompt(filledMemory), '작업 A');

    const preambleA = emptyPrompt.split('\n\n')[0];
    const preambleB = filledPrompt.split('\n\n')[0];
    expect(preambleA).toBe(preambleB);
  });
});
