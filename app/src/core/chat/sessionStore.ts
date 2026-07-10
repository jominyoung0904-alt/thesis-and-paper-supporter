/**
 * Per-project chat session store (FR-CHM-001~004).
 *
 * One file per session (`{chatsDir}/{id}.json`) rather than a single
 * index-plus-payload JSON like `MemoryStore`/`ProjectIndexStore` — sessions
 * are independently sized and grow over a conversation's lifetime, so
 * keeping each on its own file avoids rewriting every other session's
 * transcript on every turn. `listSummaries()` reads the directory instead of
 * maintaining a separate index file, so there is a single source of truth
 * per session.
 *
 * Design decision 2 (research.md): auto-save happens on every turn
 * (`appendTurn`), not on a debounce — the caller passes the
 * `ConversationManager.getHistory()` snapshot and this store replaces the
 * on-disk transcript wholesale. Every write reuses the atomic
 * write-tmp-then-rename pattern established by `src/core/memory/store.ts`.
 * The directory itself is injected by the caller (typically
 * `ProjectPaths.chatsDir` from `src/main/project/projectPaths.ts`) — this
 * module has no knowledge of the project layout beyond a single directory.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { isSafeRecordId } from '../persistence/recordId';
import type { ChatSession, ChatSessionSummary } from './sessionModel';
import { createChatSession, isChatSession, toSummary } from './sessionModel';
import type { ChatMessage } from './types';

const SESSION_FILE_EXT = '.json';

/** JSON-file-backed store for one project's chat sessions (FR-CHM-*). */
export class ChatSessionStore {
  constructor(private readonly chatsDir: string) {}

  /** Creates a new empty session, deriving its title from `firstUserText` when given, and persists it immediately. */
  createSession(firstUserText?: string): ChatSession {
    const session = createChatSession(firstUserText !== undefined ? { firstUserText } : {});
    this.writeSession(session);
    return session;
  }

  /**
   * Replaces the session's transcript wholesale with `messages` (the
   * caller's current `ConversationManager.getHistory()` snapshot) and bumps
   * `updatedAt`. Returns `undefined` when the session does not exist (or its
   * file is corrupted) instead of throwing.
   */
  appendTurn(id: string, messages: ChatMessage[]): ChatSession | undefined {
    const existing = this.readSession(id);
    if (!existing) return undefined;

    const updated: ChatSession = { ...existing, messages: [...messages], updatedAt: new Date().toISOString() };
    this.writeSession(updated);
    return updated;
  }

  /** Returns listing summaries for every readable session, sorted by most recently updated first (FR-CHM-002). */
  listSummaries(): ChatSessionSummary[] {
    return this.readAllSessions()
      .map(toSummary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Returns the full session (including transcript), or `undefined` when missing or corrupted. */
  get(id: string): ChatSession | undefined {
    return this.readSession(id);
  }

  /** Deletes a session's file. Returns `false` when the file did not exist or `id` is unsafe (audit H1 defense-in-depth). */
  remove(id: string): boolean {
    if (!isSafeRecordId(id)) return false;

    const filePath = this.sessionFilePath(id);
    if (!existsSync(filePath)) return false;
    rmSync(filePath);
    return true;
  }

  /** Renames a session's title. Returns `undefined` when the session does not exist. */
  rename(id: string, title: string): ChatSession | undefined {
    const existing = this.readSession(id);
    if (!existing) return undefined;

    const updated: ChatSession = { ...existing, title, updatedAt: new Date().toISOString() };
    this.writeSession(updated);
    return updated;
  }

  // --- Internal read/write helpers ---

  private sessionFilePath(id: string): string {
    return join(this.chatsDir, `${id}${SESSION_FILE_EXT}`);
  }

  /**
   * Reads and validates a single session file. Never throws — corruption
   * (and an unsafe id — audit H1 defense-in-depth) is treated as "not found".
   */
  private readSession(id: string): ChatSession | undefined {
    if (!isSafeRecordId(id)) return undefined;

    const filePath = this.sessionFilePath(id);
    if (!existsSync(filePath)) return undefined;

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      return undefined;
    }

    return isChatSession(parsed) ? parsed : undefined;
  }

  /** Reads every session file in the directory, silently skipping any that are missing or corrupted. */
  private readAllSessions(): ChatSession[] {
    if (!existsSync(this.chatsDir)) return [];

    const sessions: ChatSession[] = [];
    for (const entry of readdirSync(this.chatsDir)) {
      if (!entry.endsWith(SESSION_FILE_EXT)) continue;
      const id = entry.slice(0, -SESSION_FILE_EXT.length);
      const session = this.readSession(id);
      if (session) sessions.push(session);
    }
    return sessions;
  }

  /** Atomically persists a session: write to a temp file, then rename over the target. */
  private writeSession(session: ChatSession): void {
    mkdirSync(this.chatsDir, { recursive: true });
    const filePath = this.sessionFilePath(session.id);
    const tmpPath = `${filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(session, null, 2), 'utf-8');
    renameSync(tmpPath, filePath);
  }
}
