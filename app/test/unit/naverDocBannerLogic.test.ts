import { describe, expect, it } from 'vitest';

import { NAVER_DOC_BANNER_MESSAGE, shouldShowNaverDocBanner } from '../../src/renderer/chat/naverDocBannerLogic';

describe('shouldShowNaverDocBanner (실사용 피드백 #2)', () => {
  it('is false while dismissed, regardless of mode/registration', () => {
    expect(shouldShowNaverDocBanner({ mode: 'research', naverDocRegistered: false, dismissed: true })).toBe(false);
  });

  it('is false outside research mode', () => {
    expect(shouldShowNaverDocBanner({ mode: 'discuss', naverDocRegistered: false, dismissed: false })).toBe(false);
  });

  it('is false while the key status has not resolved yet (null)', () => {
    expect(shouldShowNaverDocBanner({ mode: 'research', naverDocRegistered: null, dismissed: false })).toBe(false);
  });

  it('is false once naverdoc is already registered', () => {
    expect(shouldShowNaverDocBanner({ mode: 'research', naverDocRegistered: true, dismissed: false })).toBe(false);
  });

  it('is true in research mode when naverdoc is not registered and not dismissed', () => {
    expect(shouldShowNaverDocBanner({ mode: 'research', naverDocRegistered: false, dismissed: false })).toBe(true);
  });
});

describe('NAVER_DOC_BANNER_MESSAGE', () => {
  it('mentions the settings tab and that the app still works without connecting', () => {
    expect(NAVER_DOC_BANNER_MESSAGE).toContain('설정 탭');
    expect(NAVER_DOC_BANNER_MESSAGE).toContain('연결 없이도');
  });
});
