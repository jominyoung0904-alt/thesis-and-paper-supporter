/**
 * Idea-meeting chat conversation manager (FR-CHT-001/002/003).
 *
 * Provides a free-form (no command syntax required) chat with the AI as a
 * research consulting partner. Project memory is auto-injected into every
 * turn's system prompt (FR-CHT-002), and the assistant may flag a research
 * decision it believes the user just made via an inline `<decision>` tag —
 * this module only *proposes* that decision (`suggestedDecision`); actually
 * recording it into the research-decision history (FR-MEM-002) is left to
 * the caller (the chat UI), after explicit user confirmation.
 *
 * History compaction (FR-CHT-003) runs automatically before every outgoing
 * call so per-turn token cost stays bounded on long conversations.
 */

import type { LlmAdapter, LlmMessage, LlmRequest } from '../llm';
import type { SerializedMemory } from '../memory/serializer';
import { buildSystemPrompt } from '../memory/serializer';
import { approxHistoryTokens, maybeCompact } from './compaction';
import type { ChatMessage, ChatTurnResult, SuggestedDecision } from './types';

/** Dependencies injected into a {@link ConversationManager}. */
export interface ConversationManagerDeps {
  llm: LlmAdapter;
  model: string;
  /** Returns the current project memory, called fresh on every `send()` so it never goes stale. */
  getMemory: () => SerializedMemory;
  /** History token threshold that triggers compaction (FR-CHT-003). Default 20000. */
  compactionThresholdTokens?: number;
}

const DEFAULT_COMPACTION_THRESHOLD_TOKENS = 20_000;

const IDEA_MEETING_INSTRUCTION =
  '너는 사용자의 논문 연구를 함께 고민하는 연구 상담 파트너다. 특정 기능 명령 없이 자유롭게 대화하며, ' +
  '사용자의 질문과 고민에 대해 근거 있는 조언을 제공하라. ' +
  '대화 중 사용자가 연구 방법론 선택, 연구 범위 확정, 핵심 가설 채택 등 중요한 연구 결정을 내렸다고 ' +
  '판단되면, 응답의 맨 마지막 줄에 아래 형식의 태그 하나만 덧붙여라(그 외에는 절대 태그를 붙이지 마라):\n' +
  '<decision>{"what":"무엇을 결정했는지","why":"왜 그렇게 결정했는지"}</decision>\n' +
  '결정이 없다면 태그를 붙이지 마라.';

/** Matches a trailing `<decision>{...}</decision>` tag at the very end of the reply. */
const DECISION_TAG_RE = /<decision>([\s\S]*?)<\/decision>\s*$/;

/**
 * Stateful manager for one idea-meeting chat session. Not thread-safe by
 * design — one instance backs one active session in the renderer/main
 * process; concurrent sessions get their own instance.
 */
export class ConversationManager {
  private history: ChatMessage[] = [];

  constructor(private readonly deps: ConversationManagerDeps) {}

  /**
   * Sends `userText` as the next user turn. Runs compaction first (if the
   * accumulated history exceeds the configured threshold), then calls the
   * LLM with the full (possibly compacted) history plus the new turn.
   */
  // @AX:ANCHOR: [AUTO] single per-turn entry point for the idea-meeting chat — invoked from main/ipc/handlers.ts. Related: FR-CHT-001
  async send(userText: string): Promise<ChatTurnResult> {
    const threshold = this.deps.compactionThresholdTokens ?? DEFAULT_COMPACTION_THRESHOLD_TOKENS;
    const { history } = await maybeCompact(
      this.history,
      approxHistoryTokens,
      threshold,
      this.deps.llm,
      this.deps.model,
    );
    this.history = history;
    this.history.push({ role: 'user', content: userText, at: nowIso() });

    const system = buildSystemPrompt(this.deps.getMemory(), IDEA_MEETING_INSTRUCTION);
    const request: LlmRequest = {
      model: this.deps.model,
      system,
      messages: toLlmMessages(this.history),
    };
    const response = await this.deps.llm.chat(request);

    const { text, decision } = extractDecision(response.text);
    this.history.push({ role: 'assistant', content: text, at: nowIso() });

    const result: ChatTurnResult = { reply: text, usage: response.usage };
    if (decision) result.suggestedDecision = decision;
    return result;
  }

  /** Returns a copy of the full transcript, in order, for UI rendering. */
  getHistory(): ChatMessage[] {
    return [...this.history];
  }

  /** Replaces the in-memory transcript wholesale — used to restore a saved session. */
  restoreHistory(messages: ChatMessage[]): void {
    this.history = [...messages];
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Converts the internal transcript into the `user`/`assistant`-only shape
 * the LLM adapter expects. `summary` entries are folded in as a labeled user
 * message. Consecutive same-role entries (e.g. a summary immediately
 * followed by another user turn) are merged into one message so the request
 * never violates a provider's strict role-alternation requirement.
 */
function toLlmMessages(history: readonly ChatMessage[]): LlmMessage[] {
  const merged: LlmMessage[] = [];
  for (const m of history) {
    const role: LlmMessage['role'] = m.role === 'assistant' ? 'assistant' : 'user';
    const content = m.role === 'summary' ? `[이전 대화 요약]\n${m.content}` : m.content;
    const last = merged[merged.length - 1];
    if (last && last.role === role) {
      last.content = `${last.content}\n\n${content}`;
    } else {
      merged.push({ role, content });
    }
  }
  return merged;
}

/**
 * Splits a trailing `<decision>{...}</decision>` tag out of the reply text.
 * On a well-formed tag with non-empty `what`/`why`, the tag is stripped from
 * the returned text and its payload is returned as `decision`. On any parse
 * failure (malformed JSON, missing fields), the tag is silently ignored —
 * `decision` is left undefined and the text is returned as-is.
 */
// @AX:NOTE: [AUTO] this only proposes a decision — persisting it into memory requires explicit user confirmation in the chat UI. Related: FR-MEM-002
function extractDecision(text: string): { text: string; decision?: SuggestedDecision } {
  const match = text.match(DECISION_TAG_RE);
  if (!match) return { text: text.trim() };

  try {
    const parsed = JSON.parse(match[1] ?? '') as Record<string, unknown>;
    const what = typeof parsed.what === 'string' ? parsed.what.trim() : '';
    const why = typeof parsed.why === 'string' ? parsed.why.trim() : '';
    if (what && why) {
      return { text: text.slice(0, match.index).trim(), decision: { what, why } };
    }
  } catch {
    // Malformed <decision> payload — ignore silently, keep the full text.
  }
  return { text: text.trim() };
}
