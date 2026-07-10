/**
 * Selection toolbar for the literature library screen (FR-LIB-003): a
 * "전체 선택/해제" checkbox plus the two clipboard-copy buttons ("📋 APA 서지
 * 복사" / "📔 노트북LM용 자료 복사"). Split out of `LibraryScreen.tsx` to stay
 * under the project's 300-line file limit.
 *
 * Owns its own copy-result/error message state — that feedback is local to
 * "what just got copied" and doesn't need to bubble up to `LibraryScreen`.
 */
import { useState } from 'react';

import { copyApaBibliography, copyForNotebookLm } from './libraryClipboard';
import { isAllSelected, selectedPapers, toDisplayErrorMessage } from './libraryLogic';
import type { IpcSavedPaper } from '../../shared/ipc-channels';

export interface LibraryToolbarProps {
  papers: IpcSavedPaper[];
  selected: ReadonlySet<string>;
  onToggleAll(): void;
}

export function LibraryToolbar({ papers, selected, onToggleAll }: LibraryToolbarProps): JSX.Element {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  const chosen = selectedPapers(papers, selected);
  const hasSelection = chosen.length > 0;

  async function runCopy(action: (list: IpcSavedPaper[]) => ReturnType<typeof copyApaBibliography>): Promise<void> {
    setCopying(true);
    setError(null);
    try {
      const result = await action(chosen);
      setMessage(result.message);
    } catch (copyError) {
      setError(toDisplayErrorMessage(copyError));
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="library-toolbar">
      <label className="library-toolbar-select-all">
        <input
          type="checkbox"
          checked={isAllSelected(papers, selected)}
          onChange={onToggleAll}
          aria-label="전체 선택/해제"
        />
        전체 선택/해제 ({selected.size}/{papers.length})
      </label>
      <div className="library-toolbar-actions">
        <button
          type="button"
          className="library-toolbar-btn"
          disabled={!hasSelection || copying}
          onClick={() => void runCopy(copyApaBibliography)}
        >
          📋 APA 서지 복사
        </button>
        <button
          type="button"
          className="library-toolbar-btn"
          disabled={!hasSelection || copying}
          onClick={() => void runCopy(copyForNotebookLm)}
        >
          📔 노트북LM용 자료 복사
        </button>
      </div>
      {message && (
        <p className="library-toolbar-message" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="library-toolbar-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
