import { describe, expect, it } from 'vitest';

import { looksLikeApiKey, shouldShowClipboardBanner } from '../../src/renderer/settings/wizard/apiKeyDetect';

describe('looksLikeApiKey', () => {
  describe('gemini', () => {
    it('accepts a plausible AIza-prefixed key', () => {
      expect(looksLikeApiKey('AIzaSyD-fake-key-1234567890-abcdef', 'gemini')).toBe(true);
    });

    it('rejects a key without the AIza prefix', () => {
      expect(looksLikeApiKey('sk-ant-fake-key-1234567890123456789', 'gemini')).toBe(false);
    });

    it('rejects a key that is too short', () => {
      expect(looksLikeApiKey('AIzaShort', 'gemini')).toBe(false);
    });

    it('rejects a key that is too long', () => {
      expect(looksLikeApiKey(`AIza${'x'.repeat(200)}`, 'gemini')).toBe(false);
    });
  });

  describe('claude', () => {
    it('accepts a plausible sk-ant- prefixed key', () => {
      expect(looksLikeApiKey('sk-ant-api03-fake-key-1234567890', 'claude')).toBe(true);
    });

    it('rejects a plain sk- key (openai-shaped, not claude)', () => {
      expect(looksLikeApiKey('sk-fake-key-1234567890abcdef', 'claude')).toBe(false);
    });

    it('rejects a key that is too short', () => {
      expect(looksLikeApiKey('sk-ant-short', 'claude')).toBe(false);
    });
  });

  describe('openai', () => {
    it('accepts a plausible sk- prefixed key', () => {
      expect(looksLikeApiKey('sk-fake-key-1234567890abcdef', 'openai')).toBe(true);
    });

    it('rejects a claude-shaped sk-ant- key', () => {
      expect(looksLikeApiKey('sk-ant-api03-fake-key-1234567890', 'openai')).toBe(false);
    });

    it('rejects a key that is too short', () => {
      expect(looksLikeApiKey('sk-short', 'openai')).toBe(false);
    });
  });

  describe('common rules', () => {
    it('rejects an empty string', () => {
      expect(looksLikeApiKey('', 'gemini')).toBe(false);
      expect(looksLikeApiKey('   ', 'openai')).toBe(false);
    });

    it('rejects text containing internal whitespace', () => {
      expect(looksLikeApiKey('AIzaSyD fake key 1234567890', 'gemini')).toBe(false);
      expect(looksLikeApiKey('sk-ant-api03 fake key 1234567890', 'claude')).toBe(false);
    });

    it('trims surrounding whitespace before validating', () => {
      expect(looksLikeApiKey('  AIzaSyD-fake-key-1234567890-abcdef  ', 'gemini')).toBe(true);
      expect(looksLikeApiKey('\nsk-fake-key-1234567890abcdef\t', 'openai')).toBe(true);
    });
  });
});

describe('shouldShowClipboardBanner', () => {
  it('is true when the key field is empty and the clipboard holds a plausible key', () => {
    expect(
      shouldShowClipboardBanner({
        currentKey: '',
        clipboardText: 'AIzaSyD-fake-key-1234567890-abcdef',
        provider: 'gemini',
        dismissed: false,
      }),
    ).toBe(true);
  });

  it('is false once the key field already has content', () => {
    expect(
      shouldShowClipboardBanner({
        currentKey: 'already-typed',
        clipboardText: 'AIzaSyD-fake-key-1234567890-abcdef',
        provider: 'gemini',
        dismissed: false,
      }),
    ).toBe(false);
  });

  it('is false once the banner has been dismissed', () => {
    expect(
      shouldShowClipboardBanner({
        currentKey: '',
        clipboardText: 'AIzaSyD-fake-key-1234567890-abcdef',
        provider: 'gemini',
        dismissed: true,
      }),
    ).toBe(false);
  });

  it('is false when the clipboard does not look like a key for the given provider', () => {
    expect(
      shouldShowClipboardBanner({
        currentKey: '',
        clipboardText: 'not a key at all',
        provider: 'gemini',
        dismissed: false,
      }),
    ).toBe(false);
  });

  it('treats whitespace-only key field content as empty', () => {
    expect(
      shouldShowClipboardBanner({
        currentKey: '   ',
        clipboardText: 'AIzaSyD-fake-key-1234567890-abcdef',
        provider: 'gemini',
        dismissed: false,
      }),
    ).toBe(true);
  });
});
