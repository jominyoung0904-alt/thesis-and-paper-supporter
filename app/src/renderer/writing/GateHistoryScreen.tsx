/**
 * Quality-gate check history screen (FR-WRT-008): lists every past
 * `quality-gate:run` result saved for the active project, lets the user open
 * a past run to see the exact text + full result, and delete a record.
 *
 * Callback-injected exactly like `WritingCheckScreen` / `ProjectSwitcher` —
 * this component never references `window.thesisApi` directly. Until T59
 * wires this into `App.tsx`/`appCallbacks.ts`, any object matching
 * `GateHistoryScreenCallbacks` satisfies these props (see this task's
 * completion report for the exact `createGateHistoryScreenCallbacks()`
 * wiring snippet).
 */
import { useEffect, useState } from 'react';

import type { GateResult } from '../../core/writing/qualityGate';
import type { GateHistoryRecord, GateHistorySummary } from '../../shared/ipc/gateHistory';
import './gateHistoryScreen.css';

export interface GateHistoryScreenCallbacks {
  listGateHistory(): Promise<GateHistorySummary[]>;
  getGateRecord(id: string): Promise<GateHistoryRecord | null>;
  removeGateRecord(id: string): Promise<boolean>;
}

export interface GateHistoryScreenProps {
  callbacks: GateHistoryScreenCallbacks;
}

function formatRanAt(ranAt: string): string {
  const parsed = new Date(ranAt);
  if (Number.isNaN(parsed.getTime())) return ranAt;
  return parsed.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}

function toDisplayErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : '기록을 불러오지 못했어요. 다시 시도해 주세요.';
}

export function GateHistoryScreen({ callbacks }: GateHistoryScreenProps): JSX.Element {
  const [records, setRecords] = useState<GateHistorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GateHistoryRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  async function loadList(): Promise<void> {
    setLoading(true);
    setListError(null);
    try {
      setRecords(await callbacks.listGateHistory());
    } catch (error) {
      setListError(toDisplayErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadList();
    // Runs once on mount — `callbacks` is a freshly constructed adapter on
    // every render (same pattern as `WritingCheckScreen`'s single IPC call).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSelect(id: string): Promise<void> {
    setSelectedId(id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const record = await callbacks.getGateRecord(id);
      if (!record) {
        setDetailError('이 기록을 찾을 수 없어요. 이미 삭제되었을 수 있어요.');
        return;
      }
      setDetail(record);
    } catch (error) {
      setDetailError(toDisplayErrorMessage(error));
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleRemove(id: string): Promise<void> {
    if (!window.confirm('이 검사 기록을 삭제할까요? 삭제하면 되돌릴 수 없어요.')) {
      return;
    }
    try {
      await callbacks.removeGateRecord(id);
    } catch (error) {
      setListError(toDisplayErrorMessage(error));
      return;
    }
    if (selectedId === id) {
      setSelectedId(null);
      setDetail(null);
    }
    await loadList();
  }

  return (
    <div className="gate-history-screen">
      <p className="gate-history-lead">지금까지 실행한 서론 검사 기록이에요.</p>

      {loading && (
        <p className="gate-history-status" role="status">
          불러오는 중이에요…
        </p>
      )}

      {listError && (
        <p className="gate-history-error" role="alert">
          {listError}
        </p>
      )}

      {!loading && !listError && records.length === 0 && (
        <p className="gate-history-empty">아직 실행한 검사 기록이 없어요.</p>
      )}

      {!loading && records.length > 0 && (
        <ul className="gate-history-list">
          {records.map((record) => (
            <li
              key={record.id}
              className={`gate-history-item${record.id === selectedId ? ' gate-history-item-selected' : ''}`}
            >
              <button
                type="button"
                className="gate-history-item-main"
                onClick={() => void handleSelect(record.id)}
                aria-label={`${formatRanAt(record.ranAt)} 검사 기록 열기`}
              >
                <span className="gate-history-item-icon" aria-hidden="true">
                  {record.passed ? '✅' : '❌'}
                </span>
                <span className="gate-history-item-body">
                  <span className="gate-history-item-date">{formatRanAt(record.ranAt)}</span>
                  <span className="gate-history-item-preview">{record.textPreview}</span>
                </span>
              </button>
              <button
                type="button"
                className="gate-history-item-remove"
                onClick={() => void handleRemove(record.id)}
                aria-label={`${formatRanAt(record.ranAt)} 검사 기록 삭제`}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedId && (
        <GateHistoryDetailPanel loading={detailLoading} error={detailError} record={detail} />
      )}
    </div>
  );
}

interface GateHistoryDetailPanelProps {
  loading: boolean;
  error: string | null;
  record: GateHistoryRecord | null;
}

function GateHistoryDetailPanel({ loading, error, record }: GateHistoryDetailPanelProps): JSX.Element {
  return (
    <section className="gate-history-detail" aria-label="선택한 검사 기록 상세">
      {loading && (
        <p className="gate-history-status" role="status">
          불러오는 중이에요…
        </p>
      )}
      {error && (
        <p className="gate-history-error" role="alert">
          {error}
        </p>
      )}
      {record && (
        <>
          <h3 className="gate-history-detail-title">{formatRanAt(record.ranAt)} 검사 결과</h3>
          <GateHistoryResultSummary result={record.result} />
          <h4 className="gate-history-detail-text-title">검사한 원문</h4>
          <pre className="gate-history-detail-text">{record.text}</pre>
        </>
      )}
    </section>
  );
}

function GateHistoryResultSummary({ result }: { result: GateResult }): JSX.Element {
  return (
    <>
      <p className={result.passed ? 'gate-history-detail-banner-pass' : 'gate-history-detail-banner-fail'}>
        {result.summary}
      </p>
      <ul className="gate-history-detail-criteria">
        {result.results.map((r) => (
          <li
            key={r.criterionId}
            className={r.passed ? 'gate-history-detail-criterion-pass' : 'gate-history-detail-criterion-fail'}
          >
            <span aria-hidden="true">{r.passed ? '✅' : '❌'}</span> {r.feedback}
          </li>
        ))}
      </ul>
    </>
  );
}
