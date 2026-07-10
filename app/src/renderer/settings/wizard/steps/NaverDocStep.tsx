/**
 * Step 5 (실사용 피드백 #1): offers to connect Naver 전문자료 검색 right after
 * the LLM key is confirmed working, since national (Korean) thesis/report
 * coverage meaningfully improves once it's registered. Entirely optional —
 * skipping leaves the app fully usable (OpenAlex/Semantic Scholar, plus
 * kci/scienceon if the user later registers them from Settings).
 *
 * Reuses `SettingsScreen`'s naverdoc card copy (guide URL/label/steps) and
 * its dual-field save gate (`canSaveDualFieldKey`) from
 * `settingsScreenLogic.ts` so the two entry points never drift on wording or
 * validation rules.
 */
import { ACADEMIC_KEY_CARDS, canSaveDualFieldKey } from '../../settingsScreenLogic';

const NAVER_CARD = ACADEMIC_KEY_CARDS.find((card) => card.provider === 'naverdoc')!;

interface NaverDocStepProps {
  clientId: string;
  clientSecret: string;
  saving: boolean;
  errorMessage: string | null;
  successMessage: string | null;
  onChangeClientId(value: string): void;
  onChangeClientSecret(value: string): void;
  onOpenExternal(url: string): void;
  onConnect(): void;
  onSkip(): void;
}

export function NaverDocStep({
  clientId,
  clientSecret,
  saving,
  errorMessage,
  successMessage,
  onChangeClientId,
  onChangeClientSecret,
  onOpenExternal,
  onConnect,
  onSkip,
}: NaverDocStepProps): JSX.Element {
  const canConnect = canSaveDualFieldKey(clientId, clientSecret, saving);

  return (
    <section className="wizard-naver-doc">
      <h2>네이버 전문자료도 연결할까요?</h2>
      <p className="wizard-naver-lead">
        논문 검색은 연결 없이도 되지만, 네이버를 연결하면 국내 학위논문·보고서까지 함께 찾아드려요. 무료이고
        1분이면 돼요.
      </p>

      {NAVER_CARD.guideUrl && (
        <button
          type="button"
          className="wizard-btn wizard-btn-secondary"
          onClick={() => onOpenExternal(NAVER_CARD.guideUrl!)}
        >
          {NAVER_CARD.guideLabel ?? '발급 안내 열기'}
        </button>
      )}

      {NAVER_CARD.steps && NAVER_CARD.steps.length > 0 && (
        <ol className="wizard-steps-list">
          {NAVER_CARD.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}

      <div className="wizard-key-field wizard-key-field-dual">
        <input
          type="text"
          value={clientId}
          onChange={(event) => onChangeClientId(event.target.value)}
          placeholder="Client ID를 입력해 주세요"
          className="wizard-input"
          aria-label="네이버 Client ID"
          disabled={saving}
        />
        <input
          type="password"
          value={clientSecret}
          onChange={(event) => onChangeClientSecret(event.target.value)}
          placeholder="Client Secret을 입력해 주세요"
          className="wizard-input"
          aria-label="네이버 Client Secret"
          disabled={saving}
        />
      </div>

      {errorMessage && <p className="wizard-hint-error">{errorMessage}</p>}
      {successMessage && <p className="wizard-hint-success">{successMessage}</p>}

      <div className="wizard-naver-actions">
        <button type="button" className="wizard-btn wizard-btn-secondary" disabled={saving} onClick={onSkip}>
          나중에 할게요
        </button>
        <button type="button" className="wizard-btn wizard-btn-primary" disabled={!canConnect} onClick={onConnect}>
          {saving ? '연결 확인 중...' : '연결하기'}
        </button>
      </div>
    </section>
  );
}
