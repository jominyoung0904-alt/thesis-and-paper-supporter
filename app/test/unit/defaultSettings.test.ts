import { describe, expect, it } from 'vitest';

import { DEFAULT_MODELS } from '../../src/main/config/defaultModels';
import { createDefaultSettings } from '../../src/main/config/defaultSettings';

describe('defaultModels', () => {
  it('ships the current model ids for every provider', () => {
    expect(DEFAULT_MODELS).toEqual({
      gemini: 'gemini-2.5-flash',
      claude: 'claude-sonnet-5',
      openai: 'gpt-5-mini',
    });
  });
});

describe('createDefaultSettings', () => {
  it('pre-fills settings.models with the current DEFAULT_MODELS', () => {
    const settings = createDefaultSettings();

    expect(settings.models).toEqual(DEFAULT_MODELS);
  });

  it('returns a deep-cloned copy — mutating settings.models does not affect the next call', () => {
    const first = createDefaultSettings();
    first.models.claude = 'mutated-value';

    const second = createDefaultSettings();

    expect(second.models.claude).toBe(DEFAULT_MODELS.claude);
  });
});
