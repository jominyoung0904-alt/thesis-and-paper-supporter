/**
 * Shared types for the idea-meeting chat module (FR-CHT-001/002/003).
 *
 * The chat feature lets a user free-talk with the AI about their research
 * (no slash-command structure required). `ConversationManager` (conversation.ts)
 * and the compaction step (compaction.ts) both operate on {@link ChatMessage}.
 */

import type { LlmUsage } from '../llm';

/**
 * `user`/`assistant` are normal turns. `summary` marks a compacted history
 * segment produced by the FR-CHT-003 compaction step — it replaces a run of
 * older turns with a single condensed entry.
 */
export type ChatMessageRole = 'user' | 'assistant' | 'summary';

/** One entry in the chat transcript, suitable for UI rendering and session persistence. */
export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
  /** ISO 8601 timestamp of when this message was recorded. */
  at: string;
}

/**
 * A research decision the AI believes the user just made during the
 * conversation, pending explicit user confirmation before it is written to
 * the research-decision history (FR-MEM-002 / FR-CHT-002). This module only
 * ever *proposes* a decision — persisting it is the caller's responsibility.
 */
export interface SuggestedDecision {
  what: string;
  why: string;
}

/** Result of a single `ConversationManager.send()` turn. */
export interface ChatTurnResult {
  /** Assistant reply text with any `<decision>` tag already stripped out. */
  reply: string;
  usage: LlmUsage;
  /** Present only when the assistant's reply included a well-formed `<decision>` tag. */
  suggestedDecision?: SuggestedDecision;
}
