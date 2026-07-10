/**
 * Settings-tab card: change LLM provider/mode/key after first run (실사용
 * 피드백 — no re-entry point existed once onboarding finished). This is the
 * wizard's post-onboarding counterpart: it reuses `wizard/wizardLogic.ts`'s
 * key-format validation and `wizard/wizardTypes.ts`'s provider labels/guide
 * URLs rather than redefining them. All state/validation logic lives in
 * `llmProviderCardLogic.ts` (framework-free, unit-tested).
 */
import { useEffect, useState } from 'react';

import type { IpcLlmMode, IpcLlmProvider } from '../../shared/ipc-channels';
import { apiKeyValidationMessage, validateApiKeyFormat } from './wizard/wizardLogic';
import { PROVIDER_KEY_URLS, PROVIDER_LABELS } from './wizard/wizardTypes';
import type { LlmProviderCardState, LlmStatusView } from './llmProviderCardLogic';
import {
  canChangeLlmConnection,
  connectionChangedMessage,
  connectionFailureMessage,
  createInitialLlmProviderCardState,
  describeCurrentStatus,
  isProviderAllowedForMode,
  MODE_LABELS,
  resolveProviderForMode,
} from './llmProviderCardLogic';

export interface LlmProviderCardCallbacks {
  getLlmStatus(): Promise<LlmStatusView>;
  saveProviderAndKey(
    provider: IpcLlmProvider,
    key: string,
    mode: IpcLlmMode,
  ): Promise<{ ok: boolean; message?: string }>;
  openExternal(url: string): void;
}

const PROVIDERS: readonly IpcLlmProvider[] = ['gemini', 'claude', 'openai'];
const MODES: readonly IpcLlmMode[] = ['free', 'paid'];

export function LlmProviderCard({ callbacks }: { callbacks: LlmProviderCardCallbacks }): JSX.Element {
  const [state, setState] = useState<LlmProviderCardState>(createInitialLlmProviderCardState());

  useEffect(() => {
    let cancelled = false;
    callbacks
      .getLlmStatus()
      .then((status) => {
        if (cancelled) return;
        setState((current) => ({ ...current, status, provider: status.provider, mode: status.mode }));
      })
      .catch(() => {
        // Non-critical: the card just keeps its gemini/free default selection until the user saves.
      });
    return () => {
      cancelled = true;
    };
  }, [callbacks]);

  function handleSelectMode(mode: IpcLlmMode): void {
    setState((current) => ({
      ...current,
      mode,
      provider: resolveProviderForMode(mode, current.provider),
      message: null,
      messageKind: null,
    }));
  }

  function handleSelectProvider(provider: IpcLlmProvider): void {
    if (!isProviderAllowedForMode(state.mode, provider)) return;
    setState((current) => ({ ...current, provider, message: null, messageKind: null }));
  }

  async function handleChange(): Promise<void> {
    if (!canChangeLlmConnection(state.apiKey, state.saving)) return;
    const { provider, mode, apiKey } = state;
    setState((current) => ({ ...current, saving: true, message: null, messageKind: null }));
    try {
      const result = await callbacks.saveProviderAndKey(provider, apiKey.trim(), mode);
      if (result.ok) {
        setState((current) => ({
          ...current,
          saving: false,
          apiKey: '',
          status: { provider, mode, hasKey: true },
          message: connectionChangedMessage(provider, PROVIDER_LABELS),
          messageKind: 'success',
        }));
      } else {
        setState((current) => ({
          ...current,
          saving: false,
          message: connectionFailureMessage(result.message),
          messageKind: 'error',
        }));
      }
    } catch (error) {
      setState((current) => ({
        ...current,
        saving: false,
        message: connectionFailureMessage(error instanceof Error ? error.message : undefined),
        messageKind: 'error',
      }));
    }
  }

  const keyValidation = validateApiKeyFormat(state.apiKey);
  const showFormatHint = state.apiKey.length > 0 && !keyValidation.ok;

  return (
    <section className="settings-card settings-card-llm">
      <div className="settings-card-header">
        <h3>🤖 AI 연결 변경</h3>
      </div>
      <p className="settings-card-desc">{describeCurrentStatus(state.status, PROVIDER_LABELS)}</p>

      <div className="settings-llm-group" role="radiogroup" aria-label="AI 제공사 선택">
        {PROVIDERS.map((provider) => (
          <button
            key={provider}
            type="button"
            role="radio"
            aria-checked={state.provider === provider}
            className={`settings-llm-option${state.provider === provider ? ' settings-llm-option-active' : ''}`}
            disabled={!isProviderAllowedForMode(state.mode, provider)}
            onClick={() => handleSelectProvider(provider)}
          >
            {PROVIDER_LABELS[provider]}
          </button>
        ))}
      </div>

      <div className="settings-llm-group" role="radiogroup" aria-label="이용 모드 선택">
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={state.mode === mode}
            className={`settings-llm-option${state.mode === mode ? ' settings-llm-option-active' : ''}`}
            onClick={() => handleSelectMode(mode)}
          >
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>
      {state.mode === 'free' && <p className="settings-card-difficulty">무료 모드는 Gemini만 지원해요.</p>}

      <details className="settings-card-steps">
        <summary>발급 방법 보기</summary>
        <ol>
          <li>{PROVIDER_LABELS[state.provider]} 계정으로 로그인해 주세요.</li>
          <li>&quot;키 만들기&quot; 버튼을 눌러 새 API 키를 만들어 주세요.</li>
          <li>발급된 키를 복사해 아래에 붙여넣어 주세요.</li>
        </ol>
        <button
          type="button"
          className="settings-card-guide-link"
          onClick={() => callbacks.openExternal(PROVIDER_KEY_URLS[state.provider])}
        >
          발급 페이지 열기
        </button>
      </details>

      <div className="settings-card-field">
        <input
          type="password"
          value={state.apiKey}
          onChange={(event) =>
            setState((current) => ({ ...current, apiKey: event.target.value, message: null, messageKind: null }))
          }
          placeholder="여기에 키를 붙여넣어 주세요"
          className="settings-card-input"
          aria-label="AI API 키"
          disabled={state.saving}
        />
        <button
          type="button"
          className="settings-card-save-btn"
          disabled={!canChangeLlmConnection(state.apiKey, state.saving)}
          onClick={() => {
            void handleChange();
          }}
        >
          {state.saving ? '연결 확인 중...' : '연결 확인 후 변경'}
        </button>
      </div>

      {showFormatHint && !keyValidation.ok && (
        <p className="settings-card-message settings-card-message-error">
          {apiKeyValidationMessage(keyValidation.reason)}
        </p>
      )}

      {state.message && (
        <p
          className={`settings-card-message settings-card-message-${state.messageKind ?? 'success'}`}
          role={state.messageKind === 'error' ? 'alert' : 'status'}
        >
          {state.message}
        </p>
      )}
    </section>
  );
}
