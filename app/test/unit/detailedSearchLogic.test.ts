import { describe, expect, it } from 'vitest';

import {
  DETAILED_SEARCH_INFO_MESSAGE,
  DETAILED_SEARCH_LOCKED_MESSAGE,
  isDetailedSearchAvailable,
  shouldShowDetailedSearchToggle,
} from '../../src/renderer/chat/detailedSearchLogic';

describe('shouldShowDetailedSearchToggle', () => {
  it('is false outside research mode', () => {
    expect(shouldShowDetailedSearchToggle({ mode: 'discuss' })).toBe(false);
  });

  it('is true in research mode', () => {
    expect(shouldShowDetailedSearchToggle({ mode: 'research' })).toBe(true);
  });
});

describe('isDetailedSearchAvailable', () => {
  it('is false while the LLM status has not resolved yet (null)', () => {
    expect(isDetailedSearchAvailable(null)).toBe(false);
  });

  it('is false on free mode', () => {
    expect(isDetailedSearchAvailable('free')).toBe(false);
  });

  it('is true on paid mode', () => {
    expect(isDetailedSearchAvailable('paid')).toBe(true);
  });
});

describe('DETAILED_SEARCH_LOCKED_MESSAGE', () => {
  it('explains the paid-mode requirement and what the toggle does', () => {
    expect(DETAILED_SEARCH_LOCKED_MESSAGE).toContain('유료 모드');
    expect(DETAILED_SEARCH_LOCKED_MESSAGE).toContain('한 번 더');
  });
});

describe('DETAILED_SEARCH_INFO_MESSAGE', () => {
  it('mentions the Gemini deep-research comparison and domestic-paper parity', () => {
    expect(DETAILED_SEARCH_INFO_MESSAGE).toContain('딥리서치');
    expect(DETAILED_SEARCH_INFO_MESSAGE).toContain('국내 논문');
  });
});
