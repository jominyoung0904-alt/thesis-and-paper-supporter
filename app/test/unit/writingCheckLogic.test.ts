import { describe, expect, it } from 'vitest';

import { canRunQualityCheck, toDisplayErrorMessage } from '../../src/renderer/writing/writingCheckLogic';

describe('canRunQualityCheck', () => {
  it('is enabled with non-empty text and no check in flight', () => {
    expect(canRunQualityCheck('서론 본문입니다.', false)).toBe(true);
  });

  it('is disabled while a check is already running', () => {
    expect(canRunQualityCheck('서론 본문입니다.', true)).toBe(false);
  });

  it('is disabled for empty text', () => {
    expect(canRunQualityCheck('', false)).toBe(false);
  });

  it('is disabled for whitespace-only text', () => {
    expect(canRunQualityCheck('   \n\t  ', false)).toBe(false);
  });
});

describe('toDisplayErrorMessage', () => {
  it('extracts the message from an Error instance', () => {
    expect(toDisplayErrorMessage(new Error('AI 기능을 사용하려면 먼저 설정에서 API 키를 등록해 주세요.'))).toBe(
      'AI 기능을 사용하려면 먼저 설정에서 API 키를 등록해 주세요.',
    );
  });

  it('falls back to a generic Korean message for a non-Error thrown value', () => {
    expect(toDisplayErrorMessage('boom')).toBe('검사 중 문제가 생겼어요. 다시 시도해 주세요.');
  });

  it('falls back to a generic Korean message for an Error with an empty message', () => {
    expect(toDisplayErrorMessage(new Error(''))).toBe('검사 중 문제가 생겼어요. 다시 시도해 주세요.');
  });
});
