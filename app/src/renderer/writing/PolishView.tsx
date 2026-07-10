/**
 * Sentence-polishing view (T59, SPEC-TSA-002, FR-WRT-010).
 *
 * Lets the user paste a paragraph and run the academic sentence-polishing
 * engine (`writing:polish`) against it: the fully polished text plus a
 * before/after/reason change log. Pure presentational-plus-local-state
 * component driven by an injected callback — same pattern as
 * `WritingCheckScreen` (this screen owns text/result/running state and
 * performs the one IPC call).
 */
import { useState } from 'react';

import type { PolishResult } from '../../core/writing/polish';
import { canRunPolish, toDisplayErrorMessage } from './polishViewLogic';
import './polishView.css';

export interface PolishViewCallbacks {
  runPolish(text: string): Promise<PolishResult>;
}

export interface PolishViewProps {
  callbacks: PolishViewCallbacks;
}

export function PolishView({ callbacks }: PolishViewProps): JSX.Element {
  const [text, setText] = useState('');
  const [result, setResult] = useState<PolishResult | null>(null);
  const [running, setRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleRun(): Promise<void> {
    if (!canRunPolish(text, running)) {
      return;
    }
    setRunning(true);
    setErrorMessage(null);
    try {
      setResult(await callbacks.runPolish(text));
    } catch (error) {
      setErrorMessage(toDisplayErrorMessage(error));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="polish-view">
      <p className="polish-lead">다듬고 싶은 문단을 붙여넣어 주세요. 국문/영문을 자동으로 판별해요.</p>

      <textarea
        className="polish-textarea"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="여기에 다듬을 문단을 붙여넣어 주세요..."
        rows={12}
        aria-label="다듬을 문단 입력"
      />

      <button
        type="button"
        className="polish-btn polish-btn-primary"
        disabled={!canRunPolish(text, running)}
        onClick={() => void handleRun()}
      >
        {result ? '다시 다듬기' : '다듬기'}
      </button>

      {errorMessage && (
        <p className="polish-error" role="alert">
          {errorMessage}
        </p>
      )}

      {running && (
        <p className="polish-status" role="status">
          문장을 다듬는 중이에요…
        </p>
      )}

      {!running && result && <PolishResultPanel result={result} />}
    </div>
  );
}

function PolishResultPanel({ result }: { result: PolishResult }): JSX.Element {
  if (!result.ok) {
    return (
      <p className="polish-error" role="alert">
        {result.reason}
      </p>
    );
  }

  return (
    <section className="polish-result" aria-label="다듬은 결과">
      <h3 className="polish-result-title">다듬은 글</h3>
      <pre className="polish-result-text">{result.polishedText}</pre>

      <h4 className="polish-changes-title">변경 목록</h4>
      {result.changes.length === 0 ? (
        <p className="polish-changes-empty">이미 학술적인 문장이라 바꾼 부분이 없어요.</p>
      ) : (
        <table className="polish-changes-table">
          <thead>
            <tr>
              <th scope="col">이전</th>
              <th scope="col">이후</th>
              <th scope="col">이유</th>
            </tr>
          </thead>
          <tbody>
            {result.changes.map((change, index) => (
              // eslint-disable-next-line react/no-array-index-key -- changes have no stable id, order is stable within one render
              <tr key={index}>
                <td>{change.before}</td>
                <td>{change.after}</td>
                <td>{change.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
