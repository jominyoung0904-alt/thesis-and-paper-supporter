/**
 * Plain-text export formatting for the "노트북LM용 자료 복사" button
 * (FR-LIB-003). Produces text meant to be pasted as a NotebookLM text
 * source — the clipboard write itself lives in `libraryClipboard.ts`.
 *
 * Deliberately mirrors `core/library/bibliography.ts`'s "never render a bare
 * missing field" discipline: every line always renders with a Korean
 * placeholder (`formatAuthors`/`formatYear` already do this; `출처`/`원문
 * 링크`/`초록` follow the same rule below) so the output stays a consistent,
 * predictable shape for non-technical users regardless of which optional
 * fields a given saved paper is missing.
 */

import { formatAuthors, formatYear } from './libraryLogic';
import type { IpcSavedPaper } from '../../shared/ipc-channels';

/** Formats one saved paper as a single NotebookLM source entry (1-indexed `[n]` marker). */
function formatEntryForNotebookLm(paper: IpcSavedPaper, index: number): string {
  const metadata = paper.paper;
  return [
    `[${index + 1}] ${metadata.title}`,
    `저자: ${formatAuthors(metadata.authors)} (${formatYear(metadata.year)})`,
    `출처: ${metadata.venue ?? '출처 미상'}`,
    `원문 링크: ${metadata.url ?? '링크 없음'}`,
    `초록: ${metadata.abstract ?? '초록 없음'}`,
  ].join('\n');
}

/**
 * Formats selected saved papers as NotebookLM-ready plain text: one numbered
 * entry per paper, separated by a `---` line. Returns '' for an empty
 * selection — never a lone separator.
 */
export function formatForNotebookLm(papers: IpcSavedPaper[]): string {
  return papers.map((paper, index) => formatEntryForNotebookLm(paper, index)).join('\n---\n');
}

/** Korean confirmation message shown after a NotebookLM-export copy. */
export function notebookLmCopyMessage(count: number): string {
  return `${count}건을 복사했어요. 노트북LM 안내를 보고 붙여넣거나, 링크에서 PDF를 받아 올려 보세요.`;
}
