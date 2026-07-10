import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deriveTitle } from '../../src/core/chat/sessionModel';
import { ChatSessionStore } from '../../src/core/chat/sessionStore';
import type { ChatMessage } from '../../src/core/chat/types';

function message(role: ChatMessage['role'], content: string): ChatMessage {
  return { role, content, at: new Date().toISOString() };
}

describe('deriveTitle (FR-CHM-002)', () => {
  it('truncates to 40 characters', () => {
    const long = 'A'.repeat(60);

    expect(deriveTitle(long)).toBe('A'.repeat(40));
  });

  it('strips newlines, collapsing multi-line text into one line', () => {
    expect(deriveTitle('첫 줄\n둘째 줄\r\n셋째 줄')).toBe('첫 줄 둘째 줄 셋째 줄');
  });

  it('falls back to "새 대화" for empty or whitespace-only text', () => {
    expect(deriveTitle('')).toBe('새 대화');
    expect(deriveTitle('   \n  ')).toBe('새 대화');
  });
});

describe('ChatSessionStore', () => {
  let workDir: string;
  let chatsDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'tsa-chat-session-test-'));
    chatsDir = join(workDir, 'chats');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  describe('createSession() (FR-CHM-001/002)', () => {
    it('derives the title from the first user turn and persists it', () => {
      const store = new ChatSessionStore(chatsDir);

      const session = store.createSession('연구 주제를 어떻게 좁혀야 할까?');

      expect(session.title).toBe('연구 주제를 어떻게 좁혀야 할까?');
      expect(session.messages).toEqual([]);
      expect(store.get(session.id)).toEqual(session);
    });

    it('uses "새 대화" as the title when firstUserText is omitted', () => {
      const store = new ChatSessionStore(chatsDir);

      const session = store.createSession();

      expect(session.title).toBe('새 대화');
    });

    it('assigns unique ids across multiple calls', () => {
      const store = new ChatSessionStore(chatsDir);

      const first = store.createSession('첫 질문');
      const second = store.createSession('둘째 질문');

      expect(first.id).not.toBe(second.id);
    });
  });

  describe('appendTurn() (FR-CHM-001)', () => {
    it('replaces the full message history and bumps updatedAt', async () => {
      const store = new ChatSessionStore(chatsDir);
      const session = store.createSession('첫 질문');

      await new Promise((resolve) => setTimeout(resolve, 5));
      const history = [message('user', '첫 질문'), message('assistant', '답변')];
      const updated = store.appendTurn(session.id, history);

      expect(updated?.messages).toEqual(history);
      expect(updated?.updatedAt).not.toBe(session.createdAt);
    });

    it('overwrites a previous transcript wholesale on the next call (not append-only)', () => {
      const store = new ChatSessionStore(chatsDir);
      const session = store.createSession('첫 질문');
      store.appendTurn(session.id, [message('user', '첫 질문'), message('assistant', '답변1')]);

      const secondHistory = [
        message('user', '첫 질문'),
        message('assistant', '답변1'),
        message('user', '둘째 질문'),
        message('assistant', '답변2'),
      ];
      const result = store.appendTurn(session.id, secondHistory);

      expect(result?.messages).toHaveLength(4);
      expect(store.get(session.id)?.messages).toEqual(secondHistory);
    });

    it('returns undefined for an unknown session id', () => {
      const store = new ChatSessionStore(chatsDir);

      expect(store.appendTurn('missing-id', [message('user', 'hi')])).toBeUndefined();
    });
  });

  describe('listSummaries() (FR-CHM-002)', () => {
    it('returns entries sorted by most-recently-updated first', () => {
      const store = new ChatSessionStore(chatsDir);
      const older = store.createSession('오래된 대화');
      const newer = store.createSession('최근 대화');
      store.appendTurn(older.id, [message('user', 'x')]);
      // Force distinguishable ordering regardless of clock resolution.
      store.rename(newer.id, '최근 대화(갱신)');

      const summaries = store.listSummaries();

      expect(summaries.map((s) => s.id)).toContain(older.id);
      expect(summaries.map((s) => s.id)).toContain(newer.id);
      expect(summaries[0]?.id).toBe(newer.id);
    });

    it('reports the correct messageCount without including the full transcript', () => {
      const store = new ChatSessionStore(chatsDir);
      const session = store.createSession('질문');
      store.appendTurn(session.id, [message('user', 'a'), message('assistant', 'b'), message('user', 'c')]);

      const summaries = store.listSummaries();
      const summary = summaries.find((s) => s.id === session.id);

      expect(summary?.messageCount).toBe(3);
      expect(summary).not.toHaveProperty('messages');
    });

    it('returns an empty list when the chats directory does not exist yet', () => {
      const store = new ChatSessionStore(chatsDir);

      expect(store.listSummaries()).toEqual([]);
    });
  });

  describe('get()', () => {
    it('returns the full session including messages', () => {
      const store = new ChatSessionStore(chatsDir);
      const session = store.createSession('질문');
      store.appendTurn(session.id, [message('user', '질문'), message('assistant', '답')]);

      const fetched = store.get(session.id);

      expect(fetched?.messages).toHaveLength(2);
    });

    it('returns undefined for a missing id', () => {
      const store = new ChatSessionStore(chatsDir);

      expect(store.get('missing-id')).toBeUndefined();
    });
  });

  describe('remove()', () => {
    it('deletes a session file and excludes it from listSummaries afterward', () => {
      const store = new ChatSessionStore(chatsDir);
      const session = store.createSession('질문');

      const removed = store.remove(session.id);

      expect(removed).toBe(true);
      expect(store.get(session.id)).toBeUndefined();
      expect(store.listSummaries()).toEqual([]);
    });

    it('returns false when the session does not exist', () => {
      const store = new ChatSessionStore(chatsDir);

      expect(store.remove('missing-id')).toBe(false);
    });
  });

  describe('path-escape id rejection (audit H1 defense-in-depth)', () => {
    it('get() never reads a file outside chatsDir for a "../.." id', () => {
      const store = new ChatSessionStore(chatsDir);
      store.createSession('질문');
      // chatsDir = workDir/chats — '../secret' would resolve to
      // workDir/secret.json, a sibling file this store must never reach.
      const escapeTarget = join(chatsDir, '..', 'secret.json');
      mkdirSync(dirname(escapeTarget), { recursive: true });
      writeFileSync(escapeTarget, JSON.stringify({ sentinel: true }), 'utf-8');

      expect(store.get('../secret')).toBeUndefined();
      expect(existsSync(escapeTarget)).toBe(true);
    });

    it('remove() never deletes a file outside chatsDir for a "../.." id', () => {
      const store = new ChatSessionStore(chatsDir);
      const escapeTarget = join(chatsDir, '..', 'secret.json');
      mkdirSync(dirname(escapeTarget), { recursive: true });
      writeFileSync(escapeTarget, JSON.stringify({ sentinel: true }), 'utf-8');

      expect(store.remove('../secret')).toBe(false);

      expect(existsSync(escapeTarget)).toBe(true);
    });
  });

  describe('rename()', () => {
    it('updates the title and bumps updatedAt', () => {
      const store = new ChatSessionStore(chatsDir);
      const session = store.createSession('원래 제목');

      const renamed = store.rename(session.id, '새 제목');

      expect(renamed?.title).toBe('새 제목');
      expect(store.get(session.id)?.title).toBe('새 제목');
    });

    it('returns undefined for an unknown id', () => {
      const store = new ChatSessionStore(chatsDir);

      expect(store.rename('missing-id', '새 제목')).toBeUndefined();
    });
  });

  describe('corrupted file handling', () => {
    it('skips an unparsable session file in listSummaries() and get()', () => {
      const store = new ChatSessionStore(chatsDir);
      const good = store.createSession('정상 대화');
      mkdirSync(chatsDir, { recursive: true });
      writeFileSync(join(chatsDir, 'broken-id.json'), '{ not valid json', 'utf-8');

      const summaries = store.listSummaries();

      expect(summaries.map((s) => s.id)).toEqual([good.id]);
      expect(store.get('broken-id')).toBeUndefined();
    });

    it('skips a well-formed JSON file that does not match the ChatSession shape', () => {
      const store = new ChatSessionStore(chatsDir);
      mkdirSync(chatsDir, { recursive: true });
      writeFileSync(join(chatsDir, 'shape-mismatch.json'), JSON.stringify({ hello: 'world' }), 'utf-8');

      expect(store.listSummaries()).toEqual([]);
      expect(store.get('shape-mismatch')).toBeUndefined();
    });
  });

  describe('atomicity', () => {
    it('leaves no stray .tmp file behind after save', () => {
      const store = new ChatSessionStore(chatsDir);
      store.createSession('질문');

      const entries = readdirSync(chatsDir);

      expect(entries.some((name) => name.endsWith('.tmp'))).toBe(false);
    });

    it('overwrites the existing file in place on repeated saves', () => {
      const store = new ChatSessionStore(chatsDir);
      const session = store.createSession('질문');
      store.rename(session.id, '제목 1');
      store.rename(session.id, '제목 2');

      expect(existsSync(join(chatsDir, `${session.id}.json`))).toBe(true);
      expect(store.get(session.id)?.title).toBe('제목 2');
      expect(readdirSync(chatsDir).filter((name) => name.startsWith(session.id))).toHaveLength(1);
    });
  });
});
