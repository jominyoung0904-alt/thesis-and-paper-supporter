import { describe, expect, it } from 'vitest';

import type { IpcPaperMetadata, IpcSavedPaper } from '../../src/shared/ipc-channels';
import {
  buildSavedKeySet,
  formatAuthors,
  formatSavedAt,
  formatYear,
  isMemoTooLong,
  isPaperSaved,
  MEMO_MAX_LENGTH,
  paperKey,
  remainingMemoChars,
  sourceLabel,
  toDisplayErrorMessage,
} from '../../src/renderer/library/libraryLogic';

function makeMetadata(overrides: Partial<IpcPaperMetadata> = {}): IpcPaperMetadata {
  return {
    source: 'openalex',
    externalId: 'W123',
    title: '메타인지와 학업 성취',
    authors: ['홍길동'],
    year: 2024,
    abstract: null,
    venue: null,
    url: 'https://openalex.org/W123',
    citationCount: null,
    ...overrides,
  };
}

function makeSavedPaper(overrides: Partial<IpcSavedPaper> = {}): IpcSavedPaper {
  return {
    id: 'saved-1',
    paper: makeMetadata(),
    savedAt: '2026-01-01T00:00:00.000Z',
    memo: '',
    ...overrides,
  };
}

describe('sourceLabel', () => {
  it('returns the Korean label for a known source', () => {
    expect(sourceLabel('kci')).toBe('KCI');
    expect(sourceLabel('naverdoc')).toBe('학위논문·보고서(네이버 전문정보)');
  });
});

describe('paperKey / buildSavedKeySet / isPaperSaved', () => {
  it('builds a stable source+externalId key', () => {
    expect(paperKey('openalex', 'W123')).toBe('openalex:W123');
  });

  it('produces distinct keys for different sources with the same externalId', () => {
    expect(paperKey('openalex', 'W123')).not.toBe(paperKey('kci', 'W123'));
  });

  it('marks a paper saved when its (source, externalId) is in the saved set', () => {
    const savedKeys = buildSavedKeySet([makeSavedPaper({ paper: makeMetadata({ source: 'openalex', externalId: 'W123' }) })]);

    expect(isPaperSaved(savedKeys, makeMetadata({ source: 'openalex', externalId: 'W123' }))).toBe(true);
    expect(isPaperSaved(savedKeys, makeMetadata({ source: 'kci', externalId: 'W123' }))).toBe(false);
    expect(isPaperSaved(savedKeys, makeMetadata({ source: 'openalex', externalId: 'OTHER' }))).toBe(false);
  });

  it('returns an empty set for an empty library', () => {
    expect(buildSavedKeySet([]).size).toBe(0);
  });
});

describe('formatAuthors / formatYear', () => {
  it('joins multiple authors with a comma', () => {
    expect(formatAuthors(['홍길동', '김철수'])).toBe('홍길동, 김철수');
  });

  it('falls back to a placeholder when there are no authors', () => {
    expect(formatAuthors([])).toBe('저자 미상');
  });

  it('formats a known year as a plain string', () => {
    expect(formatYear(2024)).toBe('2024');
  });

  it('falls back to a placeholder when the year is unknown', () => {
    expect(formatYear(null)).toBe('연도 미상');
  });
});

describe('formatSavedAt', () => {
  it('formats a valid ISO timestamp without throwing', () => {
    expect(formatSavedAt('2026-01-01T00:00:00.000Z').length).toBeGreaterThan(0);
  });

  it('falls back to the raw string for an unparsable timestamp', () => {
    expect(formatSavedAt('not-a-date')).toBe('not-a-date');
  });
});

describe('memo length helpers', () => {
  it('reports memo within the cap as not too long', () => {
    expect(isMemoTooLong('a'.repeat(MEMO_MAX_LENGTH))).toBe(false);
  });

  it('reports memo over the cap as too long', () => {
    expect(isMemoTooLong('a'.repeat(MEMO_MAX_LENGTH + 1))).toBe(true);
  });

  it('computes remaining characters', () => {
    expect(remainingMemoChars('')).toBe(MEMO_MAX_LENGTH);
    expect(remainingMemoChars('abc')).toBe(MEMO_MAX_LENGTH - 3);
  });
});

describe('toDisplayErrorMessage', () => {
  it('extracts the message from an Error instance', () => {
    expect(toDisplayErrorMessage(new Error('연결 실패'))).toBe('연결 실패');
  });

  it('falls back to a generic Korean message for non-Error throws', () => {
    expect(toDisplayErrorMessage('boom')).toBe('문헌 보관함을 불러오지 못했어요. 다시 시도해 주세요.');
  });

  it('falls back to a generic Korean message for an Error with an empty message', () => {
    expect(toDisplayErrorMessage(new Error(''))).toBe('문헌 보관함을 불러오지 못했어요. 다시 시도해 주세요.');
  });
});
