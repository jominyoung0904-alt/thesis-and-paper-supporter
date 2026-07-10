/**
 * History compaction for the idea-meeting chat (FR-CHT-003): once the
 * approximated token cost of the transcript exceeds a threshold, the oldest
 * half of the history is collapsed into a single Korean summary via one LLM
 * call, so per-turn cost stays bounded as a conversation grows long.
 *
 * Compaction is strictly best-effort: if the summarization call fails for any
 * reason, the original history is returned untouched. A conversation must
 * never be broken by a failed compaction attempt.
 */

import type { LlmAdapter } from '../llm';
import type { ChatMessage } from './types';

/** Approximate characters-per-token used for the token heuristic (mixed ko/en text). */
const APPROX_CHARS_PER_TOKEN = 2.5;

const COMPACTION_SYSTEM =
  '너는 대화 이력을 압축 요약하는 보조 도구다. 아래는 사용자와 AI가 나눈 연구 상담 대화의 일부다. ' +
  '이 내용을 한국어로 간결하게 요약하되, 핵심 논점, 이미 내려진 연구 결정, 아직 해결되지 않은 질문은 ' +
  '반드시 보존하라. 인사말이나 잡담은 생략하라.';

export interface CompactionResult {
  history: ChatMessage[];
  /** True when compaction actually replaced the oldest half with a summary. */
  compacted: boolean;
}

/**
 * Character-count heuristic token estimate for a chat history (mixed ko/en
 * text), mirroring the same heuristic used by the memory serializer.
 */
export function approxHistoryTokens(history: readonly ChatMessage[]): number {
  const chars = history.reduce((sum, m) => sum + m.content.length, 0);
  return Math.ceil(chars / APPROX_CHARS_PER_TOKEN);
}

/**
 * Compacts the oldest half of `history` into one `summary` message when
 * `approxTokensFn(history)` exceeds `threshold`. Below the threshold (or when
 * there are fewer than 2 messages to work with), the history is returned
 * unchanged. On any summarization failure, the original history is returned
 * unchanged as well — compaction is skipped, never fatal.
 */
export async function maybeCompact(
  history: ChatMessage[],
  approxTokensFn: (history: ChatMessage[]) => number,
  threshold: number,
  llm: LlmAdapter,
  model: string,
): Promise<CompactionResult> {
  if (history.length < 2 || approxTokensFn(history) <= threshold) {
    return { history, compacted: false };
  }

  const splitAt = Math.floor(history.length / 2);
  const older = history.slice(0, splitAt);
  const newer = history.slice(splitAt);
  const transcript = older.map((m) => `${roleLabel(m.role)}: ${m.content}`).join('\n');

  try {
    const response = await llm.chat({
      model,
      system: COMPACTION_SYSTEM,
      messages: [{ role: 'user', content: transcript }],
    });
    const summary: ChatMessage = {
      role: 'summary',
      content: response.text.trim(),
      at: new Date().toISOString(),
    };
    return { history: [summary, ...newer], compacted: true };
  } catch {
    // Best-effort: a failed summarization call must never break the conversation.
    return { history, compacted: false };
  }
}

function roleLabel(role: ChatMessage['role']): string {
  if (role === 'user') return '사용자';
  if (role === 'assistant') return 'AI';
  return '요약';
}
