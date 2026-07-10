import { describe, expect, it } from 'vitest';

import {
  CITATION_HIGHLIGHT_MS,
  referenceElementId,
  splitCitationSegments,
} from '../../src/renderer/chat/citationLink';

describe('splitCitationSegments', () => {
  it('returns a single plain segment when there is no citation marker', () => {
    expect(splitCitationSegments('그냥 평범한 문장입니다.')).toEqual([
      { text: '그냥 평범한 문장입니다.', citation: null },
    ]);
  });

  it('splits a single trailing citation out from its surrounding text', () => {
    expect(splitCitationSegments('선행 연구에 따르면 효과가 있었다[1].')).toEqual([
      { text: '선행 연구에 따르면 효과가 있었다', citation: null },
      { text: '[1]', citation: 1 },
      { text: '.', citation: null },
    ]);
  });

  it('handles multiple citations in one string, including back-to-back markers', () => {
    expect(splitCitationSegments('여러 연구[2][3]가 있다')).toEqual([
      { text: '여러 연구', citation: null },
      { text: '[2]', citation: 2 },
      { text: '[3]', citation: 3 },
      { text: '가 있다', citation: null },
    ]);
  });

  it('handles a citation at the very start of the text', () => {
    expect(splitCitationSegments('[1] 저자가 주장했다')).toEqual([
      { text: '[1]', citation: 1 },
      { text: ' 저자가 주장했다', citation: null },
    ]);
  });

  it('handles multi-digit citation numbers', () => {
    expect(splitCitationSegments('결과[12]를 보면')).toEqual([
      { text: '결과', citation: null },
      { text: '[12]', citation: 12 },
      { text: '를 보면', citation: null },
    ]);
  });

  it('returns a single plain segment for empty input', () => {
    expect(splitCitationSegments('')).toEqual([{ text: '', citation: null }]);
  });

  it('does not treat non-numeric brackets as citations', () => {
    expect(splitCitationSegments('이것은 [참고]가 아니다')).toEqual([
      { text: '이것은 [참고]가 아니다', citation: null },
    ]);
  });
});

describe('referenceElementId', () => {
  it('produces a stable, distinct id per reference number', () => {
    expect(referenceElementId(1)).toBe('research-ref-1');
    expect(referenceElementId(12)).toBe('research-ref-12');
    expect(referenceElementId(1)).not.toBe(referenceElementId(2));
  });
});

describe('CITATION_HIGHLIGHT_MS', () => {
  it('is a positive duration', () => {
    expect(CITATION_HIGHLIGHT_MS).toBeGreaterThan(0);
  });
});
