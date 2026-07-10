/**
 * Literature library screen (FR-LIB-001/002, Task T45): lists every paper
 * the user saved from a research result (via `ResearchProgress`'s save
 * button), lets them jot a short one-line memo per paper, open the paper's
 * original link, or delete a saved entry.
 *
 * Callback-injected exactly like `GateHistoryScreen` / `ResearchHistoryScreen` —
 * this component never references `window.thesisApi` directly. Until T62
 * wires this into `App.tsx`, any object matching `LibraryScreenCallbacks`
 * (already defined in `appCallbacks.ts`) satisfies the `callbacks` prop.
 */
import { useEffect, useState } from 'react';

import { LibraryItem } from './LibraryItem';
import { LibraryToolbar } from './LibraryToolbar';
import { NotebookLmGuide } from './NotebookLmGuide';
import type { LibraryScreenCallbacks } from '../appCallbacks';
import type { IpcSavedPaper } from '../../shared/ipc-channels';
import { isMemoTooLong, MEMO_MAX_LENGTH, toDisplayErrorMessage, toggleSelected, toggleSelectAll } from './libraryLogic';
import './libraryScreen.css';

export interface LibraryScreenProps {
  callbacks: LibraryScreenCallbacks;
}

export function LibraryScreen({ callbacks }: LibraryScreenProps): JSX.Element {
  const [papers, setPapers] = useState<IpcSavedPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingMemo, setEditingMemo] = useState('');
  const [savingMemoId, setSavingMemoId] = useState<string | null>(null);
  const [memoError, setMemoError] = useState<string | null>(null);

  // Screen-local checkbox selection for the APA/NotebookLM copy toolbar
  // (FR-LIB-003) — never persisted, reset whenever the list reloads.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  async function loadList(): Promise<void> {
    setLoading(true);
    setListError(null);
    try {
      const result = await callbacks.listLibrary();
      setPapers(result.papers);
      const stillPresent = new Set(result.papers.map((paper) => paper.id));
      setSelectedIds((prev) => new Set([...prev].filter((id) => stillPresent.has(id))));
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

  function handleStartEdit(paper: IpcSavedPaper): void {
    setEditingId(paper.id);
    setEditingMemo(paper.memo);
    setMemoError(null);
  }

  function handleCancelEdit(): void {
    setEditingId(null);
    setEditingMemo('');
    setMemoError(null);
  }

  async function handleSaveMemo(id: string): Promise<void> {
    if (isMemoTooLong(editingMemo)) {
      setMemoError(`메모는 ${MEMO_MAX_LENGTH}자를 넘을 수 없어요.`);
      return;
    }
    setSavingMemoId(id);
    setMemoError(null);
    try {
      const result = await callbacks.updateLibraryMemo(id, editingMemo);
      if (!result.ok) {
        setMemoError(
          result.reason === 'memo_too_long'
            ? `메모는 ${MEMO_MAX_LENGTH}자를 넘을 수 없어요.`
            : '메모를 저장하지 못했어요. 다시 시도해 주세요.',
        );
        return;
      }
      setPapers((prev) => prev.map((p) => (p.id === id ? result.paper : p)));
      setEditingId(null);
      setEditingMemo('');
    } catch (error) {
      setMemoError(toDisplayErrorMessage(error));
    } finally {
      setSavingMemoId(null);
    }
  }

  async function handleRemove(id: string): Promise<void> {
    if (!window.confirm('삭제하면 되돌릴 수 없어요.')) {
      return;
    }
    try {
      await callbacks.removeFromLibrary(id);
    } catch (error) {
      setListError(toDisplayErrorMessage(error));
      return;
    }
    if (editingId === id) {
      handleCancelEdit();
    }
    await loadList();
  }

  function handleToggleOne(id: string): void {
    setSelectedIds((prev) => toggleSelected(prev, id));
  }

  function handleToggleAll(): void {
    setSelectedIds((prev) => toggleSelectAll(papers, prev));
  }

  return (
    <div className="library-screen">
      <p className="library-lead">지금까지 저장한 문헌이에요.</p>
      <NotebookLmGuide onOpenLink={callbacks.openLink} />

      {loading && (
        <p className="library-status" role="status">
          불러오는 중이에요…
        </p>
      )}
      {listError && (
        <p className="library-error" role="alert">
          {listError}
        </p>
      )}
      {!loading && !listError && papers.length === 0 && (
        <p className="library-empty">리서치 결과에서 💾 버튼으로 문헌을 저장해 보세요.</p>
      )}

      {!loading && papers.length > 0 && (
        <>
          <LibraryToolbar papers={papers} selected={selectedIds} onToggleAll={handleToggleAll} />
          <ul className="library-list">
            {papers.map((paper) => (
              <LibraryItem
                key={paper.id}
                paper={paper}
                selected={selectedIds.has(paper.id)}
                editing={editingId === paper.id}
                editingMemo={editingMemo}
                saving={savingMemoId === paper.id}
                memoError={editingId === paper.id ? memoError : null}
                onOpenLink={callbacks.openLink}
                onToggleSelect={() => handleToggleOne(paper.id)}
                onStartEdit={() => handleStartEdit(paper)}
                onCancelEdit={handleCancelEdit}
                onChangeMemo={setEditingMemo}
                onSaveMemo={() => void handleSaveMemo(paper.id)}
                onRemove={() => void handleRemove(paper.id)}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
