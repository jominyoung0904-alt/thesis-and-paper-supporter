/**
 * Writing-check screen: lets the user paste their introduction section text
 * and run the FR-WRT-001/002 quality gate against it (SPEC-TSA-001 review-fix
 * HIGH#1). Composes the already-built `QualityGateView` with a plain
 * textarea input — this screen owns the text/result/checking state and
 * performs the one IPC call, exactly like `ChatScreen` owns its own state
 * and calls through `ChatScreenCallbacks`.
 *
 * `onMarkComplete` only shows a local confirmation banner for now — actually
 * persisting "이 섹션은 완료됐다" is a future update's scope (out of this
 * task).
 */
import { useState } from 'react';

import type { GateResult } from '../../core/writing/qualityGate';
import type { IpcGateSectionId } from '../../shared/ipc-channels';
import { QualityGateView } from './qualityGateView';
import { canRunQualityCheck, toDisplayErrorMessage } from './writingCheckLogic';
import './writingCheckScreen.css';

export interface WritingCheckCallbacks {
  runQualityGate(sectionId: IpcGateSectionId, text: string): Promise<GateResult>;
}

export interface WritingCheckScreenProps {
  callbacks: WritingCheckCallbacks;
}

const SECTION_ID: IpcGateSectionId = 'introduction';

export function WritingCheckScreen({ callbacks }: WritingCheckScreenProps): JSX.Element {
  const [text, setText] = useState('');
  const [gateResult, setGateResult] = useState<GateResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedBanner, setCompletedBanner] = useState(false);

  async function handleRunCheck(): Promise<void> {
    if (!canRunQualityCheck(text, checking)) {
      return;
    }
    setChecking(true);
    setErrorMessage(null);
    setCompletedBanner(false);
    try {
      const result = await callbacks.runQualityGate(SECTION_ID, text);
      setGateResult(result);
    } catch (error) {
      setErrorMessage(toDisplayErrorMessage(error));
    } finally {
      setChecking(false);
    }
  }

  function handleMarkComplete(): void {
    setCompletedBanner(true);
  }

  return (
    <div className="writing-check-screen">
      <p className="writing-check-lead">작성하신 서론을 붙여넣고 검사해 보세요.</p>

      <textarea
        className="writing-check-textarea"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="여기에 서론 내용을 붙여넣어 주세요..."
        rows={16}
        aria-label="서론 본문 입력"
      />

      {errorMessage && (
        <p className="writing-check-error" role="alert">
          {errorMessage}
        </p>
      )}

      <QualityGateView
        sectionLabel="서론"
        gateResult={gateResult}
        checking={checking}
        onRunCheck={handleRunCheck}
        onMarkComplete={handleMarkComplete}
      />

      {completedBanner && (
        <p className="writing-check-complete-banner" role="status">
          완료로 표시했어요 — 저장은 다음 업데이트에서 지원돼요.
        </p>
      )}
    </div>
  );
}
