import { describe, expect, it } from 'vitest';

import {
  apiKeyValidationMessage,
  canProceed,
  createInitialWizardState,
  validateApiKeyFormat,
  wizardReducer,
  type WizardState,
} from '../../src/renderer/settings/wizard/wizardLogic';

describe('createInitialWizardState', () => {
  it('starts at the welcome step with nothing selected yet', () => {
    const state = createInitialWizardState();
    expect(state).toEqual({
      step: 'welcome',
      mode: null,
      provider: null,
      apiKey: '',
      saving: false,
      errorMessage: null,
    });
  });
});

describe('step transitions', () => {
  it('advances from welcome to mode on NEXT', () => {
    const state = createInitialWizardState();
    const next = wizardReducer(state, { type: 'NEXT' });
    expect(next.step).toBe('mode');
  });

  it('blocks NEXT on the mode step until a mode is selected', () => {
    let state = createInitialWizardState();
    state = wizardReducer(state, { type: 'NEXT' }); // welcome -> mode
    const blocked = wizardReducer(state, { type: 'NEXT' });
    expect(blocked.step).toBe('mode');
  });

  it('walks the full happy path welcome -> mode -> keyGuide -> keyInput', () => {
    let state = createInitialWizardState();
    state = wizardReducer(state, { type: 'NEXT' }); // welcome -> mode
    state = wizardReducer(state, { type: 'SELECT_MODE', mode: 'free' });
    state = wizardReducer(state, { type: 'NEXT' }); // mode -> keyGuide
    expect(state.step).toBe('keyGuide');
    state = wizardReducer(state, { type: 'NEXT' }); // keyGuide -> keyInput
    expect(state.step).toBe('keyInput');
  });

  it('does not advance past the last step (keyInput) on NEXT', () => {
    let state: WizardState = {
      ...createInitialWizardState(),
      step: 'keyInput',
      mode: 'free',
      provider: 'gemini',
      apiKey: 'a-valid-key-123',
    };
    state = wizardReducer(state, { type: 'NEXT' });
    expect(state.step).toBe('keyInput');
  });

  it('does nothing on BACK from the first step', () => {
    const state = createInitialWizardState();
    const back = wizardReducer(state, { type: 'BACK' });
    expect(back).toEqual(state);
  });

  it('returns to the previous step on BACK and clears any error message', () => {
    let state = createInitialWizardState();
    state = wizardReducer(state, { type: 'NEXT' }); // welcome -> mode
    state = { ...state, errorMessage: 'leftover error' };
    state = wizardReducer(state, { type: 'BACK' });
    expect(state.step).toBe('welcome');
    expect(state.errorMessage).toBeNull();
  });
});

describe('mode + provider selection', () => {
  it('locks the provider to gemini when free mode is selected', () => {
    const state = wizardReducer(createInitialWizardState(), { type: 'SELECT_MODE', mode: 'free' });
    expect(state.mode).toBe('free');
    expect(state.provider).toBe('gemini');
  });

  it('defaults to gemini when paid mode is first selected, but allows changing provider', () => {
    let state = wizardReducer(createInitialWizardState(), { type: 'SELECT_MODE', mode: 'paid' });
    expect(state.mode).toBe('paid');
    expect(state.provider).toBe('gemini');

    state = wizardReducer(state, { type: 'SELECT_PROVIDER', provider: 'claude' });
    expect(state.provider).toBe('claude');
  });

  it('ignores SELECT_PROVIDER while in free mode, keeping provider pinned to gemini', () => {
    let state = wizardReducer(createInitialWizardState(), { type: 'SELECT_MODE', mode: 'free' });
    state = wizardReducer(state, { type: 'SELECT_PROVIDER', provider: 'openai' });
    expect(state.provider).toBe('gemini');
  });

  it('ignores SELECT_PROVIDER before any mode has been chosen', () => {
    const state = wizardReducer(createInitialWizardState(), { type: 'SELECT_PROVIDER', provider: 'openai' });
    expect(state.provider).toBeNull();
  });
});

describe('validateApiKeyFormat', () => {
  it('rejects an empty key', () => {
    expect(validateApiKeyFormat('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateApiKeyFormat('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects a key containing internal whitespace', () => {
    expect(validateApiKeyFormat('sk-abc 123-key')).toEqual({ ok: false, reason: 'whitespace' });
  });

  it('rejects a key that is too short', () => {
    expect(validateApiKeyFormat('short')).toEqual({ ok: false, reason: 'too-short' });
  });

  it('accepts a plausible-looking key', () => {
    expect(validateApiKeyFormat('AIzaSyD-fake-key-1234567890')).toEqual({ ok: true });
  });

  it('trims surrounding whitespace before validating', () => {
    expect(validateApiKeyFormat('  AIzaSyD-fake-key-1234567890  ')).toEqual({ ok: true });
  });
});

describe('apiKeyValidationMessage', () => {
  it('returns a distinct Korean message for each failure reason', () => {
    const empty = apiKeyValidationMessage('empty');
    const whitespace = apiKeyValidationMessage('whitespace');
    const tooShort = apiKeyValidationMessage('too-short');
    expect(new Set([empty, whitespace, tooShort]).size).toBe(3);
    expect(empty.length).toBeGreaterThan(0);
  });
});

describe('canProceed', () => {
  it('is true on welcome and keyGuide regardless of other state', () => {
    expect(canProceed(createInitialWizardState())).toBe(true);
    expect(canProceed({ ...createInitialWizardState(), step: 'keyGuide' })).toBe(true);
  });

  it('is false on the mode step until a mode is chosen', () => {
    expect(canProceed({ ...createInitialWizardState(), step: 'mode' })).toBe(false);
    expect(canProceed({ ...createInitialWizardState(), step: 'mode', mode: 'free' })).toBe(true);
  });

  it('depends on API key format validity on the keyInput step', () => {
    expect(canProceed({ ...createInitialWizardState(), step: 'keyInput', apiKey: '' })).toBe(false);
    expect(
      canProceed({ ...createInitialWizardState(), step: 'keyInput', apiKey: 'a-valid-key-123' }),
    ).toBe(true);
  });
});

describe('save lifecycle', () => {
  it('SAVE_START marks saving and clears any prior error', () => {
    const state = wizardReducer(
      { ...createInitialWizardState(), step: 'keyInput', errorMessage: 'old error' },
      { type: 'SAVE_START' },
    );
    expect(state.saving).toBe(true);
    expect(state.errorMessage).toBeNull();
  });

  it('SAVE_FAILURE preserves the current step and entered key, and surfaces the message', () => {
    const before: WizardState = {
      ...createInitialWizardState(),
      step: 'keyInput',
      mode: 'free',
      provider: 'gemini',
      apiKey: 'a-valid-key-123',
      saving: true,
    };
    const after = wizardReducer(before, { type: 'SAVE_FAILURE', message: '키가 올바르지 않아요.' });
    expect(after.step).toBe('keyInput');
    expect(after.apiKey).toBe('a-valid-key-123');
    expect(after.saving).toBe(false);
    expect(after.errorMessage).toBe('키가 올바르지 않아요.');
  });

  it('SAVE_SUCCESS clears saving and error state', () => {
    const before: WizardState = {
      ...createInitialWizardState(),
      step: 'keyInput',
      saving: true,
      errorMessage: 'stale',
    };
    const after = wizardReducer(before, { type: 'SAVE_SUCCESS' });
    expect(after.saving).toBe(false);
    expect(after.errorMessage).toBeNull();
  });
});
