/**
 * Step 4: paste the API key, confirm connectivity, and finish onboarding.
 *
 * Also carries the one-line notice that academic search key registration
 * (NFR-ACAPI-002) is deferred to Settings — out of scope for this sprint.
 */
import { useState } from 'react';

import { apiKeyValidationMessage, validateApiKeyFormat } from '../wizardLogic';
import { useClipboardKeyBanner } from '../useClipboardKeyBanner';
import type { LlmProvider } from '../wizardTypes';

interface KeyInputStepProps {
  apiKey: string;
  /** Which provider's key format to check the clipboard against for the paste-suggestion banner. */
  provider: LlmProvider;
  saving: boolean;
  errorMessage: string | null;
  onChangeKey(key: string): void;
  onConfirm(): void;
  /** Reads the OS clipboard's current plain-text contents. Never logged (see `useClipboardKeyBanner.ts`). */
  readClipboardText(): Promise<string>;
}

export function KeyInputStep({
  apiKey,
  provider,
  saving,
  errorMessage,
  onChangeKey,
  onConfirm,
  readClipboardText,
}: KeyInputStepProps): JSX.Element {
  const [reveal, setReveal] = useState(false);
  const validation = validateApiKeyFormat(apiKey);
  const showFormatHint = apiKey.length > 0 && !validation.ok;
  const clipboardBanner = useClipboardKeyBanner(provider, apiKey, readClipboardText);

  function handlePasteFromClipboard(): void {
    onChangeKey(clipboardBanner.suggestedKey);
    clipboardBanner.accept();
  }

  return (
    <section className="wizard-key-input">
      <h2>발급받은 키를 붙여넣어 주세요</h2>

      {clipboardBanner.visible && (
        <div className="wizard-clipboard-banner" role="status">
          <span>복사하신 키가 있는 것 같아요.</span>
          <button type="button" className="wizard-btn-inline" onClick={handlePasteFromClipboard}>
            붙여넣기
          </button>
          <button type="button" className="wizard-btn-inline-ghost" onClick={clipboardBanner.dismiss}>
            닫기
          </button>
        </div>
      )}

      <div className="wizard-key-field">
        <input
          type={reveal ? 'text' : 'password'}
          value={apiKey}
          onChange={(event) => onChangeKey(event.target.value)}
          placeholder="여기에 키를 붙여넣어 주세요"
          className="wizard-input"
          aria-label="API 키"
          disabled={saving}
        />
        <button
          type="button"
          className="wizard-btn-toggle"
          onClick={() => setReveal((current) => !current)}
        >
          {reveal ? '숨기기' : '보기'}
        </button>
      </div>

      {showFormatHint && !validation.ok && (
        <p className="wizard-hint-error">{apiKeyValidationMessage(validation.reason)}</p>
      )}
      {errorMessage && <p className="wizard-hint-error">{errorMessage}</p>}

      <button
        type="button"
        className="wizard-btn wizard-btn-primary"
        disabled={!validation.ok || saving}
        onClick={onConfirm}
      >
        {saving ? '연결 확인 중...' : '연결 확인'}
      </button>

      <p className="wizard-footnote">
        논문 검색은 바로 쓸 수 있어요. 더 빠르게 쓰고 싶다면 나중에 설정에서 개인 학술 키를 등록할 수
        있어요.
      </p>
    </section>
  );
}
