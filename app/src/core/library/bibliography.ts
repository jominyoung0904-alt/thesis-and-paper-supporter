/**
 * APA-7-approximate bibliography text formatting for the literature library
 * (FR-LIB-003). Produces plain text intended for clipboard copy — the actual
 * clipboard write is a renderer/UI concern and is wired up separately.
 *
 * Design constraints from FR-RES-005 / SPEC-TSA-002 design decision context:
 * - `PaperMetadata.authors` are already free-text strings sourced from the
 *   academic API layer. We never attempt surname/initial reconstruction —
 *   only comma/`&` joining of the strings as-is.
 * - Real APA 7 truncates author lists beyond 20 (first 19 + "..." + last).
 *   We deliberately skip that rule and simply list every author — this is a
 *   documented simplification, not an oversight.
 * - Korean-language entries use comma-only author joining (no "&"), which
 *   matches Korean academic citation convention more closely than the
 *   English ampersand rule.
 *
 * Extensibility: `formatApa`/`formatApaList` are named with an explicit
 * "Apa" suffix so a future `formatBibtex`/`formatBibtexList` pair (FR-LIB-004)
 * can be added alongside without refactoring these two functions.
 */

import type { PaperMetadata } from '../academic-api/types';

/** Matches any Hangul syllable (U+AC00-U+D7A3) — used for coarse language detection. */
const HANGUL_REGEX = /[가-힣]/;

/** Whether `text` contains at least one Hangul character. */
export function isKoreanText(text: string): boolean {
  return HANGUL_REGEX.test(text);
}

/**
 * Language classification for a single paper, based on whether its title or
 * any author name contains Hangul. Drives both author-joining style
 * (comma vs. "&") and cross-language sort ordering in {@link formatApaList}.
 */
export function isKoreanPaper(paper: PaperMetadata): boolean {
  const sample = `${paper.title} ${paper.authors.join(' ')}`;
  return isKoreanText(sample);
}

/**
 * Joins raw author-name strings per the language-specific simplified rule
 * (see module doc). Returns '' when there are no authors so callers can
 * omit the segment entirely rather than emit a dangling separator.
 */
function formatAuthorsSegment(authors: string[], korean: boolean): string {
  if (authors.length === 0) return '';
  if (authors.length === 1) return authors[0] ?? '';
  if (korean) return authors.join(', ');

  // English: 2+ authors get "..., & Last" — no truncation past this simplified rule.
  const last = authors[authors.length - 1];
  const rest = authors.slice(0, -1);
  return `${rest.join(', ')}, & ${last}`;
}

/**
 * Formats a single `PaperMetadata` as an APA-7-approximate reference string.
 * Null fields degrade gracefully: no year becomes "(n.d.)", missing venue
 * or url segments are omitted entirely (never rendered as bare periods).
 */
export function formatApa(paper: PaperMetadata): string {
  const korean = isKoreanPaper(paper);
  const authorPart = formatAuthorsSegment(paper.authors, korean);
  const yearPart = paper.year === null ? '(n.d.)' : `(${paper.year})`;

  const segments: string[] = [];
  segments.push(authorPart ? `${authorPart} ${yearPart}.` : `${yearPart}.`);
  segments.push(`${paper.title}.`);
  if (paper.venue) segments.push(`${paper.venue}.`);
  if (paper.url) segments.push(paper.url);

  return segments.join(' ');
}

/** Sort key: first author name when available, otherwise the title. */
function sortKey(paper: PaperMetadata): string {
  return paper.authors[0] ?? paper.title;
}

/**
 * Orders papers for list output: Korean-language entries first (grouped),
 * then each group sorted by first-author/title using the matching locale
 * collator. This keeps mixed-language lists readable instead of interleaving
 * scripts under a single naive comparator.
 */
function compareForSort(a: PaperMetadata, b: PaperMetadata): number {
  const aKorean = isKoreanPaper(a);
  const bKorean = isKoreanPaper(b);
  if (aKorean !== bKorean) return aKorean ? -1 : 1;
  return sortKey(a).localeCompare(sortKey(b), aKorean ? 'ko' : 'en');
}

/**
 * Formats a list of papers as newline-joined APA-7-approximate references
 * (FR-LIB-003), sorted per {@link compareForSort}. Returns '' for an empty
 * list — never a lone newline or trailing separator.
 */
export function formatApaList(papers: PaperMetadata[]): string {
  return [...papers]
    .sort(compareForSort)
    .map(formatApa)
    .join('\n');
}
