/**
 * Section quality-gate panel (Task T19 / SPEC-TSA-001, FR-WRT-002).
 *
 * Pure presentational component driven entirely by injected props/callbacks
 * — no IPC calls of its own (same pattern as `../settings/wizard/Wizard.tsx`).
 * The caller owns `gateResult`/`checking` state and wires `onRunCheck` /
 * `onMarkComplete` to the actual `runQualityGate` engine + completion store.
 *
 * Completion-blocking policy: FR-WRT-002 permits either a hard block or a
 * clear warning. This view uses an explicit two-step warning instead of a
 * hard block, so a non-technical user is never stuck at a dead end: on a
 * failed gate, "완료로 표시" starts disabled; ticking "그래도 완료로
 * 표시하기" surfaces a warning and enables the button.
 */
import { useState } from 'react';

import type { GateResult } from '../../core/writing/qualityGate';
import { isMarkCompleteEnabled, isRunCheckEnabled, resolveGateViewPhase, shouldShowOverride, sortCriteriaForDisplay } from './gateViewLogic';
import './qualityGateView.css';

export interface QualityGateViewProps {
  /** Korean section label shown in headings, e.g. "서론". */
  sectionLabel: string;
  /** null = not checked yet. */
  gateResult: GateResult | null;
  checking: boolean;
  onRunCheck(): void;
  onMarkComplete(): void;
}

export function QualityGateView({
  sectionLabel,
  gateResult,
  checking,
  onRunCheck,
  onMarkComplete,
}: QualityGateViewProps): JSX.Element {
  const [overrideChecked, setOverrideChecked] = useState(false);

  const phase = resolveGateViewPhase(gateResult, checking);
  const showOverride = shouldShowOverride(gateResult, checking);
  const markCompleteEnabled = isMarkCompleteEnabled(gateResult, checking, overrideChecked);
  const runCheckEnabled = isRunCheckEnabled(checking);

  return (
    <section className="gate-view" aria-label={`${sectionLabel} 품질 검사`}>
      {phase === 'idle' && (
        <div className="gate-idle">
          <p className="gate-lead">이 섹션이 논문답게 갖춰졌는지 확인해 드려요.</p>
          <button type="button" className="gate-btn gate-btn-primary" disabled={!runCheckEnabled} onClick={onRunCheck}>
            검사하기
          </button>
        </div>
      )}

      {phase === 'checking' && (
        <div className="gate-checking" role="status">
          <span className="gate-spinner" aria-hidden="true" />
          <p className="gate-lead">꼼꼼히 읽어보는 중이에요…</p>
        </div>
      )}

      {phase === 'result' && gateResult && (
        <div className="gate-result">
          {gateResult.passed ? (
            <div className="gate-banner gate-banner-success" role="status">
              모든 기준을 충족했어요!
            </div>
          ) : (
            <div className="gate-banner gate-banner-warning" role="status">
              아직 보완할 부분이 있어요.
            </div>
          )}

          <p className="gate-summary">{gateResult.summary}</p>

          <ul className="gate-criteria-list">
            {sortCriteriaForDisplay(gateResult.results).map((result) => (
              <li key={result.criterionId} className={`gate-criterion ${result.passed ? 'gate-criterion-pass' : 'gate-criterion-fail'}`}>
                <span className="gate-criterion-icon" aria-hidden="true">
                  {result.passed ? '✅' : '❌'}
                </span>
                <span className="gate-criterion-body">
                  <span className="gate-criterion-feedback">{result.feedback}</span>
                </span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="gate-btn gate-btn-secondary"
            disabled={!runCheckEnabled}
            onClick={onRunCheck}
          >
            다시 검사하기
          </button>

          {showOverride && (
            <div className="gate-override">
              <label className="gate-override-label">
                <input
                  type="checkbox"
                  checked={overrideChecked}
                  onChange={(event) => setOverrideChecked(event.target.checked)}
                />
                그래도 완료로 표시하기
              </label>
              {overrideChecked && (
                <p className="gate-override-warning">
                  아직 보완할 부분이 있어요. 그래도 완료로 표시하려면 아래 확인을 눌러주세요.
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            className="gate-btn gate-btn-primary"
            disabled={!markCompleteEnabled}
            title={
              markCompleteEnabled
                ? undefined
                : '아직 보완할 부분이 있어요. 그래도 완료로 표시하려면 아래 확인을 눌러주세요.'
            }
            onClick={onMarkComplete}
          >
            완료로 표시
          </button>
        </div>
      )}
    </section>
  );
}
