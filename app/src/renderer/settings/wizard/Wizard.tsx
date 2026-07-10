/**
 * First-run setup wizard shell (Task T9 / SPEC-TSA-001).
 *
 * Scope for this sprint: LLM provider selection + API key entry + free/paid
 * guidance only. Academic key registration (NFR-ACAPI-002) is Sprint 2 and
 * is represented only as a one-line notice in `KeyInputStep`.
 *
 * This component performs NO IPC wiring of its own — it is a pure function
 * of `WizardCallbacks`. The caller (central app shell) is responsible for
 * supplying real implementations backed by the preload bridge. See the
 * returned IPC channel list in this task's completion report for what the
 * central wiring needs to expose.
 */
import { useReducer } from 'react';

import { canProceed, createInitialWizardState, wizardReducer } from './wizardLogic';
import { WIZARD_STEPS } from './wizardTypes';
import type { WizardProps } from './wizardTypes';
import { StepIndicator } from './StepIndicator';
import { WelcomeStep } from './steps/WelcomeStep';
import { ModeStep } from './steps/ModeStep';
import { KeyGuideStep } from './steps/KeyGuideStep';
import { KeyInputStep } from './steps/KeyInputStep';
import './wizard.css';

export function Wizard({ callbacks, onComplete }: WizardProps): JSX.Element {
  const [state, dispatch] = useReducer(wizardReducer, createInitialWizardState());

  const currentIndex = WIZARD_STEPS.indexOf(state.step);
  const isFirstStep = currentIndex === 0;
  const isKeyInputStep = state.step === 'keyInput';

  async function handleConfirmKey(): Promise<void> {
    if (!state.provider || !state.mode) {
      return;
    }
    dispatch({ type: 'SAVE_START' });
    try {
      const result = await callbacks.saveProviderAndKey(state.provider, state.apiKey.trim(), state.mode);
      if (result.ok) {
        dispatch({ type: 'SAVE_SUCCESS' });
        onComplete();
      } else {
        dispatch({
          type: 'SAVE_FAILURE',
          message: result.message ?? '연결에 실패했어요. 키를 다시 확인해 주세요.',
        });
      }
    } catch (error) {
      dispatch({
        type: 'SAVE_FAILURE',
        message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했어요.',
      });
    }
  }

  return (
    <div className="wizard">
      <StepIndicator currentIndex={currentIndex} total={WIZARD_STEPS.length} />

      <div className="wizard-step">
        {state.step === 'welcome' && <WelcomeStep />}
        {state.step === 'mode' && (
          <ModeStep mode={state.mode} onSelectMode={(mode) => dispatch({ type: 'SELECT_MODE', mode })} />
        )}
        {state.step === 'keyGuide' && (
          <KeyGuideStep
            mode={state.mode}
            provider={state.provider}
            onSelectProvider={(provider) => dispatch({ type: 'SELECT_PROVIDER', provider })}
            onOpenExternal={callbacks.openExternal}
          />
        )}
        {state.step === 'keyInput' && (
          <KeyInputStep
            apiKey={state.apiKey}
            saving={state.saving}
            errorMessage={state.errorMessage}
            onChangeKey={(key) => dispatch({ type: 'SET_API_KEY', key })}
            onConfirm={handleConfirmKey}
          />
        )}
      </div>

      <div className="wizard-nav">
        {!isFirstStep && (
          <button
            type="button"
            className="wizard-btn wizard-btn-secondary"
            onClick={() => dispatch({ type: 'BACK' })}
          >
            이전
          </button>
        )}
        {!isKeyInputStep && (
          <button
            type="button"
            className="wizard-btn wizard-btn-primary"
            disabled={!canProceed(state)}
            onClick={() => dispatch({ type: 'NEXT' })}
          >
            {state.step === 'welcome' ? '시작하기' : '다음'}
          </button>
        )}
      </div>
    </div>
  );
}
