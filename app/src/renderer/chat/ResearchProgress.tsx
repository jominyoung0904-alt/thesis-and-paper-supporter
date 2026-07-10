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
 */
import { useState } from 'react';

import { CITATION_HIGHLIGHT_MS, referenceElementId, splitCitationSegments } from './citationLink';
import { parseMarkdownLite } from './markdownLite';
import { researchStageIndex, researchStageLabel, RESEARCH_STAGE_COUNT } from './progressStages';
import type { ResearchFailedSourceView, ResearchPaperView, ResearchView } from './chatTypes';
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

/**
 * One reference line: `[n] 저자 (연도). 제목. 출처` where the title is a
 * clickable link (falls back to plain text when there's no URL). `number`
 * is `null` for the unnumbered "관련이 있을 수 있는 문헌" section. Carries an
 * `id` (Task T35 fix#2) so an in-report `[n]` citation link can scroll here,
 * and briefly highlights when it is the current jump target.
 */
function ReferenceRow({
  number,
  paper,
  highlighted,
  onOpenLink,
}: {
  number: number | null;
  paper: ResearchPaperView;
  highlighted: boolean;
  onOpenLink(url: string): void;
}): JSX.Element {
  const authors = paper.authors.length > 0 ? paper.authors.join(', ') : '저자 미상';
  const year = paper.year ?? '연도 미상';
  const rowClassName = `research-ref-row${highlighted ? ' research-ref-row-highlight' : ''}`;
  return (
    <li id={number !== null ? referenceElementId(number) : undefined} className={rowClassName}>
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
    </li>
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
                    onOpenLink={onOpenLink}
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
                  <ReferenceRow key={index} number={null} paper={paper} highlighted={false} onOpenLink={onOpenLink} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
