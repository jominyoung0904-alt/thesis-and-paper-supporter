import { describe, expect, it } from 'vitest';

import {
  canChangeLlmConnection,
  connectionChangedMessage,
  connectionFailureMessage,
  createInitialLlmProviderCardState,
  describeCurrentStatus,
  isProviderAllowedForMode,
  MODE_LABELS,
  resolveProviderForMode,
} from '../../src/renderer/settings/llmProviderCardLogic';

const PROVIDER_LABELS = { gemini: 'Google Gemini', claude: 'Anthropic Claude', openai: 'OpenAI' } as const;

describe('createInitialLlmProviderCardState', () => {
  it('defaults to gemini/free with no status loaded yet', () => {
    expect(createInitialLlmProviderCardState()).toEqual({
      status: null,
      provider: 'gemini',
      mode: 'free',
      apiKey: '',
      saving: false,
      message: null,
      messageKind: null,
    });
  });
});

describe('isProviderAllowedForMode', () => {
  it('free mode only allows gemini', () => {
    expect(isProviderAllowedForMode('free', 'gemini')).toBe(true);
    expect(isProviderAllowedForMode('free', 'claude')).toBe(false);
    expect(isProviderAllowedForMode('free', 'openai')).toBe(false);
  });

  it('paid mode allows every provider', () => {
    expect(isProviderAllowedForMode('paid', 'gemini')).toBe(true);
    expect(isProviderAllowedForMode('paid', 'claude')).toBe(true);
    expect(isProviderAllowedForMode('paid', 'openai')).toBe(true);
  });
});

describe('resolveProviderForMode', () => {
  it('locks to gemini when switching to free mode, regardless of the prior provider', () => {
    expect(resolveProviderForMode('free', 'claude')).toBe('gemini');
    expect(resolveProviderForMode('free', 'openai')).toBe('gemini');
  });

  it('keeps the current provider when switching to paid mode', () => {
    expect(resolveProviderForMode('paid', 'claude')).toBe('claude');
    expect(resolveProviderForMode('paid', 'gemini')).toBe('gemini');
  });
});

describe('canChangeLlmConnection', () => {
  it('is true for a valid-format key while not saving', () => {
    expect(canChangeLlmConnection('AIzaSyD-fake-key-1234567890', false)).toBe(true);
  });

  it('is false for an empty, whitespace, or too-short key', () => {
    expect(canChangeLlmConnection('', false)).toBe(false);
    expect(canChangeLlmConnection('has space', false)).toBe(false);
    expect(canChangeLlmConnection('short', false)).toBe(false);
  });

  it('is false while a save is already in flight', () => {
    expect(canChangeLlmConnection('AIzaSyD-fake-key-1234567890', true)).toBe(false);
  });
});

describe('describeCurrentStatus', () => {
  it('shows a loading placeholder before the first status arrives', () => {
    expect(describeCurrentStatus(null, PROVIDER_LABELS)).toContain('확인하고 있어요');
  });

  it('names the provider and mode when a key is registered', () => {
    const message = describeCurrentStatus({ provider: 'gemini', mode: 'free', hasKey: true }, PROVIDER_LABELS);
    expect(message).toContain('Google Gemini');
    expect(message).toContain('무료 모드');
    expect(message).not.toContain('키 미등록');
  });

  it('flags a missing key', () => {
    const message = describeCurrentStatus({ provider: 'claude', mode: 'paid', hasKey: false }, PROVIDER_LABELS);
    expect(message).toContain('Anthropic Claude');
    expect(message).toContain('유료 모드');
    expect(message).toContain('키 미등록');
  });
});

describe('MODE_LABELS', () => {
  it('provides Korean labels for both modes', () => {
    expect(MODE_LABELS.free).toBe('무료 모드');
    expect(MODE_LABELS.paid).toBe('유료 모드');
  });
});

describe('connectionChangedMessage', () => {
  it('names the newly connected provider', () => {
    expect(connectionChangedMessage('openai', PROVIDER_LABELS)).toBe('변경됐어요! 이제 OpenAI로 대화해요.');
  });
});

describe('connectionFailureMessage', () => {
  it('appends the "기존 연결은 그대로예요" reassurance to a given message', () => {
    expect(connectionFailureMessage('키가 올바르지 않아요.')).toBe('키가 올바르지 않아요. 기존 연결은 그대로예요.');
  });

  it('falls back to a generic message when none is given', () => {
    expect(connectionFailureMessage(undefined)).toBe('연결을 확인하지 못했어요. 기존 연결은 그대로예요.');
  });
});
