/**
 * Minimal markdown-lite parser for assistant chat bubbles.
 *
 * Intentionally tiny and dependency-free (no external markdown library, per
 * task constraints): supports `# `/`## `/`### ` headings, `- `/`* ` lists,
 * and `**bold**` inline runs. Everything else stays plain text. Framework
 * free so it is unit-testable without a DOM.
 */

export interface MarkdownRun {
  text: string;
  bold: boolean;
}

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; runs: MarkdownRun[] }
  | { type: 'list'; items: MarkdownRun[][] }
  | { type: 'paragraph'; runs: MarkdownRun[] };

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const LIST_ITEM_RE = /^[-*]\s+(.*)$/;
const BOLD_RE = /\*\*(.+?)\*\*/g;

/** Splits inline text into plain/bold runs around `**bold**` markers. */
export function parseInlineRuns(text: string): MarkdownRun[] {
  const runs: MarkdownRun[] = [];
  let lastIndex = 0;
  BOLD_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BOLD_RE.exec(text)) !== null) {
    const boldText = match[1] ?? '';
    if (match.index > lastIndex) {
      runs.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    runs.push({ text: boldText, bold: true });
    lastIndex = BOLD_RE.lastIndex;
  }
  if (lastIndex < text.length) {
    runs.push({ text: text.slice(lastIndex), bold: false });
  }
  if (runs.length === 0) {
    runs.push({ text: '', bold: false });
  }
  return runs;
}

/**
 * Parses `text` into a small block AST: headings, lists, and paragraphs
 * (each paragraph's inline text parsed into bold/plain runs). Blank lines
 * separate blocks; consecutive list lines merge into one list block.
 */
export function parseMarkdownLite(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = (): void => {
    if (paragraphLines.length > 0) {
      blocks.push({ type: 'paragraph', runs: parseInlineRuns(paragraphLines.join(' ')) });
      paragraphLines = [];
    }
  };
  const flushList = (): void => {
    if (listItems.length > 0) {
      blocks.push({ type: 'list', items: listItems.map(parseInlineRuns) });
      listItems = [];
    }
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const hashes = headingMatch[1] ?? '#';
      const level = Math.min(hashes.length, 3) as 1 | 2 | 3;
      blocks.push({ type: 'heading', level, runs: parseInlineRuns(headingMatch[2] ?? '') });
      continue;
    }

    const listMatch = line.match(LIST_ITEM_RE);
    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1] ?? '');
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}
