import { describe, expect, it } from 'vitest';

import {
  formatRanAt,
  sortSummariesByRecency,
  summarizeCitedCount,
  toDisplayErrorMessage,
  toResearchRunState,
} from '../../src/renderer/research/researchHistoryLogic';
import type { ResearchHistoryRecord, ResearchHistorySummary } from '../../src/shared/ipc/researchHistory';
import type { ResearchPaperPayload } from '../../src/shared/ipc/research';

function makePaper(title: string): ResearchPaperPayload {
  return {
    title,
    authors: ['홍길동'],
    year: 2024,
    url: 'https://example.com/paper',
    source: 'Semantic Scholar',
    metadata: {
      source: 'semanticscholar',
      externalId: 'id-1',
      title,
      authors: ['홍길동'],
      year: 2024,
      abstract: null,
      venue: null,
      url: 'https://example.com/paper',
      citationCount: 3,
    },
  };
}

function makeRecord(overrides: Partial<ResearchHistoryRecord> = {}): ResearchHistoryRecord {
  return {
    id: 'rec-1',
    question: '메타인지 전략과 학업 성취의 관계는?',
    ranAt: '2026-07-10T09:00:00.000Z',
    report: '## 요약\n메타인지 전략은 학업 성취와 관련이 있다 [1].',
    citedPapers: [makePaper('메타인지 전략 연구')],
    relatedPapers: [],
    failedSources: [],
    ...overrides,
  };
}

describe('formatRanAt', () => {
  it('formats a valid ISO timestamp for Korean readers', () => {
    const formatted = formatRanAt('2026-07-10T09:00:00.000Z');
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).not.toBe('2026-07-10T09:00:00.000Z');
  });

  it('falls back to the raw string when unparsable', () => {
    expect(formatRanAt('not-a-date')).toBe('not-a-date');
  });
});

describe('summarizeCitedCount', () => {
  it('reports a nonzero citation count in Korean', () => {
    expect(summarizeCitedCount(3)).toBe('인용 문헌 3건');
  });

  it('reports zero citations distinctly', () => {
    expect(summarizeCitedCount(0)).toBe('인용 문헌 없음');
  });
});

describe('sortSummariesByRecency', () => {
  function makeSummary(id: string, ranAt: string): ResearchHistorySummary {
    return { id, question: `질문 ${id}`, ranAt, citedCount: 1 };
  }

  it('sorts records most-recent-first', () => {
    const records = [makeSummary('a', '2026-01-01T00:00:00.000Z'), makeSummary('b', '2026-03-01T00:00:00.000Z')];

    expect(sortSummariesByRecency(records).map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the input array', () => {
    const records = [makeSummary('a', '2026-01-01T00:00:00.000Z'), makeSummary('b', '2026-03-01T00:00:00.000Z')];
    const original = [...records];

    sortSummariesByRecency(records);

    expect(records).toEqual(original);
  });
});

describe('toDisplayErrorMessage', () => {
  it('extracts the message from an Error instance', () => {
    expect(toDisplayErrorMessage(new Error('저장된 기록을 읽을 수 없어요.'))).toBe('저장된 기록을 읽을 수 없어요.');
  });

  it('falls back to a generic Korean message for a non-Error thrown value', () => {
    expect(toDisplayErrorMessage('boom')).toBe('기록을 불러오지 못했어요. 다시 시도해 주세요.');
  });

  it('falls back to a generic Korean message for an Error with an empty message', () => {
    expect(toDisplayErrorMessage(new Error(''))).toBe('기록을 불러오지 못했어요. 다시 시도해 주세요.');
  });
});

describe('toResearchRunState', () => {
  it('adapts a saved record into an inactive, result-populated run state', () => {
    const record = makeRecord();

    const state = toResearchRunState(record);

    expect(state.active).toBe(false);
    expect(state.stage).toBeNull();
    expect(state.errorMessage).toBeNull();
    expect(state.result?.report).toBe(record.report);
    expect(state.result?.citedPapers).toBe(record.citedPapers);
    expect(state.result?.relatedPapers).toBe(record.relatedPapers);
    expect(state.result?.failedSources).toBe(record.failedSources);
    expect(state.result?.papers).toEqual([]);
  });
});
