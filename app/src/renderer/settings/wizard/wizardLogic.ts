/**
 * Pure state machine + validation logic for the first-run setup wizard.
 *
 * Deliberately framework-free (no React) so it can be unit tested without a
 * DOM environment (the project's vitest config runs with `environment:
 * 'node'`, see vitest.config.ts). `Wizard.tsx` wires this reducer into
 * `useReducer` and renders the step components around it.
 */

import type { LlmMode, LlmProvider, WizardStepId } from './wizardTypes';
import { WIZARD_STEPS } from './wizardTypes';

export interface WizardState {
  step: WizardStepId;
  mode: LlmMode | null;
  provider: LlmProvider | null;
  apiKey: string;
  /** True while `saveProviderAndKey` is in flight. */
  saving: boolean;
  /** Korean-language error message to show under the key field, if any. */
  errorMessage: string | null;
  /** Client ID entered on the `naverDoc` step (실사용 피드백 #1). */
  naverClientId: string;
  /** Client Secret entered on the `naverDoc` step. */
  naverClientSecret: string;
  /** True while `saveAcademicKey` (naverdoc) is in flight. */
  naverSaving: boolean;
  /** Korean-language error message for the `naverDoc` step, if any. */
  naverErrorMessage: string | null;
  /** Korean-language success message shown briefly before `Wizard.tsx` calls `onComplete()`. */
  naverSuccessMessage: string | null;
}

export function createInitialWizardState(): WizardState {
  return {
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
  };
}

export type WizardAction =
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'SELECT_MODE'; mode: LlmMode }
  | { type: 'SELECT_PROVIDER'; provider: LlmProvider }
  | { type: 'SET_API_KEY'; key: string }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_FAILURE'; message: string }
  | { type: 'SAVE_SUCCESS' }
  | { type: 'SET_NAVER_CLIENT_ID'; value: string }
  | { type: 'SET_NAVER_CLIENT_SECRET'; value: string }
  | { type: 'NAVER_SAVE_START' }
  | { type: 'NAVER_SAVE_FAILURE'; message: string }
  | { type: 'NAVER_SAVE_SUCCESS'; message: string };

/**
 * How long `naverSuccessMessage` stays visible before `Wizard.tsx` calls
 * `onComplete()` — long enough to read "연결됐어요!" before the screen hands
 * off to the main chat view.
 */
export const NAVER_SUCCESS_DISPLAY_MS = 900;

export type ApiKeyValidationReason = 'empty' | 'whitespace' | 'too-short';

/** Minimum plausible length for a pasted API key. A first-pass sanity check only. */
const MIN_API_KEY_LENGTH = 8;

/**
 * First-pass client-side format check. This is NOT a real key validity
 * check — that only happens server-side via `saveProviderAndKey`, which
 * performs an actual connectivity test.
 */
export function validateApiKeyFormat(
  rawKey: string,
): { ok: true } | { ok: false; reason: ApiKeyValidationReason } {
  const trimmed = rawKey.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  if (/\s/.test(trimmed)) {
    return { ok: false, reason: 'whitespace' };
  }
  if (trimmed.length < MIN_API_KEY_LENGTH) {
    return { ok: false, reason: 'too-short' };
  }
  return { ok: true };
}

/** Korean-language message for a given format-validation failure. */
export function apiKeyValidationMessage(reason: ApiKeyValidationReason): string {
  switch (reason) {
    case 'empty':
      return '키를 입력해 주세요.';
    case 'whitespace':
      return '키에 공백이 포함되어 있어요. 다시 확인해 주세요.';
    case 'too-short':
      return '키가 너무 짧아요. 발급받은 키 전체를 붙여넣어 주세요.';
    default:
      return '키 형식을 확인해 주세요.';
  }
}

/** Whether the wizard is allowed to advance past the current step. */
export function canProceed(state: WizardState): boolean {
  switch (state.step) {
    case 'welcome':
      return true;
    case 'mode':
      return state.mode !== null;
    case 'keyGuide':
      return true;
    case 'keyInput':
      return validateApiKeyFormat(state.apiKey).ok;
    case 'naverDoc':
      // Always skippable — the naverdoc connect step is entirely optional
      // (실사용 피드백 #1). This branch is only reached if some future caller
      // ever renders a generic "다음" button here; `Wizard.tsx` itself hides
      // it in favor of the step's own [연결하기]/[나중에 할게요] buttons.
      return true;
    default:
      return false;
  }
}

function stepIndex(step: WizardStepId): number {
  return WIZARD_STEPS.indexOf(step);
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'NEXT': {
      if (!canProceed(state)) {
        return state;
      }
      const nextIndex = stepIndex(state.step) + 1;
      if (nextIndex >= WIZARD_STEPS.length) {
        return state;
      }
      return { ...state, step: WIZARD_STEPS[nextIndex]!, errorMessage: null };
    }
    case 'BACK': {
      const prevIndex = stepIndex(state.step) - 1;
      if (prevIndex < 0) {
        return state;
      }
      return { ...state, step: WIZARD_STEPS[prevIndex]!, errorMessage: null };
    }
    case 'SELECT_MODE': {
      // Free mode is Gemini-only (this sprint) — provider selection is
      // locked so the user can't drift away from the free-tier provider.
      if (action.mode === 'free') {
        return { ...state, mode: 'free', provider: 'gemini' };
      }
      return { ...state, mode: 'paid', provider: state.provider ?? 'gemini' };
    }
    case 'SELECT_PROVIDER': {
      if (state.mode !== 'paid') {
        return state;
      }
      return { ...state, provider: action.provider };
    }
    case 'SET_API_KEY':
      return { ...state, apiKey: action.key, errorMessage: null };
    case 'SAVE_START':
      return { ...state, saving: true, errorMessage: null };
    case 'SAVE_FAILURE':
      return { ...state, saving: false, errorMessage: action.message };
    case 'SAVE_SUCCESS': {
      // Advances to the next step (`naverDoc`) instead of leaving `step`
      // untouched — `Wizard.tsx` used to call `onComplete()` directly right
      // after this action, but the LLM key save is no longer the wizard's
      // last step (실사용 피드백 #1). Falls back to staying put if there is
      // somehow no next step, so this never throws on an out-of-range index.
      const nextIndex = stepIndex(state.step) + 1;
      const nextStep = nextIndex < WIZARD_STEPS.length ? WIZARD_STEPS[nextIndex]! : state.step;
      return { ...state, saving: false, errorMessage: null, step: nextStep };
    }
    case 'SET_NAVER_CLIENT_ID':
      return { ...state, naverClientId: action.value, naverErrorMessage: null };
    case 'SET_NAVER_CLIENT_SECRET':
      return { ...state, naverClientSecret: action.value, naverErrorMessage: null };
    case 'NAVER_SAVE_START':
      return { ...state, naverSaving: true, naverErrorMessage: null, naverSuccessMessage: null };
    case 'NAVER_SAVE_FAILURE':
      return { ...state, naverSaving: false, naverErrorMessage: action.message };
    case 'NAVER_SAVE_SUCCESS':
      return { ...state, naverSaving: false, naverErrorMessage: null, naverSuccessMessage: action.message };
    default:
      return state;
  }
}
