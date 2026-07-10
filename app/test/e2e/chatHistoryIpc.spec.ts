/**
 * T53 (SPEC-TSA-002) — `chat-history:*` IPC + `recordChatTurn` autosave hook,
 * assembled directly against `registerChatHistoryHandlers`/`recordChatTurn`
 * with `electron` mocked (same `ipcMain.handle` capture pattern as
 * `projectManagementIpc.spec.ts`). `chatHandlers.ts`'s real `chat:send` wiring
 * of the autosave hook is out of this file's scope (central integration owns
 * that diff) — `recordChatTurn` is exercised directly here to stand in for
 * "a chat turn just completed successfully".
 */

import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { ipcHandlers } = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, payload: unknown) => Promise<unknown>) => {
      ipcHandlers.set(channel, handler);
    },
  },
}));

import { ConversationManager } from '../../src/core/chat/conversation';
import type { ChatMessage } from '../../src/core/chat/types';
import { ChatSessionStore } from '../../src/core/chat/sessionStore';
import type { LlmAdapter } from '../../src/core/llm';
import type { ConversationManagerHolder } from '../../src/main/ipc/guards';
import { createActiveChatSession, recordChatTurn, registerChatHistoryHandlers } from '../../src/main/ipc/chatHistoryHandlers';
import type { ActiveChatSession } from '../../src/main/ipc/chatHistoryHandlers';
import { ChatHistoryChannels } from '../../src/shared/ipc/chatHistory';
import type {
  ChatHistoryListResult,
  ChatHistoryLoadResult,
  ChatHistoryNewResult,
  ChatHistoryRemoveResult,
} from '../../src/shared/ipc/chatHistory';
import { createTempWorkspace, type TempWorkspace } from './firstRunHelpers';

function iso(): string {
  return new Date().toISOString();
}

function msg(role: ChatMessage['role'], content: string): ChatMessage {
  return { role, content, at: iso() };
}

/** Never invoked in these tests — history load/new/remove/list never call the LLM. */
const neverCalledAdapter: LlmAdapter = {
  provider: 'gemini',
  async chat() {
    throw new Error('test setup error: LLM adapter should never be invoked in chatHistoryIpc.spec.ts');
  },
};

function makeConversationHolder(): ConversationManagerHolder {
  let manager: ConversationManager | null = null;
  return {
    get: () => manager,
    build: () =>
      new ConversationManager({
        llm: neverCalledAdapter,
        model: 'test-model',
        getMemory: () => ({ text: '', isEmpty: true, approxTokens: 0 }),
      }),
    set: (next) => {
      manager = next;
    },
  };
}

async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const handler = ipcHandlers.get(channel);
  if (!handler) throw new Error(`handler not registered for channel: ${channel}`);
  return handler({ sender: { send: () => undefined } }, payload) as Promise<T>;
}

interface Assembled {
  ws: TempWorkspace;
  chatsDir: string;
  conversation: ConversationManagerHolder;
  activeSession: ActiveChatSession;
}

function assemble(prefix: string): Assembled {
  const ws = createTempWorkspace(prefix);
  const chatsDir = join(ws.paths.dataDir, 'chats');
  const conversation = makeConversationHolder();
  const activeSession = createActiveChatSession();

  registerChatHistoryHandlers({ getChatsDir: () => chatsDir, conversation, activeSession });

  return { ws, chatsDir, conversation, activeSession };
}

beforeEach(() => {
  ipcHandlers.clear();
});

describe('chat-history:* IPC + recordChatTurn autosave (FR-CHM-001~004)', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()!();
  });

  it('recordChatTurn auto-saves after the first turn and appends (not duplicates) on the second', () => {
    const a = assemble('chat-history-autosave-');
    cleanups.push(a.ws.cleanup);

    recordChatTurn(a.chatsDir, a.activeSession, [msg('user', '연구 주제 관련 질문'), msg('assistant', '답변1')]);
    const idAfterFirst = a.activeSession.get();
    expect(idAfterFirst).not.toBeNull();

    recordChatTurn(a.chatsDir, a.activeSession, [
      msg('user', '연구 주제 관련 질문'),
      msg('assistant', '답변1'),
      msg('user', '두번째 질문'),
      msg('assistant', '답변2'),
    ]);
    expect(a.activeSession.get()).toBe(idAfterFirst);

    const store = new ChatSessionStore(a.chatsDir);
    const saved = store.get(idAfterFirst!);
    expect(saved?.messages).toHaveLength(4);
    expect(saved?.title).toContain('연구 주제');
  });

  it('chat-history:list returns saved session summaries, most recently updated first', async () => {
    const a = assemble('chat-history-list-');
    cleanups.push(a.ws.cleanup);

    recordChatTurn(a.chatsDir, a.activeSession, [msg('user', '질문 A')]);
    a.activeSession.clear(); // simulate starting a separate "새 대화" before the next turn
    recordChatTurn(a.chatsDir, a.activeSession, [msg('user', '질문 B')]);

    const result = await invoke<ChatHistoryListResult>(ChatHistoryChannels.CHAT_HISTORY_LIST);
    expect(result.sessions).toHaveLength(2);
    expect(result.sessions.map((s) => s.title).sort()).toEqual(['질문 A', '질문 B']);
  });

  it('chat-history:load restores the transcript into the conversation manager and returns messages for redisplay ("이어하기")', async () => {
    const a = assemble('chat-history-load-');
    cleanups.push(a.ws.cleanup);

    recordChatTurn(a.chatsDir, a.activeSession, [msg('user', '이어서 할 질문'), msg('assistant', '이전 답변')]);
    const id = a.activeSession.get()!;
    a.activeSession.clear(); // simulate having navigated away before loading it back

    const result = await invoke<ChatHistoryLoadResult>(ChatHistoryChannels.CHAT_HISTORY_LOAD, { id });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toEqual({ role: 'user', content: '이어서 할 질문', at: expect.any(String) });
    expect(a.activeSession.get()).toBe(id);
    expect(a.conversation.get()?.getHistory()).toHaveLength(2);
  });

  it('chat-history:load returns not_found for an unknown id', async () => {
    const a = assemble('chat-history-load-missing-');
    cleanups.push(a.ws.cleanup);

    const result = await invoke<ChatHistoryLoadResult>(ChatHistoryChannels.CHAT_HISTORY_LOAD, {
      id: 'does-not-exist',
    });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('chat-history:new clears the active session and resets the in-memory conversation history', async () => {
    const a = assemble('chat-history-new-');
    cleanups.push(a.ws.cleanup);

    recordChatTurn(a.chatsDir, a.activeSession, [msg('user', '첫 대화')]);
    expect(a.activeSession.get()).not.toBeNull();

    const manager = a.conversation.get() ?? a.conversation.build();
    a.conversation.set(manager);
    manager.restoreHistory([msg('user', 'stale')]);

    const result = await invoke<ChatHistoryNewResult>(ChatHistoryChannels.CHAT_HISTORY_NEW);
    expect(result).toEqual({ ok: true });
    expect(a.activeSession.get()).toBeNull();
    expect(a.conversation.get()?.getHistory()).toEqual([]);
  });

  it('chat-history:remove deletes a session file and clears the active session if it was active', async () => {
    const a = assemble('chat-history-remove-');
    cleanups.push(a.ws.cleanup);

    recordChatTurn(a.chatsDir, a.activeSession, [msg('user', '삭제될 대화')]);
    const id = a.activeSession.get()!;

    const result = await invoke<ChatHistoryRemoveResult>(ChatHistoryChannels.CHAT_HISTORY_REMOVE, { id });
    expect(result).toEqual({ ok: true });
    expect(a.activeSession.get()).toBeNull();

    const store = new ChatSessionStore(a.chatsDir);
    expect(store.get(id)).toBeUndefined();
  });

  it('chat-history:remove returns not_found for an unknown id', async () => {
    const a = assemble('chat-history-remove-missing-');
    cleanups.push(a.ws.cleanup);

    const result = await invoke<ChatHistoryRemoveResult>(ChatHistoryChannels.CHAT_HISTORY_REMOVE, {
      id: 'does-not-exist',
    });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('isolates chat sessions per project — list only reflects the currently active chatsDir', async () => {
    const wsA = createTempWorkspace('chat-history-proj-a-');
    const wsB = createTempWorkspace('chat-history-proj-b-');
    cleanups.push(wsA.cleanup, wsB.cleanup);

    let currentDir = join(wsA.paths.dataDir, 'chats');
    const conversation = makeConversationHolder();
    const activeSession = createActiveChatSession();
    registerChatHistoryHandlers({ getChatsDir: () => currentDir, conversation, activeSession });

    recordChatTurn(currentDir, activeSession, [msg('user', '프로젝트 A 대화')]);
    const listA = await invoke<ChatHistoryListResult>(ChatHistoryChannels.CHAT_HISTORY_LIST);
    expect(listA.sessions.map((s) => s.title)).toEqual(['프로젝트 A 대화']);

    // Mirrors ProjectContext's rebuild-on-switch (T39/T41): chatsDir points at
    // the new project and the active-session tracker resets (project switch hook).
    currentDir = join(wsB.paths.dataDir, 'chats');
    activeSession.clear();
    recordChatTurn(currentDir, activeSession, [msg('user', '프로젝트 B 대화')]);

    const listB = await invoke<ChatHistoryListResult>(ChatHistoryChannels.CHAT_HISTORY_LIST);
    expect(listB.sessions.map((s) => s.title)).toEqual(['프로젝트 B 대화']);
  });
});
