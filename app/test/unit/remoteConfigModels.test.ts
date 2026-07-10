import { describe, expect, it } from 'vitest';

import { createDefaultSettings } from '../../src/main/config/defaultSettings';
import { mergeRemoteIntoSettings } from '../../src/main/config/remoteConfig';

// Split out of remoteConfig.test.ts to keep both files under the per-file
// line limit — covers `mergeRemoteIntoSettings`'s `models` override handling.
describe('mergeRemoteIntoSettings — models overrides', () => {
  it('overrides only the model ids provided by the remote payload', () => {
    const settings = createDefaultSettings();

    const merged = mergeRemoteIntoSettings(settings, {
      models: { openai: 'gpt-5.5-mini' },
    });

    expect(merged.models.openai).toBe('gpt-5.5-mini');
    expect(merged.models.claude).toBe(settings.models.claude);
    expect(merged.models.gemini).toBe(settings.models.gemini);
  });

  it('applies endpoint and model overrides from the same payload together', () => {
    const settings = createDefaultSettings();

    const merged = mergeRemoteIntoSettings(settings, {
      endpoints: { claude: 'https://api2.anthropic.com' },
      models: { claude: 'claude-sonnet-6' },
    });

    expect(merged.endpoints.claude).toBe('https://api2.anthropic.com');
    expect(merged.models.claude).toBe('claude-sonnet-6');
  });

  // Security regression (defense against arbitrary value injection): a
  // hostile remote config must not be able to smuggle control characters,
  // scripts, or oversized strings into the model id passed to the LLM APIs.
  it('drops a model override containing characters outside the allowlisted charset', () => {
    const settings = createDefaultSettings();

    const merged = mergeRemoteIntoSettings(settings, {
      models: { openai: 'gpt-5-mini; rm -rf /' },
    });

    expect(merged.models.openai).toBe(settings.models.openai);
  });

  it('drops an empty-string model override', () => {
    const settings = createDefaultSettings();

    const merged = mergeRemoteIntoSettings(settings, {
      models: { gemini: '' },
    });

    expect(merged.models.gemini).toBe(settings.models.gemini);
  });

  it('drops a model override longer than 100 characters', () => {
    const settings = createDefaultSettings();
    const tooLong = 'a'.repeat(101);

    const merged = mergeRemoteIntoSettings(settings, {
      models: { claude: tooLong },
    });

    expect(merged.models.claude).toBe(settings.models.claude);
  });

  it('drops a non-string model override', () => {
    const settings = createDefaultSettings();

    const merged = mergeRemoteIntoSettings(settings, {
      models: { openai: 12345 as unknown as string },
    });

    expect(merged.models.openai).toBe(settings.models.openai);
  });

  it('ignores an unknown provider key under models', () => {
    const settings = createDefaultSettings();

    const merged = mergeRemoteIntoSettings(settings, {
      models: { grok: 'grok-99' } as unknown as Record<string, string>,
    });

    expect(merged.models).toEqual(settings.models);
  });

  it('keeps a valid override while dropping an invalid one in the same payload', () => {
    const settings = createDefaultSettings();

    const merged = mergeRemoteIntoSettings(settings, {
      models: { claude: 'claude-sonnet-6', openai: '<script>' },
    });

    expect(merged.models.claude).toBe('claude-sonnet-6');
    expect(merged.models.openai).toBe(settings.models.openai);
  });

  it('accepts model ids using the full allowlisted charset (letters, digits, . _ : -)', () => {
    const settings = createDefaultSettings();

    const merged = mergeRemoteIntoSettings(settings, {
      models: { gemini: 'gemini-2.5-flash-001:v2_beta.1' },
    });

    expect(merged.models.gemini).toBe('gemini-2.5-flash-001:v2_beta.1');
  });
});
