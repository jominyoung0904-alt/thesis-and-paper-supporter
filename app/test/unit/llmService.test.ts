import { describe, expect, it } from 'vitest';

import { DEFAULT_MODELS } from '../../src/main/config/defaultModels';
import { createDefaultSettings } from '../../src/main/config/defaultSettings';
import type { AppSettings } from '../../src/main/config/defaultSettings';
import type { KeyStore } from '../../src/main/config/keyStore';
import { createLlmService } from '../../src/main/ipc/llmService';

// `getModel()` never touches the key store, so an empty stub satisfying the
// `KeyStore` public shape is enough for these tests.
const STUB_KEY_STORE = {} as KeyStore;

describe('llmService.getModel', () => {
  it('returns the default model id when settings.models has no override', () => {
    const settings = createDefaultSettings();
    const service = createLlmService(() => settings, STUB_KEY_STORE);

    expect(service.getModel()).toBe(DEFAULT_MODELS[settings.llm.provider]);
  });

  it('returns settings.models[provider] when a per-provider override is set', () => {
    const settings: AppSettings = createDefaultSettings();
    settings.llm.provider = 'claude';
    settings.models.claude = 'claude-custom-override';

    const service = createLlmService(() => settings, STUB_KEY_STORE);

    expect(service.getModel()).toBe('claude-custom-override');
  });

  it('reflects the currently selected provider, not just the first override', () => {
    const settings: AppSettings = createDefaultSettings();
    settings.models = {
      gemini: 'gemini-override',
      claude: 'claude-override',
      openai: 'openai-override',
    };
    settings.llm.provider = 'openai';

    const service = createLlmService(() => settings, STUB_KEY_STORE);

    expect(service.getModel()).toBe('openai-override');
  });
});
