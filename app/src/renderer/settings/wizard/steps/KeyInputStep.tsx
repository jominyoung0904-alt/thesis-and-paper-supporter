/**
 * Step 4: paste the API key, confirm connectivity, and finish onboarding.
 *
 * Also carries the one-line notice that academic search key registration
 * (NFR-ACAPI-002) is deferred to Settings — out of scope for this sprint.
 */
import { useState } from 'react';

import { apiKeyValidationMessage, validateApiKeyFormat } from '../wizardLogic';

interface KeyInputStepProps {
  apiKey: string;
  saving: boolean;
  errorMessage: string | null;
  onChangeKey(key: string): void;
  onConfirm(): void;
}

export function KeyInputStep({ apiKey, saving, errorMessage, onChangeKey, onConfirm }: KeyInputStepProps): JSX.Element {
  const [reveal, setReveal] = useState(false);
  const validation = validateApiKeyFormat(apiKey);
  const showFormatHint = apiKey.length > 0 && !validation.ok;

  return (
    <section className="wizard-key-input">
      <h2>발급받은 키를 붙여넣어 주세요</h2>

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
