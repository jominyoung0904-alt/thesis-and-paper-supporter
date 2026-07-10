import { describe, expect, it } from 'vitest';

import {
  SLOW_RESPONSE_DELAY_MS,
  SLOW_RESPONSE_MESSAGE,
  shouldShowSlowResponseBanner,
} from '../../src/renderer/chat/slowResponseLogic';

describe('SLOW_RESPONSE_DELAY_MS', () => {
  it('is 30 seconds', () => {
    expect(SLOW_RESPONSE_DELAY_MS).toBe(30_000);
  });
});

describe('shouldShowSlowResponseBanner', () => {
  it('is false while idle (null elapsed)', () => {
    expect(shouldShowSlowResponseBanner(null)).toBe(false);
  });

  it('is false before the threshold', () => {
    expect(shouldShowSlowResponseBanner(0)).toBe(false);
    expect(shouldShowSlowResponseBanner(SLOW_RESPONSE_DELAY_MS - 1)).toBe(false);
  });

  it('is true at and after the threshold', () => {
    expect(shouldShowSlowResponseBanner(SLOW_RESPONSE_DELAY_MS)).toBe(true);
    expect(shouldShowSlowResponseBanner(SLOW_RESPONSE_DELAY_MS + 5_000)).toBe(true);
  });
});

describe('SLOW_RESPONSE_MESSAGE', () => {
  it('mentions the free-tier rate limit and in-order processing', () => {
    expect(SLOW_RESPONSE_MESSAGE).toContain('무료 등급');
    expect(SLOW_RESPONSE_MESSAGE).toContain('순서대로');
  });

  it('mentions the app-restart fallback for impatient users', () => {
    expect(SLOW_RESPONSE_MESSAGE).toContain('껐다');
  });
});
