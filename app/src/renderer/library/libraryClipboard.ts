/**
 * Clipboard-writing actions for the literature library toolbar (FR-LIB-003).
 * Uses `navigator.clipboard` directly — no new IPC channel needed, since the
 * renderer already runs in a context with clipboard access (per this task's
 * scope constraint: "클립보드는 렌더러 navigator.clipboard로 충분").
 *
 * Split out from `LibraryToolbar.tsx` so the clipboard side effect is
 * independently unit-testable via `vi.stubGlobal('navigator', ...)` without
 * a DOM/component-rendering environment (this project's vitest config runs
 * under `environment: 'node'` — see `vitest.config.ts`).
 */

import { apaCopyMessage, toApaBibliography } from './libraryLogic';
import { formatForNotebookLm, notebookLmCopyMessage } from './notebookLmExport';
import type { IpcSavedPaper } from '../../shared/ipc-channels';

/** Result of a clipboard-copy action: how many papers were copied, and the Korean message to show the user. */
export interface ClipboardCopyResult {
  count: number;
  message: string;
}

/** Copies an APA-7-approximate bibliography for `papers` to the clipboard (📋 APA 서지 복사). */
export async function copyApaBibliography(papers: IpcSavedPaper[]): Promise<ClipboardCopyResult> {
  await navigator.clipboard.writeText(toApaBibliography(papers));
  return { count: papers.length, message: apaCopyMessage(papers.length) };
}

/** Copies NotebookLM-ready source text for `papers` to the clipboard (📔 노트북LM용 자료 복사). */
export async function copyForNotebookLm(papers: IpcSavedPaper[]): Promise<ClipboardCopyResult> {
  await navigator.clipboard.writeText(formatForNotebookLm(papers));
  return { count: papers.length, message: notebookLmCopyMessage(papers.length) };
}
