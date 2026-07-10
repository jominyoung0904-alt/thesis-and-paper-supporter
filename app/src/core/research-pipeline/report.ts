/**
 * Report-assembly step (FR-RES-004/005/006, FR-RES-009).
 *
 * FR-RES-005 is the hard constraint here: the LLM is handed a numbered paper
 * list and asked to write prose that cites ONLY as [1], [2], .... The
 * reference set is built deterministically by this module from
 * `PaperMetadata` — the model never authors a citation string. Any [n] the
 * model emits that is out of range is stripped from the body.
 *
 * User-feedback follow-up (SPEC-TSA-001 후속, 실사용 피드백 6종): the report
 * string no longer carries a trailing "## 참고문헌" text section — the
 * renderer now shows references as clickable inline links, built from the
 * structured `citedPapers`/`relatedPapers` this module returns alongside the
 * report text. `citedPapers` is renumbered to a contiguous 1..N sequence in
 * citation order (order of first `[n]` appearance in the body), so its array
 * position is always 1:1 with the `[n]` the reader sees in the body text.
 * `relatedPapers` surfaces medium-relevance candidates the model never
 * actually cited (capped at 8), so the user can still see them.
 *
 * RISS deep-link fallback (SPEC-TSA-001 후속 T33): when the `naverdoc`
 * source (theses/dissertations/reports) did not participate in this run's
 * client list at all (no key registered), a one-line RISS search deep link
 * is appended so the user can still manually look up domestic theses —
 * see `buildRissDeepLinkParagraph`.
 */

import type { LlmAdapter } from '../llm';
import type { AcademicSource } from '../academic-api/types';
import type { SerializedMemory } from '../memory/serializer';
import { buildSystemPrompt } from '../memory/serializer';
import type { FailedSource, PaperMetadata, ScreenedPaper, UsageTotals } from './types';
import { addUsage, FAILURE_REASON_LABELS, SOURCE_LABELS } from './types';

/** FR-RES-006: fixed original-text access guidance appended to every report. */
export const ACCESS_GUIDANCE =
  '원문은 링크에서 확인하실 수 있어요. 유료 논문은 학교 도서관 계정으로 열람할 수 있는 경우가 많아요.';

const NO_PAPERS_MESSAGE =
  '이번 조회에서는 연구 질문과 관련된 문헌을 찾지 못했습니다. 검색어를 바꾸어 다시 시도해 보세요.';

/** RISS's plain search-result deep link; only the free-text `query` param is filled in. */
const RISS_SEARCH_BASE_URL = 'https://www.riss.kr/search/Search.do?queryText=&query=';

/** Max uncited medium-relevance papers surfaced in the "관련이 있을 수 있는 문헌" section. */
const RELATED_PAPERS_LIMIT = 8;

const TASK_INSTRUCTION =
  '아래 번호가 매겨진 논문 목록만을 근거로 사용자의 연구 질문에 대한 선행연구 종합 리포트를 한국어로 작성하라. ' +
  '본문에서 논문을 인용할 때는 반드시 [1], [2] 같은 대괄호 번호 형식만 사용하라. ' +
  '저자명, 연도, 제목 같은 서지정보를 직접 쓰지 마라. 목록에 없는 번호는 인용하지 마라. ' +
  '참고문헌 목록은 시스템이 자동으로 붙이므로 작성하지 마라.';

/** Result of {@link assembleReport}: the report body plus the structured reference sets. */
export interface AssembledReport {
  report: string;
  /** Papers actually cited in the body, renumbered so index+1 === the `[n]` shown in text. */
  citedPapers: ScreenedPaper[];
  /** Medium-relevance candidates the model never cited, capped at {@link RELATED_PAPERS_LIMIT}. */
  relatedPapers: ScreenedPaper[];
}

/**
 * Assembles the final Markdown report body plus the cited/related reference
 * sets. `screened` is filtered to high/medium relevance papers, which become
 * the numbered candidate set handed to the LLM. Never throws.
 */
export async function assembleReport(
  question: string,
  screened: ScreenedPaper[],
  failedSources: FailedSource[],
  memory: SerializedMemory,
  llm: LlmAdapter,
  model: string,
  usage: UsageTotals,
  participatingSources: AcademicSource[],
  firstKoQuery: string,
): Promise<AssembledReport> {
  const candidates = selectCandidates(screened);
  const rissParagraph = buildRissDeepLinkParagraph(participatingSources, firstKoQuery);

  if (candidates.length === 0) {
    const report = [NO_PAPERS_MESSAGE, ACCESS_GUIDANCE, buildFailedSourcesParagraph(failedSources), rissParagraph]
      .filter((section) => section.length > 0)
      .join('\n\n');
    return { report, citedPapers: [], relatedPapers: [] };
  }

  const system = buildSystemPrompt(memory, TASK_INSTRUCTION);
  const userContent = `연구 질문: ${question}\n\n논문 목록:\n${renderNumberedList(candidates.map((c) => c.paper))}`;
  const response = await llm.chat({ model, system, messages: [{ role: 'user', content: userContent }] });
  addUsage(usage, response);

  const strippedBody = stripInvalidCitations(response.text, candidates.length);
  const { body, citedPapers } = renumberCitations(strippedBody, candidates);
  const relatedPapers = selectRelatedPapers(candidates, citedPapers);
  const failedParagraph = buildFailedSourcesParagraph(failedSources);

  const report = [body, ACCESS_GUIDANCE, failedParagraph, rissParagraph]
    .filter((section) => section.length > 0)
    .join('\n\n');

  return { report, citedPapers, relatedPapers };
}

/**
 * Builds the RISS deep-link fallback paragraph, or `''` when it should not
 * be shown. Only shown when `naverdoc` (theses/dissertations/reports) did
 * not participate in this run at all — an empty *result set* from naverdoc
 * is not the same thing (that just means it searched and found nothing), so
 * this checks source participation, not result count.
 */
function buildRissDeepLinkParagraph(participatingSources: AcademicSource[], firstKoQuery: string): string {
  if (participatingSources.includes('naverdoc')) return '';

  const trimmedQuery = firstKoQuery.trim();
  if (trimmedQuery.length === 0) return '';

  const link = `${RISS_SEARCH_BASE_URL}${encodeURIComponent(trimmedQuery)}`;
  return `학위논문은 RISS에서 직접 검색해 보실 수 있어요: ${link}`;
}

/** Keeps high/medium papers as candidates, high first, preserving relative order within each tier. */
function selectCandidates(screened: ScreenedPaper[]): ScreenedPaper[] {
  const high = screened.filter((item) => item.relevance === 'high');
  const medium = screened.filter((item) => item.relevance === 'medium');
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
 * Finds every valid `[n]` citation in `text` (already stripped of
 * out-of-range numbers) and renumbers them to a contiguous 1..N sequence in
 * order of first appearance. Returns the rewritten body plus the
 * corresponding subset of `candidates`, in that same order — so
 * `citedPapers[i]` is always what `[i + 1]` refers to in the returned body.
 */
function renumberCitations(
  text: string,
  candidates: ScreenedPaper[],
): { body: string; citedPapers: ScreenedPaper[] } {
  const usedOrder: number[] = [];
  const seen = new Set<number>();
  for (const match of text.matchAll(/\[(\d+)\]/g)) {
    const n = Number.parseInt(match[1] ?? '', 10);
    if (!seen.has(n)) {
      seen.add(n);
      usedOrder.push(n);
    }
  }

  const citedPapers = usedOrder.map((n) => candidates[n - 1]).filter((c): c is ScreenedPaper => c !== undefined);

  const renumberMap = new Map<number, number>();
  usedOrder.forEach((originalN, index) => {
    if (candidates[originalN - 1] !== undefined) {
      renumberMap.set(originalN, index + 1);
    }
  });

  const body = text.replace(/\[(\d+)\]/g, (match, digits: string) => {
    const n = Number.parseInt(digits, 10);
    const newN = renumberMap.get(n);
    return newN !== undefined ? `[${newN}]` : match;
  });

  return { body, citedPapers };
}

/** Medium-relevance candidates never cited in the body, capped at {@link RELATED_PAPERS_LIMIT}. */
function selectRelatedPapers(candidates: ScreenedPaper[], citedPapers: ScreenedPaper[]): ScreenedPaper[] {
  const citedSet = new Set(citedPapers);
  return candidates.filter((item) => item.relevance === 'medium' && !citedSet.has(item)).slice(0, RELATED_PAPERS_LIMIT);
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
