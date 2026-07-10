/**
 * "논문 찾기" (research) mode progress + result panel.
 *
 * Shows the current pipeline stage in plain Korean while a run is in
 * flight, then the finished report + paper list once done. A failed-source
 * banner explains partial results transparently (FR-RES-009) instead of
 * silently dropping a provider.
 *
 * Task T35 fix#2: `[n]` citation markers inside the report body are
 * clickable — clicking one scrolls the matching numbered reference row
 * into view and highlights it briefly, so the reader doesn't have to hunt
 * through the reference list manually.
 *
 * Task T45 (FR-LIB-001): every reference row also carries a library "save"
 * button (`ReferenceRow` in `researchReferenceRow.tsx`, state managed by
 * `useLibrarySaveState`). That hook imports `createLibraryScreenCallbacks`
 * directly from `../appCallbacks` instead of taking it as a prop, because
 * `ChatScreen.tsx` (this component's only current caller inside the chat
 * tab) is owned by another in-flight task (T54) this wave and must not be
 * touched — see this task's completion report for the rationale. This also
 * means the save button "just works" for `ResearchHistoryScreen`, which
 * reuses this same component (see `research/researchHistoryLogic.ts`'s
 * `toResearchRunState`).
 */
import { useState } from 'react';

import { CITATION_HIGHLIGHT_MS, referenceElementId, splitCitationSegments } from './citationLink';
import { parseMarkdownLite } from './markdownLite';
import { researchStageIndex, researchStageLabel, RESEARCH_STAGE_COUNT } from './progressStages';
import { ReferenceRow } from './researchReferenceRow';
import { useLibrarySaveState } from './useLibrarySaveState';
import type { ResearchFailedSourceView, ResearchView } from './chatTypes';
import type { ResearchRunState } from './chatUiLogic';
import './researchPanel.css';

interface ResearchProgressProps {
  research: ResearchRunState;
  onOpenLink(url: string): void;
}

function ProgressBar({ stage }: { stage: string | null }): JSX.Element {
  const label = stage ? researchStageLabel(stage) : '검색을 준비하고 있어요';
  const stepNumber = stage ? researchStageIndex(stage) + 1 : 1;
  return (
    <div className="research-progress" role="status" aria-live="polite">
      <p className="research-progress-label">{label}</p>
      <p className="research-progress-step">
        {stepNumber} / {RESEARCH_STAGE_COUNT} 단계
      </p>
    </div>
  );
}

function FailedSourceBanner({ failedSources }: { failedSources: ResearchFailedSourceView[] }): JSX.Element | null {
  if (failedSources.length === 0) {
    return null;
  }
  const summary = failedSources.map((f) => `${f.source}(${f.reason})`).join(', ');
  return (
    <p className="research-failed-banner">
      일부 학술 데이터베이스({summary})에 연결이 원활하지 않아, 나머지 결과만 보여드려요.
    </p>
  );
}

/** Renders `text` with any `[n]` citation markers as clickable jump links (Task T35 fix#2). */
function CitationText({ text, onCitationClick }: { text: string; onCitationClick(number: number): void }): JSX.Element {
  return (
    <>
      {splitCitationSegments(text).map((segment, index) =>
        segment.citation !== null ? (
          <button
            type="button"
            key={index}
            className="research-citation-link"
            onClick={() => onCitationClick(segment.citation as number)}
          >
            {segment.text}
          </button>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

function ReportBody({
  report,
  onCitationClick,
}: {
  report: string;
  onCitationClick(number: number): void;
}): JSX.Element {
  const blocks = parseMarkdownLite(report);
  return (
    <div className="research-report">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const text = block.runs.map((r) => r.text).join('');
          return (
            <h4 key={index}>
              <CitationText text={text} onCitationClick={onCitationClick} />
            </h4>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <CitationText text={item.map((r) => r.text).join('')} onCitationClick={onCitationClick} />
                </li>
              ))}
            </ul>
          );
        }
        const text = block.runs.map((r) => r.text).join('');
        return (
          <p key={index}>
            <CitationText text={text} onCitationClick={onCitationClick} />
          </p>
        );
      })}
    </div>
  );
}

export function ResearchProgress({ research, onOpenLink }: ResearchProgressProps): JSX.Element | null {
  // Which numbered reference row is currently highlighted after a `[n]`
  // citation click (Task T35 fix#2), if any. Cleared automatically after
  // `CITATION_HIGHLIGHT_MS`.
  const [highlightedRef, setHighlightedRef] = useState<number | null>(null);

  // Library-save button state (Task T45, FR-LIB-001) — see `useLibrarySaveState.ts`.
  const librarySave = useLibrarySaveState();

  function handleCitationClick(number: number): void {
    document.getElementById(referenceElementId(number))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedRef(number);
    window.setTimeout(() => {
      setHighlightedRef((current) => (current === number ? null : current));
    }, CITATION_HIGHLIGHT_MS);
  }

  if (!research.active && !research.result && !research.errorMessage) {
    return null;
  }

  return (
    <div className="research-panel">
      {research.active && <ProgressBar stage={research.stage} />}
      {research.errorMessage && <p className="research-error">{research.errorMessage}</p>}
      {research.result && (
        <div className="research-result">
          <FailedSourceBanner failedSources={research.result.failedSources} />
          <ReportBody report={research.result.report} onCitationClick={handleCitationClick} />
          {research.result.citedPapers.length > 0 && (
            <div className="research-references">
              <h4>참고문헌</h4>
              <ul className="research-ref-list">
                {research.result.citedPapers.map((paper, index) => (
                  <ReferenceRow
                    key={index}
                    number={index + 1}
                    paper={paper}
                    highlighted={highlightedRef === index + 1}
                    saveStatus={librarySave.statusFor(paper)}
                    onOpenLink={onOpenLink}
                    onSave={() => librarySave.save(paper)}
                  />
                ))}
              </ul>
            </div>
          )}
          {research.result.relatedPapers.length > 0 && (
            <div className="research-related">
              <h4>관련이 있을 수 있는 문헌</h4>
              <ul className="research-ref-list">
                {research.result.relatedPapers.map((paper, index) => (
                  <ReferenceRow
                    key={index}
                    number={null}
                    paper={paper}
                    highlighted={false}
                    saveStatus={librarySave.statusFor(paper)}
                    onOpenLink={onOpenLink}
                    onSave={() => librarySave.save(paper)}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
