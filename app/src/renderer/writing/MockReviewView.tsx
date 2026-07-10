/**
 * Mock peer-review view (T59, SPEC-TSA-002, FR-WRT-011).
 *
 * Lets the user paste a full manuscript and run the single-model "Reviewer 2"
 * role-play (`writing:mock-review`) against it: anticipated committee
 * questions, flagged weaknesses (minor/major), and an overall comment. Every
 * run is auto-saved on the main-process side (see `writingExtHandlers.ts`);
 * this view just bumps `refreshSignal` afterward so the embedded
 * `MockReviewHistoryPanel` refetches.
 */
import { useState } from 'react';

import type { MockReviewOutcome } from '../../core/writing/mockReview';
import { MockReviewHistoryPanel, type MockReviewHistoryPanelCallbacks } from './MockReviewHistoryPanel';
import { canRunMockReview, severityLabel, toDisplayErrorMessage } from './mockReviewViewLogic';
import './mockReviewView.css';

export interface MockReviewViewCallbacks extends MockReviewHistoryPanelCallbacks {
  runMockReview(text: string): Promise<MockReviewOutcome>;
}

export interface MockReviewViewProps {
  callbacks: MockReviewViewCallbacks;
}

export function MockReviewView({ callbacks }: MockReviewViewProps): JSX.Element {
  const [text, setText] = useState('');
  const [result, setResult] = useState<MockReviewOutcome | null>(null);
  const [running, setRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  async function handleRun(): Promise<void> {
    if (!canRunMockReview(text, running)) {
      return;
    }
    setRunning(true);
    setErrorMessage(null);
    try {
      setResult(await callbacks.runMockReview(text));
      // The main process auto-saves this run into history regardless of
      // ok/fail — bump the signal so the embedded panel refetches.
      setRefreshSignal((n) => n + 1);
    } catch (error) {
      setErrorMessage(toDisplayErrorMessage(error));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mock-review-view">
      <p className="mock-review-lead">
        심사받고 싶은 원고 전체를 붙여넣어 주세요. 깐깐한 심사위원이 예상 질문과 약점을 짚어드려요.
      </p>

      <textarea
        className="mock-review-textarea"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="여기에 원고 전체를 붙여넣어 주세요..."
        rows={14}
        aria-label="심사받을 원고 입력"
      />

      <button
        type="button"
        className="mock-review-btn mock-review-btn-primary"
        disabled={!canRunMockReview(text, running)}
        onClick={() => void handleRun()}
      >
        {result ? '다시 심사받기' : '모의 심사 받기'}
      </button>

      {errorMessage && (
        <p className="mock-review-error" role="alert">
          {errorMessage}
        </p>
      )}

      {running && (
        <p className="mock-review-status" role="status">
          꼼꼼히 읽어보는 중이에요…
        </p>
      )}

      {!running && result && <MockReviewResultPanel result={result} />}

      <MockReviewHistoryPanel callbacks={callbacks} refreshSignal={refreshSignal} />
    </div>
  );
}

function MockReviewResultPanel({ result }: { result: MockReviewOutcome }): JSX.Element {
  if (!result.ok) {
    return (
      <p className="mock-review-error" role="alert">
        {result.reason}
      </p>
    );
  }

  return (
    <section className="mock-review-result" aria-label="모의 심사 결과">
      <h3 className="mock-review-section-title">예상 질문</h3>
      <ul className="mock-review-questions">
        {result.questions.map((q, index) => (
          // eslint-disable-next-line react/no-array-index-key -- questions have no stable id
          <li key={index} className="mock-review-question-card">
            <p className="mock-review-question-text">{q.question}</p>
            <p className="mock-review-question-basis">{q.basis}</p>
          </li>
        ))}
      </ul>

      <h3 className="mock-review-section-title">약점</h3>
      <ul className="mock-review-weaknesses">
        {result.weaknesses.map((w, index) => (
          // eslint-disable-next-line react/no-array-index-key -- weaknesses have no stable id
          <li key={index} className="mock-review-weakness-card">
            <span className={`mock-review-badge mock-review-badge-${w.severity}`}>{severityLabel(w.severity)}</span>
            <p className="mock-review-weakness-text">{w.weakness}</p>
            <p className="mock-review-weakness-suggestion">{w.suggestion}</p>
          </li>
        ))}
      </ul>

      <h3 className="mock-review-section-title">총평</h3>
      <p className="mock-review-overall-comment">{result.overallComment}</p>
    </section>
  );
}
