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

import type { LibraryScreenCallbacks } from '../appCallbacks';
import type { IpcSavedPaper } from '../../shared/ipc-channels';
import {
  formatAuthors,
  formatSavedAt,
  formatYear,
  isMemoTooLong,
  MEMO_MAX_LENGTH,
  remainingMemoChars,
  sourceLabel,
  toDisplayErrorMessage,
} from './libraryLogic';
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

  async function loadList(): Promise<void> {
    setLoading(true);
    setListError(null);
    try {
      const result = await callbacks.listLibrary();
      setPapers(result.papers);
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

  return (
    <div className="library-screen">
      <p className="library-lead">지금까지 저장한 문헌이에요.</p>

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
        <ul className="library-list">
          {papers.map((paper) => (
            <LibraryItem
              key={paper.id}
              paper={paper}
              editing={editingId === paper.id}
              editingMemo={editingMemo}
              saving={savingMemoId === paper.id}
              memoError={editingId === paper.id ? memoError : null}
              onOpenLink={callbacks.openLink}
              onStartEdit={() => handleStartEdit(paper)}
              onCancelEdit={handleCancelEdit}
              onChangeMemo={setEditingMemo}
              onSaveMemo={() => void handleSaveMemo(paper.id)}
              onRemove={() => void handleRemove(paper.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface LibraryItemProps {
  paper: IpcSavedPaper;
  editing: boolean;
  editingMemo: string;
  saving: boolean;
  memoError: string | null;
  onOpenLink(url: string): void;
  onStartEdit(): void;
  onCancelEdit(): void;
  onChangeMemo(memo: string): void;
  onSaveMemo(): void;
  onRemove(): void;
}

function LibraryItem({
  paper,
  editing,
  editingMemo,
  saving,
  memoError,
  onOpenLink,
  onStartEdit,
  onCancelEdit,
  onChangeMemo,
  onSaveMemo,
  onRemove,
}: LibraryItemProps): JSX.Element {
  const { paper: metadata } = paper;
  return (
    <li className="library-item">
      <div className="library-item-header">
        {metadata.url ? (
          <button type="button" className="library-item-title-link" onClick={() => onOpenLink(metadata.url as string)}>
            {metadata.title}
          </button>
        ) : (
          <span className="library-item-title">{metadata.title}</span>
        )}
        <button type="button" className="library-item-remove" onClick={onRemove} aria-label={`${metadata.title} 삭제`}>
          삭제
        </button>
      </div>
      <p className="library-item-meta">
        {formatAuthors(metadata.authors)} ({formatYear(metadata.year)}) · {sourceLabel(metadata.source)} · 저장일{' '}
        {formatSavedAt(paper.savedAt)}
      </p>
      <MemoEditor
        memo={paper.memo}
        editing={editing}
        editingMemo={editingMemo}
        saving={saving}
        error={memoError}
        onStartEdit={onStartEdit}
        onCancelEdit={onCancelEdit}
        onChangeMemo={onChangeMemo}
        onSaveMemo={onSaveMemo}
      />
    </li>
  );
}

interface MemoEditorProps {
  memo: string;
  editing: boolean;
  editingMemo: string;
  saving: boolean;
  error: string | null;
  onStartEdit(): void;
  onCancelEdit(): void;
  onChangeMemo(memo: string): void;
  onSaveMemo(): void;
}

function MemoEditor({
  memo,
  editing,
  editingMemo,
  saving,
  error,
  onStartEdit,
  onCancelEdit,
  onChangeMemo,
  onSaveMemo,
}: MemoEditorProps): JSX.Element {
  if (!editing) {
    return (
      <div className="library-item-memo-row">
        <span className="library-item-memo">{memo.length > 0 ? memo : '메모 없음'}</span>
        <button type="button" className="library-item-memo-edit" onClick={onStartEdit}>
          메모 편집
        </button>
      </div>
    );
  }

  return (
    <div className="library-item-memo-editor">
      <input
        type="text"
        className="library-item-memo-input"
        value={editingMemo}
        maxLength={MEMO_MAX_LENGTH}
        onChange={(event) => onChangeMemo(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSaveMemo();
          if (event.key === 'Escape') onCancelEdit();
        }}
        aria-label="문헌 메모"
        autoFocus
      />
      <span className="library-item-memo-count">{remainingMemoChars(editingMemo)}자 남음</span>
      {error && (
        <p className="library-item-memo-error" role="alert">
          {error}
        </p>
      )}
      <div className="library-item-memo-actions">
        <button type="button" onClick={onSaveMemo} disabled={saving}>
          {saving ? '저장 중…' : '저장'}
        </button>
        <button type="button" onClick={onCancelEdit} disabled={saving}>
          취소
        </button>
      </div>
    </div>
  );
}
