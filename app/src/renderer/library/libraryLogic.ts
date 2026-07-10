/**
 * Pure view-logic helpers for the literature library screen (Task T45 /
 * SPEC-TSA-002, FR-LIB-001/002). Deliberately framework-free — no React, no
 * DOM — so it stays unit-testable without a DOM environment, matching the
 * pattern in `../writing/gateViewLogic.ts` / `../research/researchHistoryLogic.ts`.
 *
 * `SOURCE_LABELS` mirrors (rather than imports) `core/research-pipeline/types.ts`'s
 * `SOURCE_LABELS` constant, and `MEMO_MAX_LENGTH` mirrors `core/library/model.ts`'s
 * constant of the same name — the same shared/core decoupling pattern the
 * IPC layer itself already uses (see `shared/ipc/library.ts`'s doc comment),
 * so this renderer directory never imports `core/` internals.
 */

import type { IpcAcademicSource, IpcPaperMetadata, IpcSavedPaper } from '../../shared/ipc-channels';

/** Human-readable Korean labels for each academic source (mirrors `core/research-pipeline/types.ts`'s `SOURCE_LABELS`). */
export const SOURCE_LABELS: Record<IpcAcademicSource, string> = {
  kci: 'KCI',
  scienceon: 'ScienceON',
  semanticscholar: 'Semantic Scholar',
  openalex: '국내외 통합(OpenAlex)',
  googlecse: '학위논문(RISS·구글 검색)',
  naverdoc: '학위논문·보고서(네이버 전문정보)',
};

/** Ready-to-display Korean label for a raw `IpcAcademicSource` id. */
export function sourceLabel(source: IpcAcademicSource): string {
  return SOURCE_LABELS[source] ?? source;
}

/** Mirrors `core/library/model.ts`'s `MEMO_MAX_LENGTH` — the one-line memo character cap (FR-LIB-002). */
export const MEMO_MAX_LENGTH = 500;

/** Whether `memo` exceeds the server-enforced character cap. */
export function isMemoTooLong(memo: string): boolean {
  return memo.length > MEMO_MAX_LENGTH;
}

/** Characters remaining before `memo` hits the cap (can go negative while the user is still typing). */
export function remainingMemoChars(memo: string): number {
  return MEMO_MAX_LENGTH - memo.length;
}

/**
 * The `(source, externalId)` duplicate-detection key shared by
 * `library:save`'s server-side check and the renderer's own "already saved"
 * badge — see `core/library/store.ts`'s `has()`.
 */
export function paperKey(source: IpcAcademicSource, externalId: string): string {
  return `${source}:${externalId}`;
}

/** Builds the set of `paperKey`s for every currently saved paper, for O(1) "already saved" lookups. */
export function buildSavedKeySet(papers: IpcSavedPaper[]): Set<string> {
  return new Set(papers.map((entry) => paperKey(entry.paper.source, entry.paper.externalId)));
}

/** Whether `metadata` matches an already-saved paper's `(source, externalId)` key. */
export function isPaperSaved(savedKeys: Set<string>, metadata: IpcPaperMetadata): boolean {
  return savedKeys.has(paperKey(metadata.source, metadata.externalId));
}

/** Korean author list, falling back to a placeholder when the paper has no listed authors. */
export function formatAuthors(authors: string[]): string {
  return authors.length > 0 ? authors.join(', ') : '저자 미상';
}

/** Korean year label, falling back to a placeholder when the year is unknown. */
export function formatYear(year: number | null): string {
  return year !== null ? String(year) : '연도 미상';
}

/** Formats an ISO timestamp for Korean, non-technical readers. Falls back to the raw string if unparsable. */
export function formatSavedAt(savedAt: string): string {
  const parsed = new Date(savedAt);
  if (Number.isNaN(parsed.getTime())) return savedAt;
  return parsed.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Extracts a user-facing Korean error message, with a safe fallback for non-Error throws. */
export function toDisplayErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : '문헌 보관함을 불러오지 못했어요. 다시 시도해 주세요.';
}
