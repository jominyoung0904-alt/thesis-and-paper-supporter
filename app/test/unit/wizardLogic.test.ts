import { describe, expect, it } from 'vitest';

import {
  apiKeyValidationMessage,
  canProceed,
  createInitialWizardState,
  NAVER_SUCCESS_DISPLAY_MS,
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
      naverClientId: '',
      naverClientSecret: '',
      naverSaving: false,
      naverErrorMessage: null,
      naverSuccessMessage: null,
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

  it('walks the full happy path welcome -> mode -> keyGuide -> keyInput -> naverDoc via SAVE_SUCCESS', () => {
    let state = createInitialWizardState();
    state = wizardReducer(state, { type: 'NEXT' }); // welcome -> mode
    state = wizardReducer(state, { type: 'SELECT_MODE', mode: 'free' });
    state = wizardReducer(state, { type: 'NEXT' }); // mode -> keyGuide
    expect(state.step).toBe('keyGuide');
    state = wizardReducer(state, { type: 'NEXT' }); // keyGuide -> keyInput
    expect(state.step).toBe('keyInput');
    // The LLM key confirm button dispatches SAVE_SUCCESS (not NEXT) — it now
    // advances to `naverDoc` instead of completing the wizard directly
    // (실사용 피드백 #1; see `Wizard.tsx`'s `handleConfirmKey`).
    state = wizardReducer(state, { type: 'SAVE_SUCCESS' });
    expect(state.step).toBe('naverDoc');
  });

  it('does not advance past the last step (naverDoc) on NEXT', () => {
    let state: WizardState = {
      ...createInitialWizardState(),
      step: 'naverDoc',
      mode: 'free',
      provider: 'gemini',
      apiKey: 'a-valid-key-123',
    };
    state = wizardReducer(state, { type: 'NEXT' });
    expect(state.step).toBe('naverDoc');
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

  it('is always true on the naverDoc step — it is skippable regardless of input', () => {
    expect(canProceed({ ...createInitialWizardState(), step: 'naverDoc' })).toBe(true);
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

  it('SAVE_SUCCESS clears saving/error state and advances from keyInput to naverDoc', () => {
    const before: WizardState = {
      ...createInitialWizardState(),
      step: 'keyInput',
      saving: true,
      errorMessage: 'stale',
    };
    const after = wizardReducer(before, { type: 'SAVE_SUCCESS' });
    expect(after.saving).toBe(false);
    expect(after.errorMessage).toBeNull();
    expect(after.step).toBe('naverDoc');
  });

  it('SAVE_SUCCESS on the last step (naverDoc) stays put instead of advancing out of range', () => {
    const before: WizardState = { ...createInitialWizardState(), step: 'naverDoc', saving: true };
    const after = wizardReducer(before, { type: 'SAVE_SUCCESS' });
    expect(after.step).toBe('naverDoc');
  });
});

describe('naverDoc step lifecycle (실사용 피드백 #1)', () => {
  it('SET_NAVER_CLIENT_ID/SECRET update their fields and clear any prior error', () => {
    let state: WizardState = { ...createInitialWizardState(), step: 'naverDoc', naverErrorMessage: 'old error' };
    state = wizardReducer(state, { type: 'SET_NAVER_CLIENT_ID', value: 'my-client-id' });
    expect(state.naverClientId).toBe('my-client-id');
    expect(state.naverErrorMessage).toBeNull();

    state = { ...state, naverErrorMessage: 'old error again' };
    state = wizardReducer(state, { type: 'SET_NAVER_CLIENT_SECRET', value: 'my-secret' });
    expect(state.naverClientSecret).toBe('my-secret');
    expect(state.naverErrorMessage).toBeNull();
  });

  it('NAVER_SAVE_START marks naverSaving and clears any prior error/success message', () => {
    const before: WizardState = {
      ...createInitialWizardState(),
      step: 'naverDoc',
      naverErrorMessage: 'old error',
      naverSuccessMessage: 'stale success',
    };
    const after = wizardReducer(before, { type: 'NAVER_SAVE_START' });
    expect(after.naverSaving).toBe(true);
    expect(after.naverErrorMessage).toBeNull();
    expect(after.naverSuccessMessage).toBeNull();
  });

  it('NAVER_SAVE_FAILURE clears naverSaving and surfaces the message, preserving entered input', () => {
    const before: WizardState = {
      ...createInitialWizardState(),
      step: 'naverDoc',
      naverClientId: 'id-1',
      naverClientSecret: 'secret-1',
      naverSaving: true,
    };
    const after = wizardReducer(before, { type: 'NAVER_SAVE_FAILURE', message: 'Client ID/Secret을 다시 확인해 주세요.' });
    expect(after.naverSaving).toBe(false);
    expect(after.naverErrorMessage).toBe('Client ID/Secret을 다시 확인해 주세요.');
    expect(after.naverClientId).toBe('id-1');
    expect(after.naverClientSecret).toBe('secret-1');
  });

  it('NAVER_SAVE_SUCCESS clears naverSaving/error and surfaces the success message', () => {
    const before: WizardState = { ...createInitialWizardState(), step: 'naverDoc', naverSaving: true };
    const after = wizardReducer(before, { type: 'NAVER_SAVE_SUCCESS', message: '연결됐어요!' });
    expect(after.naverSaving).toBe(false);
    expect(after.naverErrorMessage).toBeNull();
    expect(after.naverSuccessMessage).toBe('연결됐어요!');
  });
});

describe('NAVER_SUCCESS_DISPLAY_MS', () => {
  it('is a short, positive delay so the success message is briefly visible', () => {
    expect(NAVER_SUCCESS_DISPLAY_MS).toBeGreaterThan(0);
    expect(NAVER_SUCCESS_DISPLAY_MS).toBeLessThan(3000);
  });
});
