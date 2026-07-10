/**
 * "지난 심사 이력" panel embedded inside `MockReviewView` (T59, SPEC-TSA-002,
 * FR-WRT-011). Lists every saved mock-review run for the active project, lets
 * the user open a past run's full result, and delete it.
 *
 * Reloads whenever `refreshSignal` changes — `MockReviewView` bumps it after
 * every successful `runMockReview()` call (auto-save happens on the main
 * process side; this panel only needs to know "go refetch"). Same
 * callback-injected, IPC-agnostic shape as `GateHistoryScreen`.
 */
import { useEffect, useState } from 'react';

import type { MockReviewHistoryRecord, MockReviewHistorySummary } from '../../shared/ipc/writingExt';
import { formatRanAt, severityLabel, toDisplayErrorMessage } from './mockReviewViewLogic';
import './mockReviewHistoryPanel.css';

export interface MockReviewHistoryPanelCallbacks {
  listMockReviewHistory(): Promise<MockReviewHistorySummary[]>;
  getMockReviewRecord(id: string): Promise<MockReviewHistoryRecord | null>;
  removeMockReviewRecord(id: string): Promise<boolean>;
}

export interface MockReviewHistoryPanelProps {
  callbacks: MockReviewHistoryPanelCallbacks;
  refreshSignal: number;
}

export function MockReviewHistoryPanel({ callbacks, refreshSignal }: MockReviewHistoryPanelProps): JSX.Element {
  const [records, setRecords] = useState<MockReviewHistorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MockReviewHistoryRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  async function loadList(): Promise<void> {
    setLoading(true);
    setListError(null);
    try {
      setRecords(await callbacks.listMockReviewHistory());
    } catch (error) {
      setListError(toDisplayErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadList();
    // Reruns on every refreshSignal bump (new run saved) — `callbacks` is a
    // freshly constructed adapter on every render, so it is deliberately
    // excluded, same as `GateHistoryScreen`'s mount-only effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  async function handleSelect(id: string): Promise<void> {
    setSelectedId(id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const record = await callbacks.getMockReviewRecord(id);
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
    if (!window.confirm('이 심사 기록을 삭제할까요? 삭제하면 되돌릴 수 없어요.')) {
      return;
    }
    try {
      await callbacks.removeMockReviewRecord(id);
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
    <section className="mock-review-history" aria-label="지난 모의 심사 이력">
      <h3 className="mock-review-history-title">지난 심사 이력</h3>

      {loading && (
        <p className="mock-review-status" role="status">
          불러오는 중이에요…
        </p>
      )}
      {listError && (
        <p className="mock-review-error" role="alert">
          {listError}
        </p>
      )}
      {!loading && !listError && records.length === 0 && (
        <p className="mock-review-history-empty">아직 실행한 모의 심사가 없어요.</p>
      )}

      {!loading && records.length > 0 && (
        <ul className="mock-review-history-list">
          {records.map((record) => (
            <li
              key={record.id}
              className={`mock-review-history-item${record.id === selectedId ? ' mock-review-history-item-selected' : ''}`}
            >
              <button
                type="button"
                className="mock-review-history-item-main"
                onClick={() => void handleSelect(record.id)}
                aria-label={`${formatRanAt(record.ranAt)} 심사 기록 열기`}
              >
                <span aria-hidden="true">{record.ok ? '🧑‍⚖️' : '⚠️'}</span>
                <span className="mock-review-history-item-body">
                  <span className="mock-review-history-item-date">{formatRanAt(record.ranAt)}</span>
                  <span className="mock-review-history-item-preview">{record.textPreview}</span>
                </span>
              </button>
              <button
                type="button"
                className="mock-review-history-item-remove"
                onClick={() => void handleRemove(record.id)}
                aria-label={`${formatRanAt(record.ranAt)} 심사 기록 삭제`}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedId && <HistoryDetail loading={detailLoading} error={detailError} record={detail} />}
    </section>
  );
}

function HistoryDetail({
  loading,
  error,
  record,
}: {
  loading: boolean;
  error: string | null;
  record: MockReviewHistoryRecord | null;
}): JSX.Element {
  return (
    <div className="mock-review-history-detail">
      {loading && (
        <p className="mock-review-status" role="status">
          불러오는 중이에요…
        </p>
      )}
      {error && (
        <p className="mock-review-error" role="alert">
          {error}
        </p>
      )}
      {record?.result.ok && (
        <>
          <p className="mock-review-history-detail-comment">{record.result.overallComment}</p>
          <ul className="mock-review-history-detail-weaknesses">
            {record.result.weaknesses.map((w, index) => (
              // eslint-disable-next-line react/no-array-index-key -- weaknesses have no stable id
              <li key={index}>
                <span className={`mock-review-badge mock-review-badge-${w.severity}`}>{severityLabel(w.severity)}</span>{' '}
                {w.weakness}
              </li>
            ))}
          </ul>
        </>
      )}
      {record && !record.result.ok && (
        <p className="mock-review-error" role="alert">
          {record.result.reason}
        </p>
      )}
    </div>
  );
}
