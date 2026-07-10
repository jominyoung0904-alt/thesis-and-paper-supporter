/**
 * One reference-list row (`[n] 저자 (연도). 제목. 출처`) plus its library-save
 * button, split out of `ResearchProgress.tsx` (Task T45, file-size-limit —
 * same rationale as `citationLink.ts`'s earlier split, Task T35).
 */
import { referenceElementId } from './citationLink';
import type { ResearchPaperView } from './chatTypes';

/** Per-row library-save button state, keyed by `paperKey(metadata.source, metadata.externalId)`. */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'duplicate' | 'error';

/** Library-save button/badge for one reference row (Task T45, FR-LIB-001). */
function SaveButton({
  title,
  status,
  onSave,
}: {
  title: string;
  status: SaveStatus;
  onSave(): void;
}): JSX.Element {
  if (status === 'saved') {
    return (
      <span className="research-save-badge research-save-badge-saved" aria-label={`${title} 문헌 보관함에 저장됨`}>
        ✔ 저장됨
      </span>
    );
  }
  if (status === 'duplicate') {
    return (
      <span
        className="research-save-badge research-save-badge-duplicate"
        aria-label={`${title}은(는) 이미 보관함에 있어요`}
      >
        ✔ 이미 보관함에 있어요
      </span>
    );
  }
  return (
    <span className="research-save-wrap">
      <button
        type="button"
        className="research-save-button"
        onClick={onSave}
        disabled={status === 'saving'}
        aria-label={`${title} 문헌 보관함에 저장`}
      >
        {status === 'saving' ? '저장 중…' : '💾 저장'}
      </button>
      {status === 'error' && <span className="research-save-error">저장하지 못했어요. 다시 시도해 주세요.</span>}
    </span>
  );
}

/**
 * One reference line: `[n] 저자 (연도). 제목. 출처` where the title is a
 * clickable link (falls back to plain text when there's no URL), plus a
 * library-save button/badge. `number` is `null` for the unnumbered "관련이
 * 있을 수 있는 문헌" section. Carries an `id` (Task T35 fix#2) so an in-report
 * `[n]` citation link can scroll here, and briefly highlights when it is the
 * current jump target.
 */
export function ReferenceRow({
  number,
  paper,
  highlighted,
  saveStatus,
  onOpenLink,
  onSave,
}: {
  number: number | null;
  paper: ResearchPaperView;
  highlighted: boolean;
  saveStatus: SaveStatus;
  onOpenLink(url: string): void;
  onSave(): void;
}): JSX.Element {
  const authors = paper.authors.length > 0 ? paper.authors.join(', ') : '저자 미상';
  const year = paper.year ?? '연도 미상';
  const rowClassName = `research-ref-row${highlighted ? ' research-ref-row-highlight' : ''}`;
  return (
    <li id={number !== null ? referenceElementId(number) : undefined} className={rowClassName}>
      <div className="research-ref-row-main">
        {number !== null && <span className="research-ref-number">[{number}] </span>}
        <span className="research-ref-meta">
          {authors} ({year}).{' '}
        </span>
        {paper.url ? (
          <button type="button" className="research-paper-title-link" onClick={() => onOpenLink(paper.url as string)}>
            {paper.title}
          </button>
        ) : (
          <span className="research-paper-title">{paper.title}</span>
        )}
        <span className="research-ref-source">. {paper.source}</span>
      </div>
      <div className="research-ref-row-actions">
        <SaveButton title={paper.title} status={saveStatus} onSave={onSave} />
      </div>
    </li>
  );
}
