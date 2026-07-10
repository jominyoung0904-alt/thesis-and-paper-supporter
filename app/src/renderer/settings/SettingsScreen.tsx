/**
 * Settings tab: personal academic-search API key registration (T32,
 * NFR-ACAPI-002 조기 구현). Every card is optional — the app already works
 * without any of these keys (OpenAlex + Semantic Scholar run keyless).
 *
 * Every side effect flows through `SettingsScreenCallbacks`, injected by
 * `appCallbacks.ts` — this component never touches `window.thesisApi`
 * directly, matching `WritingCheckScreen`'s pattern.
 */
import { useEffect, useState } from 'react';

import type { AcademicKeyStatus, IpcAcademicKeyProvider } from '../../shared/ipc-channels';
import type { AcademicKeyCardState } from './settingsScreenLogic';
import {
  ACADEMIC_KEY_CARDS,
  canSaveAcademicKey,
  canSaveDualFieldKey,
  combineNaverCredential,
  createInitialCardState,
} from './settingsScreenLogic';
import './settingsScreen.css';

export interface SettingsScreenCallbacks {
  saveAcademicKey(provider: IpcAcademicKeyProvider, key: string): Promise<{ ok: boolean; message?: string }>;
  getAcademicKeyStatus(): Promise<AcademicKeyStatus>;
  openExternal(url: string): void;
}

export interface SettingsScreenProps {
  callbacks: SettingsScreenCallbacks;
}

type CardStates = Record<IpcAcademicKeyProvider, AcademicKeyCardState>;

function createInitialCardStates(): CardStates {
  return {
    kci: createInitialCardState(),
    scienceon: createInitialCardState(),
    naverdoc: createInitialCardState(),
  };
}

export function SettingsScreen({ callbacks }: SettingsScreenProps): JSX.Element {
  const [status, setStatus] = useState<AcademicKeyStatus | null>(null);
  const [cardStates, setCardStates] = useState<CardStates>(createInitialCardStates());

  useEffect(() => {
    let cancelled = false;
    callbacks
      .getAcademicKeyStatus()
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch(() => {
        // Non-critical: cards just render as "not registered" until the user retries a save.
      });
    return () => {
      cancelled = true;
    };
  }, [callbacks]);

  function updateCard(provider: IpcAcademicKeyProvider, patch: Partial<AcademicKeyCardState>): void {
    setCardStates((current) => ({ ...current, [provider]: { ...current[provider], ...patch } }));
  }

  /** Resolves the exact key string to save for `provider` — dual-field cards join Client ID + Secret with a colon. */
  function resolveKeyToSave(provider: IpcAcademicKeyProvider, card: AcademicKeyCardState): string {
    const isDualField = ACADEMIC_KEY_CARDS.find((c) => c.provider === provider)?.dualField !== undefined;
    return isDualField ? combineNaverCredential(card.input, card.secondInput) : card.input.trim();
  }

  async function handleSave(provider: IpcAcademicKeyProvider): Promise<void> {
    const card = cardStates[provider];
    const isDualField = ACADEMIC_KEY_CARDS.find((c) => c.provider === provider)?.dualField !== undefined;
    const canSave = isDualField
      ? canSaveDualFieldKey(card.input, card.secondInput, card.saving)
      : canSaveAcademicKey(card.input, card.saving);
    if (!canSave) {
      return;
    }

    updateCard(provider, { saving: true, message: null, messageKind: null });
    try {
      const result = await callbacks.saveAcademicKey(provider, resolveKeyToSave(provider, card));
      if (result.ok) {
        updateCard(provider, {
          saving: false,
          input: '',
          secondInput: '',
          message: result.message ?? '저장했어요.',
          messageKind: 'success',
        });
        setStatus((current) => (current ? { ...current, [provider]: true } : current));
      } else {
        updateCard(provider, {
          saving: false,
          message: result.message ?? '저장하지 못했어요.',
          messageKind: 'error',
        });
      }
    } catch (error) {
      updateCard(provider, {
        saving: false,
        message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했어요.',
        messageKind: 'error',
      });
    }
  }

  return (
    <div className="settings-screen">
      <h2>학술 검색 키 (선택)</h2>
      <p className="settings-screen-lead">
        등록하지 않아도 논문 검색은 바로 쓸 수 있어요. 개인 키를 등록하면 검색 범위가 넓어지거나 더 빠르게
        쓸 수 있어요.
      </p>

      <div className="settings-cards">
        {ACADEMIC_KEY_CARDS.map((card) => {
          const cardState = cardStates[card.provider];
          const registered = status?.[card.provider] ?? false;
          const guideUrl = card.guideUrl;

          return (
            <section key={card.provider} className="settings-card">
              <div className="settings-card-header">
                <h3>{card.title}</h3>
                {registered && <span className="settings-card-badge">등록됨</span>}
              </div>
              <p className="settings-card-desc">{card.description}</p>
              <p className="settings-card-difficulty">{card.difficultyNote}</p>
              {card.restrictionNote && <p className="settings-card-restriction">{card.restrictionNote}</p>}

              {guideUrl && (
                <button
                  type="button"
                  className="settings-card-guide-link"
                  onClick={() => callbacks.openExternal(guideUrl)}
                >
                  {card.guideLabel ?? '발급 안내 열기'}
                </button>
              )}

              {card.steps && card.steps.length > 0 && (
                <details className="settings-card-steps">
                  <summary>발급 방법 보기</summary>
                  <ol>
                    {card.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </details>
              )}

              {card.dualField ? (
                <div className="settings-card-field settings-card-field-dual">
                  <input
                    type="text"
                    value={cardState.input}
                    onChange={(event) =>
                      updateCard(card.provider, { input: event.target.value, message: null, messageKind: null })
                    }
                    placeholder={card.dualField.primaryPlaceholder}
                    className="settings-card-input"
                    aria-label={`${card.title} ${card.dualField.primaryLabel}`}
                    disabled={cardState.saving}
                  />
                  <input
                    type="password"
                    value={cardState.secondInput}
                    onChange={(event) =>
                      updateCard(card.provider, { secondInput: event.target.value, message: null, messageKind: null })
                    }
                    placeholder={card.dualField.secondaryPlaceholder}
                    className="settings-card-input"
                    aria-label={`${card.title} ${card.dualField.secondaryLabel}`}
                    disabled={cardState.saving}
                  />
                  <button
                    type="button"
                    className="settings-card-save-btn"
                    disabled={!canSaveDualFieldKey(cardState.input, cardState.secondInput, cardState.saving)}
                    onClick={() => {
                      void handleSave(card.provider);
                    }}
                  >
                    {cardState.saving ? '저장 중...' : '저장'}
                  </button>
                </div>
              ) : (
                <div className="settings-card-field">
                  <input
                    type="password"
                    value={cardState.input}
                    onChange={(event) =>
                      updateCard(card.provider, { input: event.target.value, message: null, messageKind: null })
                    }
                    placeholder="여기에 키를 붙여넣어 주세요"
                    className="settings-card-input"
                    aria-label={`${card.title} API 키`}
                    disabled={cardState.saving}
                  />
                  <button
                    type="button"
                    className="settings-card-save-btn"
                    disabled={!canSaveAcademicKey(cardState.input, cardState.saving)}
                    onClick={() => {
                      void handleSave(card.provider);
                    }}
                  >
                    {cardState.saving ? '저장 중...' : '저장'}
                  </button>
                </div>
              )}

              {cardState.message && (
                <p
                  className={`settings-card-message settings-card-message-${cardState.messageKind ?? 'success'}`}
                  role={cardState.messageKind === 'error' ? 'alert' : 'status'}
                >
                  {cardState.message}
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
