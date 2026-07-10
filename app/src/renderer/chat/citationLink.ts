/**
 * Shared helpers for the research-report "[n]" citation → reference-list
 * jump (Task T35 fix#2). Kept separate from `markdownLite.ts` (which parses
 * block-level markdown-lite structure) and from `ResearchProgress.tsx`
 * (which owns the DOM/scroll side effects) so the text-splitting logic is
 * unit-testable without a DOM.
 *
 * Only `ResearchProgress.tsx`'s report body uses this — plain chat bubbles
 * (`MessageList.tsx`) intentionally do not, since "[n]" only has a matching
 * reference list in research results.
 */

export interface CitationSegment {
  text: string;
  /** Reference-list number this segment links to, or `null` for plain text. */
  citation: number | null;
}

const CITATION_RE = /\[(\d+)\]/g;

/**
 * Splits `text` around `[n]` citation markers so callers can render the
 * bracketed number (including the brackets) as a distinct clickable
 * segment, and everything else as plain text.
 */
export function splitCitationSegments(text: string): CitationSegment[] {
  const segments: CitationSegment[] = [];
  let lastIndex = 0;
  CITATION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CITATION_RE.exec(text)) !== null) {
    const num = Number.parseInt(match[1] ?? '', 10);
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), citation: null });
    }
    segments.push({ text: match[0], citation: Number.isFinite(num) ? num : null });
    lastIndex = CITATION_RE.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), citation: null });
  }
  if (segments.length === 0) {
    segments.push({ text, citation: null });
  }
  return segments;
}

/**
 * DOM id assigned to a numbered reference-list row (`ReferenceRow` in
 * `ResearchProgress.tsx`) — shared by the jump target (the row itself) and
 * the jump source (the in-report citation link's click handler), so the two
 * can never drift out of sync.
 */
export function referenceElementId(number: number): string {
  return `research-ref-${number}`;
}

/** How long the jump-target row stays highlighted after a citation click. */
export const CITATION_HIGHLIGHT_MS = 1500;
