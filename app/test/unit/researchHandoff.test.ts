import { describe, expect, it } from 'vitest';

import type { PaperMetadata } from '../../src/core/academic-api/types';
import { buildHandoffPreview, buildResearchHandoffHistory } from '../../src/core/chat/researchHandoff';
import type { ResearchRecord } from '../../src/core/research-history/model';
import type { ScreenedPaper } from '../../src/core/research-pipeline/types';

const TRUNCATION_MARKER = '...(이하 생략)';

function paper(overrides: Partial<PaperMetadata> = {}): PaperMetadata {
  return {
    source: 'semanticscholar',
    externalId: 'id-1',
    title: '논문 제목',
    authors: ['홍길동'],
    year: 2024,
    abstract: null,
    venue: null,
    url: 'https://example.com/paper',
    citationCount: 0,
    ...overrides,
  };
}

function screened(overrides: Partial<PaperMetadata> = {}): ScreenedPaper {
  return { paper: paper(overrides), relevance: 'high' };
}

function makeRecord(overrides: Partial<ResearchRecord> = {}): ResearchRecord {
  return {
    schemaVersion: 1,
    id: 'record-1',
    question: '연구 질문입니다',
    ranAt: '2026-07-10T00:00:00.000Z',
    report: '리포트 본문입니다.',
    citedPapers: [screened({ title: '인용 논문 1' })],
    relatedPapers: [screened({ title: '관련 논문 1' })],
    failedSources: [],
    usage: { calls: 1, inputTokens: 10, outputTokens: 5 },
    ...overrides,
  };
}

describe('buildResearchHandoffHistory', () => {
  it('returns exactly a user turn followed by an assistant turn', () => {
    const history = buildResearchHandoffHistory(makeRecord());

    expect(history).toHaveLength(2);
    expect(history[0]?.role).toBe('user');
    expect(history[1]?.role).toBe('assistant');
    expect(typeof history[0]?.at).toBe('string');
    expect(typeof history[1]?.at).toBe('string');
  });

  it('includes the question and a handoff invitation in the user turn', () => {
    const history = buildResearchHandoffHistory(makeRecord({ question: '메타인지 전략은 효과적인가?' }));

    const userContent = history[0]?.content ?? '';
    expect(userContent).toContain('아이디어 회의를 하고 싶어요');
    expect(userContent).toContain('메타인지 전략은 효과적인가?');
  });

  it('gives the assistant turn a short acceptance reply', () => {
    const history = buildResearchHandoffHistory(makeRecord());

    const assistantContent = history[1]?.content ?? '';
    expect(assistantContent.length).toBeGreaterThan(0);
    expect(assistantContent.length).toBeLessThan(200);
    expect(assistantContent).toContain('확인했어요');
  });

  it('leaves a short report untouched (no truncation marker)', () => {
    const history = buildResearchHandoffHistory(makeRecord({ report: '짧은 리포트 본문입니다.' }));

    expect(history[0]?.content).toContain('짧은 리포트 본문입니다.');
    expect(history[0]?.content).not.toContain(TRUNCATION_MARKER);
  });

  it('truncates a long report at a paragraph boundary and appends the marker', () => {
    const paragraph = '가'.repeat(100);
    const longReport = Array.from({ length: 70 }, () => paragraph).join('\n\n'); // ~7,138 chars > 6,000 limit

    const history = buildResearchHandoffHistory(makeRecord({ report: longReport }));
    const userContent = history[0]?.content ?? '';

    expect(userContent).toContain(TRUNCATION_MARKER);
    // Every paragraph kept must be a full, untouched copy — never a partial cut mid-paragraph.
    const reportSection = userContent.split('리포트 요약:\n')[1]?.split('\n\n참고문헌')[0] ?? '';
    const keptParagraphs = reportSection.replace(`\n\n${TRUNCATION_MARKER}`, '').split('\n\n');
    for (const kept of keptParagraphs) {
      expect(kept === paragraph || kept === '').toBe(true);
    }
    expect(keptParagraphs.length).toBeLessThan(70);
  });

  it('numbers cited papers with title, authors, and year', () => {
    const record = makeRecord({
      citedPapers: [
        screened({ title: '논문 A', authors: ['김철수', '이영희'], year: 2023 }),
      ],
    });

    const history = buildResearchHandoffHistory(record);

    expect(history[0]?.content).toContain('1. 논문 A — 김철수, 이영희 (2023)');
  });

  it('caps cited papers at 15 even when more are supplied', () => {
    const citedPapers = Array.from({ length: 20 }, (_, i) => screened({ title: `인용 논문 ${i + 1}` }));
    const history = buildResearchHandoffHistory(makeRecord({ citedPapers }));

    const userContent = history[0]?.content ?? '';
    expect(userContent).toContain('15. 인용 논문 15');
    expect(userContent).not.toContain('16. 인용 논문 16');
  });

  it('shows a fallback line when there are no cited papers', () => {
    const history = buildResearchHandoffHistory(makeRecord({ citedPapers: [] }));

    expect(history[0]?.content).toContain('참고문헌 없음');
  });

  it('lists related papers by title only', () => {
    const record = makeRecord({
      relatedPapers: [screened({ title: '관련 논문 X', authors: ['박민수'], year: 2022 })],
    });

    const history = buildResearchHandoffHistory(record);
    const userContent = history[0]?.content ?? '';

    expect(userContent).toContain('1. 관련 논문 X');
    expect(userContent).not.toContain('박민수');
  });

  it('caps related papers at 8 even when more are supplied', () => {
    const relatedPapers = Array.from({ length: 12 }, (_, i) => screened({ title: `관련 논문 ${i + 1}` }));
    const history = buildResearchHandoffHistory(makeRecord({ relatedPapers }));

    const userContent = history[0]?.content ?? '';
    expect(userContent).toContain('8. 관련 논문 8');
    expect(userContent).not.toContain('9. 관련 논문 9');
  });

  it('shows a fallback line when there are no related papers', () => {
    const history = buildResearchHandoffHistory(makeRecord({ relatedPapers: [] }));

    expect(history[0]?.content).toContain('없음');
  });

  it('hard-caps the total injected user-turn text around 8,000 characters', () => {
    const longTitle = '가'.repeat(200);
    const citedPapers = Array.from({ length: 15 }, (_, i) => screened({ title: `${longTitle}-${i}` }));
    const relatedPapers = Array.from({ length: 8 }, (_, i) => screened({ title: `${longTitle}-r${i}` }));
    const longReport = Array.from({ length: 60 }, () => '나'.repeat(100)).join('\n\n');

    const history = buildResearchHandoffHistory(
      makeRecord({ report: longReport, citedPapers, relatedPapers }),
    );
    const userContent = history[0]?.content ?? '';

    expect(userContent.length).toBeLessThanOrEqual(8000 + TRUNCATION_MARKER.length + 10);
  });
});

describe('buildHandoffPreview', () => {
  it('mentions the question and the number of cited papers', () => {
    const record = makeRecord({
      question: '연구 질문입니다',
      citedPapers: [screened({ title: '논문 1' }), screened({ title: '논문 2' })],
    });

    expect(buildHandoffPreview(record)).toBe(
      "리서치 '연구 질문입니다'의 요약과 참고문헌 2건을 새 대화에 불러왔어요.",
    );
  });

  it('reports zero cited papers when the record has none', () => {
    const record = makeRecord({ citedPapers: [] });

    expect(buildHandoffPreview(record)).toContain('참고문헌 0건');
  });

  it('truncates a long question and collapses embedded newlines', () => {
    const record = makeRecord({ question: `${'질문 내용을 아주 길게 반복합니다 '.repeat(5)}\n다음 줄` });

    const preview = buildHandoffPreview(record);

    expect(preview).toContain('...');
    expect(preview).not.toContain('\n');
  });
});
