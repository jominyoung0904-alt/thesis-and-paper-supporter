/**
 * Domain model for a single persisted chat (idea-meeting) session (FR-CHM-001~003).
 *
 * One `ChatSession` maps to one file `{chatsDir}/{id}.json` under a
 * project's data directory (see sessionStore.ts). The store treats
 * `messages` as a whole-history replacement on every save (design decision
 * 2, research.md: auto-save on every turn) — this module only defines the
 * shape and construction/validation helpers.
 */

import { randomUUID } from 'node:crypto';

import type { ChatMessage } from './types';

/** Bump when the on-disk shape of `ChatSession` changes incompatibly. */
export const CHAT_SESSION_SCHEMA_VERSION = 1;

/** Max characters kept from the first user turn when deriving a session title (FR-CHM-002). */
const TITLE_MAX_LENGTH = 40;

/** Fallback title used when no usable text is available to derive one from. */
const UNTITLED_SESSION_TITLE = '새 대화';

/** A single persisted idea-meeting chat session, including its full transcript. */
export interface ChatSession {
  schemaVersion: number;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

/** Lightweight listing entry — excludes the full transcript (FR-CHM-002). */
export interface ChatSessionSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

export interface CreateChatSessionInput {
  id?: string;
  /** Explicit title. Takes priority over `firstUserText`-derived titles when given. */
  title?: string;
  /** First user turn text, used to derive a title when `title` is not given. */
  firstUserText?: string;
  createdAt?: string;
  messages?: ChatMessage[];
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Derives a session title (FR-CHM-002) from the first user turn: takes the
 * leading `TITLE_MAX_LENGTH` characters, strips newlines (so a multi-line
 * question collapses to one display line), and falls back to a fixed
 * placeholder when the result would be empty (e.g. whitespace-only input).
 */
export function deriveTitle(firstUserText: string): string {
  const collapsed = firstUserText.replace(/\r?\n/g, ' ').trim();
  if (!collapsed) return UNTITLED_SESSION_TITLE;
  return collapsed.slice(0, TITLE_MAX_LENGTH);
}

/** Builds a new `ChatSession`, deriving the title from `firstUserText` when `title` is not given explicitly. */
export function createChatSession(input: CreateChatSessionInput = {}): ChatSession {
  const timestamp = input.createdAt ?? nowIso();
  const explicitTitle = input.title?.trim();
  const title = explicitTitle || (input.firstUserText ? deriveTitle(input.firstUserText) : UNTITLED_SESSION_TITLE);

  return {
    schemaVersion: CHAT_SESSION_SCHEMA_VERSION,
    id: input.id ?? randomUUID(),
    title,
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: input.messages ? [...input.messages] : [],
  };
}

/** Reduces a full `ChatSession` to its listing summary (FR-CHM-002). */
export function toSummary(session: ChatSession): ChatSessionSummary {
  return {
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
  };
}

/** Runtime shape check used by `ChatSessionStore` to detect a corrupted session file. */
export function isChatSession(value: unknown): value is ChatSession {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;

  if (typeof candidate.schemaVersion !== 'number') return false;
  if (typeof candidate.id !== 'string') return false;
  if (typeof candidate.title !== 'string') return false;
  if (typeof candidate.createdAt !== 'string') return false;
  if (typeof candidate.updatedAt !== 'string') return false;
  if (!Array.isArray(candidate.messages)) return false;

  return candidate.messages.every(isChatMessageShape);
}

function isChatMessageShape(entry: unknown): entry is ChatMessage {
  if (typeof entry !== 'object' || entry === null) return false;
  const message = entry as Record<string, unknown>;
  return (
    (message.role === 'user' || message.role === 'assistant' || message.role === 'summary') &&
    typeof message.content === 'string' &&
    typeof message.at === 'string'
  );
}
