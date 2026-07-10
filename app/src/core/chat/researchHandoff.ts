/**
 * Research-to-chat handoff (FR-RSH-003/004).
 *
 * When a user clicks "이 결과로 회의하기" on a research result (or a reopened
 * research-history entry), a brand-new idea-meeting chat is started with this
 * module's output pre-loaded as its initial history via
 * `ConversationManager.restoreHistory()`. This mirrors the same mechanism the
 * FR-CHT-003 compaction step uses to fold prior context into the transcript
 * (conversation.ts's `summary` role / `toLlmMessages` folding) — here we inject
 * a `user` turn carrying the research context plus a short `assistant`
 * acceptance turn, so the LLM treats it as an already-happened exchange
 * instead of a system instruction.
 *
 * This module is a pure formatter: it never calls an LLM or touches disk.
 * Recommended integration flow for the IPC layer (consumed by T51):
 *
 *   const handoff = buildResearchHandoffHistory(record);
 *   const conversationManager = buildConversationManager(); // fresh chat
 *   conversationManager.restoreHistory(handoff);
 *   // Show `buildHandoffPreview(record)` as a toast/banner in the chat UI,
 *   // then render `handoff` (or `conversationManager.getHistory()`) as the
 *   // starting transcript.
 */

import type { ResearchRecord } from '../research-history/model';
import type { ScreenedPaper } from '../research-pipeline/types';
import type { ChatMessage } from './types';

/** Report body char budget before paragraph-boundary truncation kicks in (design decision 6). */
const REPORT_CHAR_LIMIT = 6000;

/** Hard cap on the full injected user-turn text, regardless of report length (FR-RSH-004). */
// @AX:ANCHOR: [AUTO] token-budget ceiling for the injected handoff turn — raising this risks blowing the LLM context window. Related: SPEC-TSA-002 T50
const TOTAL_CHAR_HARD_CAP = 8000;

/** Max cited-paper entries listed in the injected summary. */
const MAX_CITED_PAPERS = 15;

/** Max related-paper entries (title-only) listed in the injected summary. */
const MAX_RELATED_PAPERS = 8;

/** Max question length shown in the short UI preview string. */
const PREVIEW_QUESTION_MAX_LENGTH = 40;

/** Marker appended wherever content is cut off (report body or the overall hard cap). */
const TRUNCATION_MARKER = '...(이하 생략)';

const HANDOFF_INSTRUCTION =
  '다음은 방금 실행한 딥리서치 결과 요약이에요. 이 내용을 바탕으로 아이디어 회의를 하고 싶어요.';

const HANDOFF_ACCEPTANCE =
  '네, 리서치 내용을 확인했어요. 이 요약과 참고문헌을 바탕으로 이야기를 이어가 볼까요?';

/**
 * Builds the initial chat history for a "이 결과로 회의하기" handoff: one
 * `user` turn carrying the research context (question, truncated report,
 * cited/related paper lists) followed by a short `assistant` acceptance turn.
 * Pure and deterministic aside from the `at` timestamp.
 */
export function buildResearchHandoffHistory(record: ResearchRecord): ChatMessage[] {
  const summaryBody = buildSummaryBody(record);
  const rawUserContent = `${HANDOFF_INSTRUCTION}\n\n${summaryBody}`;
  const userContent = truncateAtBoundary(rawUserContent, TOTAL_CHAR_HARD_CAP, TRUNCATION_MARKER);

  const at = new Date().toISOString();
  return [
    { role: 'user', content: userContent, at },
    { role: 'assistant', content: HANDOFF_ACCEPTANCE, at },
  ];
}

/**
 * Short, user-facing string describing what was just injected into the new
 * chat (e.g. shown as a toast/banner right after the handoff completes).
 */
export function buildHandoffPreview(record: ResearchRecord): string {
  const question = truncateForPreview(record.question);
  const citedCount = record.citedPapers.length;
  return `리서치 '${question}'의 요약과 참고문헌 ${citedCount}건을 새 대화에 불러왔어요.`;
}

/** Assembles the question + report + paper-list sections of the summary body. */
function buildSummaryBody(record: ResearchRecord): string {
  const reportSection = truncateAtBoundary(record.report, REPORT_CHAR_LIMIT, TRUNCATION_MARKER);
  const cited = formatCitedPapers(record.citedPapers);
  const related = formatRelatedPapers(record.relatedPapers);

  return [
    `질문: ${record.question}`,
    '',
    '리포트 요약:',
    reportSection,
    '',
    `참고문헌 (최대 ${MAX_CITED_PAPERS}건):`,
    cited,
    '',
    `관련 문헌 (최대 ${MAX_RELATED_PAPERS}건):`,
    related,
  ].join('\n');
}

/** Numbered "제목 — 저자 (연도)" lines, capped at {@link MAX_CITED_PAPERS}. */
function formatCitedPapers(papers: readonly ScreenedPaper[]): string {
  const list = papers.slice(0, MAX_CITED_PAPERS);
  if (list.length === 0) return '참고문헌 없음';
  return list
    .map((entry, index) => {
      const { paper } = entry;
      const authors = paper.authors.length > 0 ? paper.authors.join(', ') : '저자 미상';
      const year = paper.year ?? '연도 미상';
      return `${index + 1}. ${paper.title} — ${authors} (${year})`;
    })
    .join('\n');
}

/** Numbered title-only lines, capped at {@link MAX_RELATED_PAPERS}. */
function formatRelatedPapers(papers: readonly ScreenedPaper[]): string {
  const list = papers.slice(0, MAX_RELATED_PAPERS);
  if (list.length === 0) return '없음';
  return list.map((entry, index) => `${index + 1}. ${entry.paper.title}`).join('\n');
}

/**
 * Truncates `text` to at most `limit` characters, preferring to cut at a
 * paragraph boundary (`\n\n`, falling back to a single `\n`) inside the
 * limit so a sentence is never sliced mid-word. Appends `marker` on a new
 * paragraph when truncation actually occurred; returns `text` unchanged
 * otherwise.
 */
function truncateAtBoundary(text: string, limit: number, marker: string): string {
  if (text.length <= limit) return text;

  const slice = text.slice(0, limit);
  const paragraphBreak = slice.lastIndexOf('\n\n');
  const lineBreak = slice.lastIndexOf('\n');
  const cut = paragraphBreak > 0 ? paragraphBreak : lineBreak;
  const truncated = cut > 0 ? slice.slice(0, cut) : slice;

  return `${truncated.trimEnd()}\n\n${marker}`;
}

/** Collapses newlines and caps the question shown in {@link buildHandoffPreview}. */
function truncateForPreview(question: string): string {
  const collapsed = question.replace(/\r?\n/g, ' ').trim();
  if (collapsed.length <= PREVIEW_QUESTION_MAX_LENGTH) return collapsed;
  return `${collapsed.slice(0, PREVIEW_QUESTION_MAX_LENGTH)}...`;
}
