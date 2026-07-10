import { describe, expect, it } from 'vitest';

import type { PaperMetadata } from '../../src/core/academic-api/types';
import { formatApa, formatApaList, isKoreanPaper, isKoreanText } from '../../src/core/library/bibliography';

function makePaper(overrides: Partial<PaperMetadata> = {}): PaperMetadata {
  return {
    source: 'openalex',
    externalId: 'W1',
    title: 'Metacognition and academic achievement',
    authors: ['Smith, J.'],
    year: 2024,
    abstract: null,
    venue: 'Journal of Learning',
    url: 'https://openalex.org/W1',
    citationCount: null,
    ...overrides,
  };
}

describe('isKoreanText / isKoreanPaper', () => {
  it('detects Hangul characters', () => {
    expect(isKoreanText('메타인지')).toBe(true);
    expect(isKoreanText('metacognition')).toBe(false);
  });

  it('classifies a paper as Korean when the title contains Hangul', () => {
    expect(isKoreanPaper(makePaper({ title: '메타인지와 학업 성취', authors: ['Smith, J.'] }))).toBe(true);
  });

  it('classifies a paper as Korean when an author name contains Hangul', () => {
    expect(isKoreanPaper(makePaper({ title: 'Metacognition', authors: ['홍길동'] }))).toBe(true);
  });

  it('classifies a fully English paper as non-Korean', () => {
    expect(isKoreanPaper(makePaper())).toBe(false);
  });
});

describe('formatApa — English', () => {
  it('formats a single-author English paper with venue and url', () => {
    const paper = makePaper();
    expect(formatApa(paper)).toBe(
      'Smith, J. (2024). Metacognition and academic achievement. Journal of Learning. https://openalex.org/W1',
    );
  });

  it('joins two authors with a comma and ampersand', () => {
    const paper = makePaper({ authors: ['Smith, J.', 'Doe, A.'] });
    expect(formatApa(paper)).toBe(
      'Smith, J., & Doe, A. (2024). Metacognition and academic achievement. Journal of Learning. https://openalex.org/W1',
    );
  });

  it('lists three or more authors in full (no 19+ellipsis truncation)', () => {
    const paper = makePaper({ authors: ['Smith, J.', 'Doe, A.', 'Lee, K.', 'Park, S.'] });
    expect(formatApa(paper)).toBe(
      'Smith, J., Doe, A., Lee, K., & Park, S. (2024). Metacognition and academic achievement. Journal of Learning. https://openalex.org/W1',
    );
  });
});

describe('formatApa — Korean', () => {
  it('formats a single-author Korean paper', () => {
    const paper = makePaper({
      title: '메타인지와 학업 성취',
      authors: ['홍길동'],
      venue: '교육심리연구',
      url: 'https://kci.go.kr/1',
    });
    expect(formatApa(paper)).toBe('홍길동 (2024). 메타인지와 학업 성취. 교육심리연구. https://kci.go.kr/1');
  });

  it('joins multiple Korean authors with commas only (no ampersand)', () => {
    const paper = makePaper({
      title: '메타인지와 학업 성취',
      authors: ['홍길동', '김철수', '이영희'],
      venue: '교육심리연구',
      url: 'https://kci.go.kr/1',
    });
    expect(formatApa(paper)).toBe('홍길동, 김철수, 이영희 (2024). 메타인지와 학업 성취. 교육심리연구. https://kci.go.kr/1');
  });
});

describe('formatApa — null field handling', () => {
  it('renders "(n.d.)" when the year is null', () => {
    const paper = makePaper({ year: null });
    expect(formatApa(paper)).toBe(
      'Smith, J. (n.d.). Metacognition and academic achievement. Journal of Learning. https://openalex.org/W1',
    );
  });

  it('omits the venue segment when venue is null', () => {
    const paper = makePaper({ venue: null });
    expect(formatApa(paper)).toBe('Smith, J. (2024). Metacognition and academic achievement. https://openalex.org/W1');
  });

  it('omits the url segment when url is null', () => {
    const paper = makePaper({ url: null });
    expect(formatApa(paper)).toBe('Smith, J. (2024). Metacognition and academic achievement. Journal of Learning.');
  });

  it('omits both venue and url and still renders cleanly when both are null', () => {
    const paper = makePaper({ venue: null, url: null });
    expect(formatApa(paper)).toBe('Smith, J. (2024). Metacognition and academic achievement.');
  });

  it('handles an empty authors array without a dangling separator', () => {
    const paper = makePaper({ authors: [] });
    expect(formatApa(paper)).toBe('(2024). Metacognition and academic achievement. Journal of Learning. https://openalex.org/W1');
  });
});

describe('formatApaList', () => {
  it('returns an empty string for an empty list', () => {
    expect(formatApaList([])).toBe('');
  });

  it('formats a single-paper list identically to formatApa', () => {
    const paper = makePaper();
    expect(formatApaList([paper])).toBe(formatApa(paper));
  });

  it('joins multiple papers with newlines and no blank lines', () => {
    const a = makePaper({ authors: ['Adams, B.'] });
    const b = makePaper({ authors: ['Zeller, C.'] });
    const result = formatApaList([a, b]);
    expect(result.split('\n')).toHaveLength(2);
    expect(result).not.toContain('\n\n');
  });

  it('sorts Korean entries before English entries in a mixed list', () => {
    const en = makePaper({ title: 'Zeta paper', authors: ['Zeller, C.'] });
    const ko = makePaper({ title: '가나다 연구', authors: ['홍길동'], venue: '교육심리연구', url: 'https://kci.go.kr/2' });
    const result = formatApaList([en, ko]);
    const lines = result.split('\n');
    expect(lines[0]).toContain('홍길동');
    expect(lines[1]).toContain('Zeller, C.');
  });

  it('sorts English entries alphabetically by first author', () => {
    const b = makePaper({ title: 'B paper', authors: ['Beta, B.'] });
    const a = makePaper({ title: 'A paper', authors: ['Alpha, A.'] });
    const result = formatApaList([b, a]);
    const lines = result.split('\n');
    expect(lines[0]).toContain('Alpha, A.');
    expect(lines[1]).toContain('Beta, B.');
  });

  it('sorts Korean entries in Hangul order by first author', () => {
    const kim = makePaper({ title: '연구1', authors: ['김철수'] });
    const park = makePaper({ title: '연구2', authors: ['박영희'] });
    const result = formatApaList([park, kim]);
    const lines = result.split('\n');
    expect(lines[0]).toContain('김철수');
    expect(lines[1]).toContain('박영희');
  });
});
