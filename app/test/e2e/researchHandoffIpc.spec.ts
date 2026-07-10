/**
 * T51 (SPEC-TSA-002) — `research-handoff:start` IPC (FR-RSH-003), assembled
 * directly against `registerResearchHandoffHandlers` with `electron` mocked
 * (same `ipcMain.handle` capture pattern as `chatHistoryIpc.spec.ts` /
 * `researchHistoryIpc.spec.ts`). Central wiring of this channel into
 * `handlers.ts` is out of this file's scope (integration pass owns that
 * diff) — the handler is exercised directly here.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

import type { PaperMetadata } from '../../src/core/academic-api/types';
import { ConversationManager } from '../../src/core/chat/conversation';
import type { ChatMessage } from '../../src/core/chat/types';
import { ResearchHistoryStore } from '../../src/core/research-history/store';
import type { DeepResearchResult, ScreenedPaper } from '../../src/core/research-pipeline/types';
import type { LlmAdapter } from '../../src/core/llm';
import { createActiveChatSession, recordChatTurn } from '../../src/main/ipc/chatHistoryHandlers';
import type { ActiveChatSession } from '../../src/main/ipc/chatHistoryHandlers';
import type { ConversationManagerHolder } from '../../src/main/ipc/guards';
import { registerResearchHandoffHandlers } from '../../src/main/ipc/researchHandoffHandlers';
import { ResearchHandoffChannels } from '../../src/shared/ipc/researchHandoff';
import type { ResearchHandoffStartResult } from '../../src/shared/ipc/researchHandoff';

function paper(title: string): PaperMetadata {
  return {
    source: 'semanticscholar',
    externalId: `id-${title}`,
    title,
    authors: ['홍길동'],
    year: 2024,
    abstract: null,
    venue: null,
    url: `https://example.com/${title}`,
    citationCount: 0,
  };
}

function screened(title: string): ScreenedPaper {
  return { paper: paper(title), relevance: 'high' };
}

function makeResult(overrides: Partial<DeepResearchResult> = {}): DeepResearchResult {
  return {
    report: '리포트 본문 [1]',
    papers: [screened('A'), screened('B')],
    citedPapers: [screened('A')],
    relatedPapers: [screened('B')],
    queries: { ko: ['질의'], en: ['query'] },
    failedSources: [],
    usage: { calls: 3, inputTokens: 100, outputTokens: 50 },
    ...overrides,
  };
}

/** Never invoked in these tests — a handoff never itself calls the LLM. */
const neverCalledAdapter: LlmAdapter = {
  provider: 'gemini',
  async chat() {
    throw new Error('test setup error: LLM adapter should never be invoked in researchHandoffIpc.spec.ts');
  },
};

/** Always throws, simulating no LLM key registered yet (mirrors `llmService.ts`'s `build()`). */
function makeNoKeyConversationHolder(): ConversationManagerHolder {
  let manager: ConversationManager | null = null;
  return {
    get: () => manager,
    build: () => {
      throw new Error('AI 기능을 사용하려면 먼저 설정에서 API 키를 등록해 주세요.');
    },
    set: (next) => {
      manager = next;
    },
  };
}

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
  return handler({}, payload) as Promise<T>;
}

interface Harness {
  workDir: string;
  researchDir: string;
  conversation: ConversationManagerHolder;
  activeSession: ActiveChatSession;
}

function assemble(prefix: string, conversation = makeConversationHolder()): Harness {
  const workDir = mkdtempSync(join(tmpdir(), prefix));
  const researchDir = join(workDir, 'research');
  const activeSession = createActiveChatSession();

  registerResearchHandoffHandlers({ getResearchDir: () => researchDir, conversation, activeSession });

  return { workDir, researchDir, conversation, activeSession };
}

beforeEach(() => {
  ipcHandlers.clear();
});

describe('research-handoff:start IPC (FR-RSH-003)', () => {
  let harness: Harness | undefined;

  afterEach(() => {
    if (harness) rmSync(harness.workDir, { recursive: true, force: true });
    harness = undefined;
  });

  it('restores the injected transcript into the conversation manager and clears the active session', async () => {
    harness = assemble('tsa-research-handoff-start-');
    const store = new ResearchHistoryStore(harness.researchDir);
    const record = store.add('연구 질문 1', makeResult());

    // Simulate a saved chat session already being "active" before the
    // handoff — the handler must clear it so the next `chat:send` starts a
    // brand-new session instead of appending to the one just left.
    harness.activeSession.set('some-prior-session-id');

    const result = await invoke<ResearchHandoffStartResult>(ResearchHandoffChannels.RESEARCH_HANDOFF_START, {
      researchId: record.id,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.preview).toContain('연구 질문 1');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]!.role).toBe('user');
    expect(result.messages[0]!.content).toContain('연구 질문 1');
    expect(result.messages[1]!.role).toBe('assistant');

    expect(harness.activeSession.get()).toBeNull();

    const manager = harness.conversation.get();
    expect(manager).not.toBeNull();
    const restored = manager!.getHistory();
    expect(restored).toHaveLength(2);
    expect(restored[0]!.role).toBe('user');
    expect(restored[0]!.content).toContain('연구 질문 1');
  });

  it('returns not_found for an unknown research id', async () => {
    harness = assemble('tsa-research-handoff-missing-');

    const result = await invoke<ResearchHandoffStartResult>(ResearchHandoffChannels.RESEARCH_HANDOFF_START, {
      researchId: '00000000-0000-0000-0000-000000000000',
    });

    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('returns not_found for a missing/non-string researchId without an unhandled error', async () => {
    harness = assemble('tsa-research-handoff-invalid-');

    const result = await invoke<ResearchHandoffStartResult>(ResearchHandoffChannels.RESEARCH_HANDOFF_START, {});
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('returns no_key when no LLM provider key is registered yet, without throwing', async () => {
    const workDir = mkdtempSync(join(tmpdir(), 'tsa-research-handoff-nokey-'));
    const researchDir = join(workDir, 'research');
    const store = new ResearchHistoryStore(researchDir);
    const record = store.add('키 없는 상태 질문', makeResult());

    const activeSession = createActiveChatSession();
    registerResearchHandoffHandlers({
      getResearchDir: () => researchDir,
      conversation: makeNoKeyConversationHolder(),
      activeSession,
    });

    const result = await invoke<ResearchHandoffStartResult>(ResearchHandoffChannels.RESEARCH_HANDOFF_START, {
      researchId: record.id,
    });

    expect(result).toEqual({ ok: false, reason: 'no_key' });
    // A no_key failure must not clear an already-active session — nothing
    // was actually restored.
    expect(activeSession.get()).toBeNull();

    rmSync(workDir, { recursive: true, force: true });
  });

  it('a subsequent chat:send-style autosave includes the injected handoff turns (recordChatTurn integration)', async () => {
    harness = assemble('tsa-research-handoff-autosave-');
    const store = new ResearchHistoryStore(harness.researchDir);
    const record = store.add('자동저장 확인 질문', makeResult());

    await invoke<ResearchHandoffStartResult>(ResearchHandoffChannels.RESEARCH_HANDOFF_START, {
      researchId: record.id,
    });

    const manager = harness.conversation.get()!;
    // Simulate the next real chat turn appending onto the restored transcript.
    const nextTurn: ChatMessage = { role: 'user', content: '이 결과를 바탕으로 다음 단계는?', at: new Date().toISOString() };
    manager.restoreHistory([...manager.getHistory(), nextTurn]);

    const chatsDir = join(harness.workDir, 'chats');
    recordChatTurn(chatsDir, harness.activeSession, manager.getHistory());

    expect(harness.activeSession.get()).not.toBeNull();

    const { ChatSessionStore } = await import('../../src/core/chat/sessionStore');
    const sessionStore = new ChatSessionStore(chatsDir);
    const saved = sessionStore.get(harness.activeSession.get()!);
    expect(saved?.messages).toHaveLength(3);
    expect(saved?.messages[0]!.content).toContain('자동저장 확인 질문');
  });
});
