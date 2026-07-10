/**
 * Step 2: free (Gemini-only) vs paid mode selection.
 *
 * Copy follows NFR-LLM-006: same output quality either way, but free mode
 * is slower and warns that inputs may be used for Google's model training,
 * so users are told not to upload in-progress manuscripts there.
 */
import type { LlmMode } from '../wizardTypes';

interface ModeStepProps {
  mode: LlmMode | null;
  onSelectMode(mode: LlmMode): void;
}

export function ModeStep({ mode, onSelectMode }: ModeStepProps): JSX.Element {
  return (
    <section className="wizard-mode">
      <h2>어떤 방식으로 시작할까요?</h2>
      <div className="wizard-cards">
        <button
          type="button"
          className={`wizard-card${mode === 'free' ? ' wizard-card-selected' : ''}`}
          aria-pressed={mode === 'free'}
          onClick={() => onSelectMode('free')}
        >
          <h3>무료로 시작하기 (추천)</h3>
          <p>구글 Gemini를 무료로 사용해요.</p>
          <ul>
            <li>결과 품질은 유료 모드와 같아요.</li>
            <li>다만 속도가 조금 느릴 수 있어요.</li>
            <li>
              입력한 내용이 구글 AI 학습에 쓰일 수 있어요. 작성 중인 원고를 그대로 올리는 건 권하지
              않아요.
            </li>
          </ul>
        </button>

        <button
          type="button"
          className={`wizard-card${mode === 'paid' ? ' wizard-card-selected' : ''}`}
          aria-pressed={mode === 'paid'}
          onClick={() => onSelectMode('paid')}
        >
          <h3>유료 모드</h3>
          <p>Claude, Gemini, OpenAI 중 원하시는 서비스의 유료 키를 사용해요.</p>
          <ul>
            <li>속도가 더 빠르고 안정적이에요.</li>
            <li>입력한 내용이 AI 학습에 쓰이지 않아요.</li>
            <li>사용한 만큼 요금이 청구돼요. (월 예상 요금은 다음 화면에서 안내해 드려요.)</li>
          </ul>
        </button>
      </div>
    </section>
  );
}
