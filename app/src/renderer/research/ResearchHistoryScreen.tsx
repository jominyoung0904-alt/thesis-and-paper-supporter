/**
 * Research-history list/detail screen (FR-RSH-002): lists every saved
 * deep-research run for the active project, lets the user re-open one to
 * read its full report + reference lists, and delete a record.
 *
 * Callback-injected exactly like `GateHistoryScreen` / `WritingCheckScreen` —
 * this component never references `window.thesisApi` directly. Until T62
 * wires this into `App.tsx`, any object matching `ResearchHistoryScreenCallbacks`
 * (already defined in `appCallbacks.ts`) satisfies the `callbacks` prop.
 *
 * Detail view reuses `ResearchProgress` (chat/ResearchProgress.tsx) for the
 * actual report + citation + reference rendering — see
 * `researchHistoryLogic.ts`'s `toResearchRunState` for the adapter.
 *
 * Out of scope for this task: a "보관함에 저장" button on cited/related papers
 * (FR-RSH-003) would go inside the detail view, right after the
 * `<ResearchProgress>` render below — left for T51/T62 to wire once T45's
 * library-save UI extension to `ResearchProgress` lands, to avoid two tasks
 * editing the same render path in parallel.
 */
import { useEffect, useState } from 'react';

import type { ResearchHistoryScreenCallbacks } from '../appCallbacks';
import { ResearchProgress } from '../chat/ResearchProgress';
import type { ResearchHistoryRecord, ResearchHistorySummary } from '../../shared/ipc/researchHistory';
import { formatRanAt, sortSummariesByRecency, summarizeCitedCount, toDisplayErrorMessage, toResearchRunState } from './researchHistoryLogic';
import './researchHistory.css';

export interface ResearchHistoryScreenProps {
  callbacks: ResearchHistoryScreenCallbacks;
  /** Opens a URL in the user's default external browser, delegated to the host shell. */
  openLink: (url: string) => void;
}

export function ResearchHistoryScreen({ callbacks, openLink }: ResearchHistoryScreenProps): JSX.Element {
  const [records, setRecords] = useState<ResearchHistorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ResearchHistoryRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  async function loadList(): Promise<void> {
    setLoading(true);
    setListError(null);
    try {
      const result = await callbacks.listResearchHistory();
      setRecords(sortSummariesByRecency(result.records));
    } catch (error) {
      setListError(toDisplayErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadList();
    // Runs once on mount — `callbacks` is a freshly constructed adapter on
    // every render (same pattern as `GateHistoryScreen`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSelect(id: string): Promise<void> {
    setSelectedId(id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const record = await callbacks.getResearchHistoryRecord(id);
      if (!record) {
        setDetailError('이 리서치 기록을 찾을 수 없어요. 이미 삭제되었을 수 있어요.');
        return;
      }
      setDetail(record);
    } catch (error) {
      setDetailError(toDisplayErrorMessage(error));
    } finally {
      setDetailLoading(false);
    }
  }

  function handleBack(): void {
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
  }

  async function handleRemove(id: string): Promise<void> {
    if (!window.confirm('이 리서치 기록을 삭제할까요? 되돌릴 수 없어요.')) {
      return;
    }
    try {
      await callbacks.removeResearchHistoryRecord(id);
    } catch (error) {
      setListError(toDisplayErrorMessage(error));
      return;
    }
    if (selectedId === id) {
      handleBack();
    }
    await loadList();
  }

  if (selectedId) {
    return (
      <div className="research-history-screen">
        <button type="button" className="research-history-back" onClick={handleBack}>
          ← 목록으로
        </button>

        {detailLoading && (
          <p className="research-history-status" role="status">
            불러오는 중이에요…
          </p>
        )}
        {detailError && (
          <p className="research-history-error" role="alert">
            {detailError}
          </p>
        )}
        {detail && (
          <>
            <div className="research-history-detail-header">
              <h3 className="research-history-detail-title">{detail.question}</h3>
              <p className="research-history-detail-date">{formatRanAt(detail.ranAt)}</p>
              <button
                type="button"
                className="research-history-detail-remove"
                onClick={() => void handleRemove(detail.id)}
              >
                삭제
              </button>
            </div>
            <ResearchProgress research={toResearchRunState(detail)} onOpenLink={openLink} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="research-history-screen">
      <p className="research-history-lead">지금까지 실행한 딥리서치 기록이에요.</p>

      {loading && (
        <p className="research-history-status" role="status">
          불러오는 중이에요…
        </p>
      )}
      {listError && (
        <p className="research-history-error" role="alert">
          {listError}
        </p>
      )}
      {!loading && !listError && records.length === 0 && (
        <p className="research-history-empty">
          아직 저장된 리서치가 없어요. 대화 탭에서 딥리서치를 실행하면 자동으로 저장돼요.
        </p>
      )}

      {!loading && records.length > 0 && (
        <ul className="research-history-list">
          {records.map((record) => (
            <li key={record.id} className="research-history-item">
              <button
                type="button"
                className="research-history-item-main"
                onClick={() => void handleSelect(record.id)}
                aria-label={`${record.question} 리서치 기록 열기`}
              >
                <span className="research-history-item-question">{record.question}</span>
                <span className="research-history-item-meta">
                  {formatRanAt(record.ranAt)} · {summarizeCitedCount(record.citedCount)}
                </span>
              </button>
              <button
                type="button"
                className="research-history-item-remove"
                onClick={() => void handleRemove(record.id)}
                aria-label={`${record.question} 리서치 기록 삭제`}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
