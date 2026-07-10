/**
 * Single saved-paper row for `LibraryScreen.tsx` (FR-LIB-001/002/003): the
 * selection checkbox, title/link, delete button, and the inline memo editor.
 * Split out of `LibraryScreen.tsx` to stay under the project's 300-line
 * file limit.
 */
import { formatAuthors, formatSavedAt, formatYear, MEMO_MAX_LENGTH, remainingMemoChars, sourceLabel } from './libraryLogic';
import type { IpcSavedPaper } from '../../shared/ipc-channels';

interface LibraryItemProps {
  paper: IpcSavedPaper;
  selected: boolean;
  editing: boolean;
  editingMemo: string;
  saving: boolean;
  memoError: string | null;
  onOpenLink(url: string): void;
  onToggleSelect(): void;
  onStartEdit(): void;
  onCancelEdit(): void;
  onChangeMemo(memo: string): void;
  onSaveMemo(): void;
  onRemove(): void;
}

export function LibraryItem({
  paper,
  selected,
  editing,
  editingMemo,
  saving,
  memoError,
  onOpenLink,
  onToggleSelect,
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
        <input
          type="checkbox"
          className="library-item-checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`${metadata.title} 선택`}
        />
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
