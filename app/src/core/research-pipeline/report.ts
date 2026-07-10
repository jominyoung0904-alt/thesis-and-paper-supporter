/**
 * Report-assembly step (FR-RES-004/005/006, FR-RES-009).
 *
 * FR-RES-005 is the hard constraint here: the LLM is handed a numbered paper
 * list and asked to write prose that cites ONLY as [1], [2], .... The
 * bibliography is then built deterministically by this module from
 * `PaperMetadata` — the model never authors a citation string. Any [n] the
 * model emits that is out of range is stripped from the body before the
 * deterministic reference list and the fixed access-guidance / failed-source
 * paragraphs are appended.
 */

import type { LlmAdapter } from '../llm';
import type { SerializedMemory } from '../memory/serializer';
import { buildSystemPrompt } from '../memory/serializer';
import type { FailedSource, PaperMetadata, ScreenedPaper, UsageTotals } from './types';
import { addUsage, FAILURE_REASON_LABELS, SOURCE_LABELS } from './types';

/** FR-RES-006: fixed original-text access guidance appended to every report. */
export const ACCESS_GUIDANCE =
  '원문은 링크에서 확인하실 수 있어요. 유료 논문은 학교 도서관 계정으로 열람할 수 있는 경우가 많아요.';

const NO_PAPERS_MESSAGE =
  '이번 조회에서는 연구 질문과 관련된 문헌을 찾지 못했습니다. 검색어를 바꾸어 다시 시도해 보세요.';

const TASK_INSTRUCTION =
  '아래 번호가 매겨진 논문 목록만을 근거로 사용자의 연구 질문에 대한 선행연구 종합 리포트를 한국어로 작성하라. ' +
  '본문에서 논문을 인용할 때는 반드시 [1], [2] 같은 대괄호 번호 형식만 사용하라. ' +
  '저자명, 연도, 제목 같은 서지정보를 직접 쓰지 마라. 목록에 없는 번호는 인용하지 마라. ' +
  '참고문헌 목록은 시스템이 자동으로 붙이므로 작성하지 마라.';

/**
 * Assembles the final Markdown report. `screened` is filtered to high/medium
 * relevance papers, which become the numbered reference set. Never throws.
 */
export async function assembleReport(
  question: string,
  screened: ScreenedPaper[],
  failedSources: FailedSource[],
  memory: SerializedMemory,
  llm: LlmAdapter,
  model: string,
  usage: UsageTotals,
): Promise<string> {
  const cited = selectCitedPapers(screened);

  if (cited.length === 0) {
    return [NO_PAPERS_MESSAGE, ACCESS_GUIDANCE, buildFailedSourcesParagraph(failedSources)]
      .filter((section) => section.length > 0)
      .join('\n\n');
  }

  const system = buildSystemPrompt(memory, TASK_INSTRUCTION);
  const userContent = `연구 질문: ${question}\n\n논문 목록:\n${renderNumberedList(cited)}`;
  const response = await llm.chat({ model, system, messages: [{ role: 'user', content: userContent }] });
  addUsage(usage, response);

  const body = stripInvalidCitations(response.text, cited.length);
  const references = buildReferences(cited);
  const failedParagraph = buildFailedSourcesParagraph(failedSources);

  return [body, references, ACCESS_GUIDANCE, failedParagraph]
    .filter((section) => section.length > 0)
    .join('\n\n');
}

/** Keeps high/medium papers, high first, preserving relative order within each tier. */
function selectCitedPapers(screened: ScreenedPaper[]): PaperMetadata[] {
  const high = screened.filter((item) => item.relevance === 'high').map((item) => item.paper);
  const medium = screened.filter((item) => item.relevance === 'medium').map((item) => item.paper);
  return [...high, ...medium];
}

/** Renders the numbered list handed to the model (title + context only). */
function renderNumberedList(papers: PaperMetadata[]): string {
  return papers
    .map((paper, index) => {
      const meta = [paper.authors.join(', '), paper.year ?? '연도 미상'].filter(Boolean).join(', ');
      return `[${index + 1}] ${paper.title}${meta ? ` (${meta})` : ''}`;
    })
    .join('\n');
}

/**
 * Removes any `[n]` citation whose number is out of the valid 1..count range
 * (a citation the model invented for a paper that is not in our list). Valid
 * citations are left untouched.
 */
function stripInvalidCitations(text: string, count: number): string {
  return text.replace(/\[(\d+)\]/g, (match, digits: string) => {
    const n = Number.parseInt(digits, 10);
    return n >= 1 && n <= count ? match : '';
  });
}

/**
 * Builds the deterministic reference list purely from {@link PaperMetadata}.
 * This is the only place bibliographic strings are produced (FR-RES-005), so
 * an LLM can never inject a fabricated citation into the final report.
 */
function buildReferences(papers: PaperMetadata[]): string {
  const lines = papers.map((paper, index) => `[${index + 1}] ${formatReference(paper)}`);
  return `## 참고문헌\n${lines.join('\n')}`;
}

/** Formats one reference entry: authors (year). title. source. URL. */
function formatReference(paper: PaperMetadata): string {
  const authors = paper.authors.length > 0 ? paper.authors.join(', ') : '저자 미상';
  const year = paper.year ?? 'n.d.';
  const sourceLabel = paper.venue ?? SOURCE_LABELS[paper.source];
  const link = paper.url ?? '링크 없음';
  return `${authors} (${year}). ${paper.title}. ${sourceLabel}. ${link}`;
}

/**
 * Builds the transparency paragraph for sources that failed to respond
 * (FR-RES-009). Returns an empty string when nothing failed.
 */
function buildFailedSourcesParagraph(failedSources: FailedSource[]): string {
  if (failedSources.length === 0) return '';
  const items = failedSources
    .map((failed) => `${SOURCE_LABELS[failed.source]}(${FAILURE_REASON_LABELS[failed.reason]})`)
    .join(', ');
  return (
    `일부 학술 데이터베이스가 이번 조회에서 응답하지 않았습니다: ${items}. ` +
    '해당 출처의 문헌은 리포트에 포함되지 않았으며, 응답한 데이터베이스의 결과만으로 리포트를 구성했습니다.'
  );
}
