/**
 * Step 3: how to get an API key.
 *
 * Free mode is Gemini-only, so this renders a single 3-step guide. Paid mode
 * lets the user pick which provider's key they intend to use via tabs.
 */
import { PROVIDER_KEY_URLS, PROVIDER_LABELS } from '../wizardTypes';
import type { LlmMode, LlmProvider } from '../wizardTypes';

interface KeyGuideStepProps {
  mode: LlmMode | null;
  provider: LlmProvider | null;
  onSelectProvider(provider: LlmProvider): void;
  onOpenExternal(url: string): void;
}

const PAID_PROVIDERS: readonly LlmProvider[] = ['gemini', 'claude', 'openai'];

export function KeyGuideStep({ mode, provider, onSelectProvider, onOpenExternal }: KeyGuideStepProps): JSX.Element {
  const activeProvider: LlmProvider = provider ?? 'gemini';

  return (
    <section className="wizard-key-guide">
      <h2>키를 발급받아 볼까요?</h2>

      {mode === 'paid' && (
        <div className="wizard-tabs" role="tablist">
          {PAID_PROVIDERS.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={activeProvider === p}
              className={`wizard-tab${activeProvider === p ? ' wizard-tab-active' : ''}`}
              onClick={() => onSelectProvider(p)}
            >
              {PROVIDER_LABELS[p]}
            </button>
          ))}
        </div>
      )}

      <ol className="wizard-steps-list">
        <li>{PROVIDER_LABELS[activeProvider]} 계정으로 로그인해 주세요.</li>
        <li>&quot;키 만들기&quot; 버튼을 눌러 새 API 키를 만들어 주세요.</li>
        <li>발급된 키를 복사해 주세요. 다음 화면에서 붙여넣을 거예요.</li>
      </ol>

      <button
        type="button"
        className="wizard-btn wizard-btn-secondary"
        onClick={() => onOpenExternal(PROVIDER_KEY_URLS[activeProvider])}
      >
        발급 페이지 열기
      </button>
    </section>
  );
}
