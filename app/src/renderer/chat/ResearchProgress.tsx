/**
 * "논문 찾기" (research) mode progress + result panel.
 *
 * Shows the current pipeline stage in plain Korean while a run is in
 * flight, then the finished report + paper list once done. A failed-source
 * banner explains partial results transparently (FR-RES-009) instead of
 * silently dropping a provider.
 */
import { parseMarkdownLite } from './markdownLite';
import { researchStageIndex, researchStageLabel, RESEARCH_STAGE_COUNT } from './progressStages';
import type { ResearchFailedSourceView, ResearchPaperView, ResearchView } from './chatTypes';
import type { ResearchRunState } from './chatUiLogic';

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

function PaperRow({ paper, onOpenLink }: { paper: ResearchPaperView; onOpenLink(url: string): void }): JSX.Element {
  const authors = paper.authors.length > 0 ? paper.authors.join(', ') : '저자 정보 없음';
  const year = paper.year ?? '연도 미상';
  return (
    <li className="research-paper-row">
      {paper.url ? (
        <button type="button" className="research-paper-title-link" onClick={() => onOpenLink(paper.url as string)}>
          {paper.title}
        </button>
      ) : (
        <span className="research-paper-title">{paper.title}</span>
      )}
      <span className="research-paper-meta">
        {authors} · {year} · {paper.source}
      </span>
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

function ReportBody({ report }: { report: string }): JSX.Element {
  const blocks = parseMarkdownLite(report);
  return (
    <div className="research-report">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return <h4 key={index}>{block.runs.map((r) => r.text).join('')}</h4>;
        }
        if (block.type === 'list') {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item.map((r) => r.text).join('')}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{block.runs.map((r) => r.text).join('')}</p>;
      })}
    </div>
  );
}

export function ResearchProgress({ research, onOpenLink }: ResearchProgressProps): JSX.Element | null {
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
          <ReportBody report={research.result.report} />
          {research.result.papers.length > 0 && (
            <ul className="research-paper-list">
              {research.result.papers.map((paper, index) => (
                <PaperRow key={index} paper={paper} onOpenLink={onOpenLink} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
