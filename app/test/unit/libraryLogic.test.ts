import { describe, expect, it } from 'vitest';

import type { IpcPaperMetadata, IpcSavedPaper } from '../../src/shared/ipc-channels';
import {
  apaCopyMessage,
  buildSavedKeySet,
  formatAuthors,
  formatSavedAt,
  formatYear,
  isAllSelected,
  isMemoTooLong,
  isPaperSaved,
  MEMO_MAX_LENGTH,
  paperKey,
  remainingMemoChars,
  selectedPapers,
  sourceLabel,
  toApaBibliography,
  toDisplayErrorMessage,
  toggleSelectAll,
  toggleSelected,
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

describe('toggleSelected', () => {
  it('adds an id that is not yet selected', () => {
    const result = toggleSelected(new Set(), 'a');
    expect(result.has('a')).toBe(true);
  });

  it('removes an id that is already selected', () => {
    const result = toggleSelected(new Set(['a', 'b']), 'a');
    expect(result.has('a')).toBe(false);
    expect(result.has('b')).toBe(true);
  });

  it('never mutates the set passed in', () => {
    const original = new Set(['a']);
    toggleSelected(original, 'a');
    expect(original.has('a')).toBe(true);
  });
});

describe('isAllSelected / toggleSelectAll', () => {
  const papers = [makeSavedPaper({ id: 'a' }), makeSavedPaper({ id: 'b' })];

  it('is false for an empty library', () => {
    expect(isAllSelected([], new Set())).toBe(false);
  });

  it('is false when only some papers are selected', () => {
    expect(isAllSelected(papers, new Set(['a']))).toBe(false);
  });

  it('is true when every paper is selected', () => {
    expect(isAllSelected(papers, new Set(['a', 'b']))).toBe(true);
  });

  it('selects every paper when the current selection is partial', () => {
    const result = toggleSelectAll(papers, new Set(['a']));
    expect(result.has('a')).toBe(true);
    expect(result.has('b')).toBe(true);
  });

  it('clears the selection when every paper is already selected', () => {
    const result = toggleSelectAll(papers, new Set(['a', 'b']));
    expect(result.size).toBe(0);
  });
});

describe('selectedPapers', () => {
  it('filters down to the selected ids, preserving list order', () => {
    const papers = [makeSavedPaper({ id: 'a' }), makeSavedPaper({ id: 'b' }), makeSavedPaper({ id: 'c' })];
    const result = selectedPapers(papers, new Set(['c', 'a']));
    expect(result.map((p) => p.id)).toEqual(['a', 'c']);
  });

  it('returns an empty array when nothing is selected', () => {
    expect(selectedPapers([makeSavedPaper()], new Set())).toEqual([]);
  });
});

describe('toApaBibliography', () => {
  it('formats a single selected paper as an APA reference line', () => {
    const paper = makeSavedPaper({
      paper: makeMetadata({
        title: 'Metacognition and academic achievement',
        authors: ['Smith, J.'],
        year: 2024,
        venue: 'Journal of Learning',
        url: 'https://openalex.org/W1',
      }),
    });
    expect(toApaBibliography([paper])).toBe(
      'Smith, J. (2024). Metacognition and academic achievement. Journal of Learning. https://openalex.org/W1',
    );
  });

  it('joins multiple selected papers with newlines', () => {
    const papers = [
      makeSavedPaper({ id: 'a', paper: makeMetadata({ title: 'Zebra study', authors: ['Zed, A.'], year: 2020 }) }),
      makeSavedPaper({ id: 'b', paper: makeMetadata({ title: 'Alpha study', authors: ['Ada, B.'], year: 2021 }) }),
    ];
    expect(toApaBibliography(papers).split('\n')).toHaveLength(2);
  });

  it('returns an empty string for an empty selection', () => {
    expect(toApaBibliography([])).toBe('');
  });
});

describe('apaCopyMessage', () => {
  it('embeds the copied count in the Korean confirmation message', () => {
    expect(apaCopyMessage(3)).toBe('3건의 서지를 복사했어요. 논문 참고문헌 목록에 붙여넣으세요.');
  });
});
