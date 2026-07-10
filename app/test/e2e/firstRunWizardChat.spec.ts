/**
 * T29 (SPEC-TSA-001, Wave 5) — first-run E2E, part 2: wizard save + chat
 * journeys assembled through the real `registerIpcHandlers` wiring
 * (handlers.ts, llmService.ts), with `electron` and `core/llm`'s
 * `createAdapter` mocked so no real network call is ever attempted.
 *
 * `vi.mock` calls MUST stay in this file (Vitest only hoists them reliably
 * within the file they're written in) — plain, mock-free helpers live in
 * `firstRunHelpers.ts`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { ipcHandlers, shellMock, llmScript } = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>(),
  shellMock: { openExternal: () => Promise.resolve() },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  llmScript: { current: null as any },
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, payload: unknown) => Promise<unknown>) => {
      ipcHandlers.set(channel, handler);
    },
  },
  shell: shellMock,
}));

vi.mock('../../src/core/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/llm')>();
  return {
    ...actual,
    createAdapter: () => {
      if (!llmScript.current) {
        throw new Error('test setup error: llmScript.current was not set before this createAdapter() call');
      }
      return llmScript.current;
    },
  };
});

import { createDefaultSettings, type AppSettings } from '../../src/main/config/defaultSettings';
import { KeyStore } from '../../src/main/config/keyStore';
import { loadSettings, saveSettings } from '../../src/main/config/settingsLoader';
import { registerIpcHandlers } from '../../src/main/ipc/handlers';
import { LlmApiError } from '../../src/core/llm/errors';
import { MemoryStore } from '../../src/core/memory/store';
import { serializeMemoryForPrompt } from '../../src/core/memory/serializer';
import { resolveProjectPaths } from '../../src/main/project/projectPaths';
import { IpcChannels } from '../../src/shared/ipc-channels';
import type {
  ChatSendResult,
  ProjectListResult,
  SaveProviderAndKeyResult,
  StartupState,
} from '../../src/shared/ipc-channels';
import { createReadyWorkspace, makeQueueAdapter, MockCryptoBackend, type TempWorkspace } from './firstRunHelpers';

interface Assembled {
  ws: TempWorkspace;
  keyStore: KeyStore;
  getSettings: () => AppSettings;
  invoke: <T>(channel: string, payload?: unknown) => Promise<T>;
}

/** Assembles one IPC handler set exactly the way `src/main/index.ts` bootstraps it, against a fresh temp workspace. */
function assemble(prefix: string): Assembled {
  const ws = createReadyWorkspace(prefix);
  saveSettings(ws.paths.settingsFile, createDefaultSettings());
  let settings = loadSettings(ws.paths.settingsFile).settings;
  const keyStore = new KeyStore(join(ws.paths.dataDir, 'keys.json'), new MockCryptoBackend());

  registerIpcHandlers({
    keyStore,
    settingsFile: ws.paths.settingsFile,
    getSettings: () => settings,
    setSettings: (next) => {
      settings = next;
    },
    dataDir: ws.paths.dataDir,
  });

  return {
    ws,
    keyStore,
    getSettings: () => settings,
    invoke: async <T>(channel: string, payload?: unknown): Promise<T> => {
      const handler = ipcHandlers.get(channel);
      if (!handler) throw new Error(`handler not registered for channel: ${channel}`);
      return handler({ sender: { send: () => undefined } }, payload) as Promise<T>;
    },
  };
}

beforeEach(() => {
  ipcHandlers.clear();
  llmScript.current = null;
});

describe('마법사 저장 흐름 (settings:save-provider-and-key)', () => {
  let assembled: Assembled | undefined;

  afterEach(() => {
    assembled?.ws.cleanup();
    assembled = undefined;
  });

  it('stores the encrypted key, verifies connectivity, and persists llm settings on success', async () => {
    assembled = assemble('tsa-e2e-wizard-ok-');
    const { adapter } = makeQueueAdapter('gemini', ['안녕하세요! 무엇을 도와드릴까요?']);
    llmScript.current = adapter;

    const result = await assembled.invoke<SaveProviderAndKeyResult>(IpcChannels.SETTINGS_SAVE_PROVIDER_AND_KEY, {
      provider: 'gemini',
      key: 'AIzaSyD-fake-key-1234567890',
      mode: 'free',
    });

    expect(result).toEqual({ ok: true });
    expect(assembled.keyStore.listStoredProviders()).toEqual(['gemini']);
    expect(assembled.getSettings().llm).toEqual({ provider: 'gemini', mode: 'free' });

    const onDisk = JSON.parse(readFileSync(assembled.ws.paths.settingsFile, 'utf-8'));
    expect(onDisk.llm).toEqual({ provider: 'gemini', mode: 'free' });

    const startup = await assembled.invoke<StartupState>(IpcChannels.APP_GET_STARTUP_STATE);
    expect(startup.firstRun).toBe(false);
  });

  it('surfaces a Korean auth error and never persists llm settings when the connectivity check fails', async () => {
    assembled = assemble('tsa-e2e-wizard-fail-');
    const { adapter } = makeQueueAdapter('claude', [
      () => {
        throw new LlmApiError({ kind: 'auth', provider: 'claude', providerMessage: 'invalid x-api-key' });
      },
    ]);
    llmScript.current = adapter;

    const result = await assembled.invoke<SaveProviderAndKeyResult>(IpcChannels.SETTINGS_SAVE_PROVIDER_AND_KEY, {
      provider: 'claude',
      key: 'bad-key',
      mode: 'paid',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('키');
    // Nothing is persisted unless the connectivity check succeeds:
    // neither llm settings nor the (unverified) key itself.
    expect(assembled.getSettings().llm).toEqual({ provider: 'gemini', mode: 'free' });
    expect(assembled.keyStore.listStoredProviders()).toEqual([]);
  });
});

describe('S3 — 한국어 에러 메시지, chat:send 종단 검증', () => {
  let assembled: Assembled | undefined;

  afterEach(() => {
    assembled?.ws.cleanup();
    assembled = undefined;
  });

  it('translates a quota-exhausted LLM failure into Korean, non-retryable guidance', async () => {
    assembled = assemble('tsa-e2e-s3-');

    // handlers.ts rebuilds (and llmService caches) the conversation adapter
    // right after a successful save, so a single mocked adapter instance
    // must cover BOTH the wizard's connectivity-check call (queue[0]) AND
    // the subsequent chat:send call (queue[1]) — reassigning
    // `llmScript.current` after the save would have no effect, since the
    // adapter is already built and cached by then.
    const { adapter } = makeQueueAdapter('gemini', [
      '연결 확인 완료',
      () => {
        throw new LlmApiError({
          kind: 'quota-exhausted',
          provider: 'gemini',
          providerMessage: 'RESOURCE_EXHAUSTED: GenerateRequestsPerDayPerProjectPerModel-FreeTier',
        });
      },
    ]);
    llmScript.current = adapter;

    await assembled.invoke(IpcChannels.SETTINGS_SAVE_PROVIDER_AND_KEY, {
      provider: 'gemini',
      key: 'AIzaSyD-fake-key-1234567890',
      mode: 'free',
    });

    await expect(assembled.invoke<ChatSendResult>(IpcChannels.CHAT_SEND, { text: '선행연구 찾아줘' })).rejects.toThrow(
      /내일 오후/,
    );
  });
});

describe('채팅 -> 결정 저장 -> 다음 대화 프롬프트 반영 루프 (FR-MEM-003 종단검증)', () => {
  let assembled: Assembled | undefined;

  afterEach(() => {
    assembled?.ws.cleanup();
    assembled = undefined;
  });

  it('a suggested decision saved via memory:save-decision reappears in the very next chat turn system prompt', async () => {
    assembled = assemble('tsa-e2e-s7-');

    const decisionReply =
      '질적 연구방법이 지금 연구 질문에 더 적합해 보여요.\n' +
      '<decision>{"what":"질적 연구방법을 채택한다","why":"탐색적 연구질문에 더 적합하기 때문"}</decision>';
    // Same single-adapter constraint as the S3 test above: handlers.ts
    // rebuilds + caches the conversation adapter right after the save
    // succeeds, so this one queue must cover the connectivity check
    // (queue[0]), the first chat turn (queue[1]), and the second chat turn
    // (queue[2]) — all through the same adapter/call-log instance.
    const { adapter, calls } = makeQueueAdapter('gemini', [
      '연결 확인 완료',
      decisionReply,
      '알겠습니다, 계속 진행할게요.',
    ]);
    llmScript.current = adapter;

    await assembled.invoke(IpcChannels.SETTINGS_SAVE_PROVIDER_AND_KEY, {
      provider: 'gemini',
      key: 'AIzaSyD-fake-key-1234567890',
      mode: 'free',
    });

    const turn1 = await assembled.invoke<ChatSendResult>(IpcChannels.CHAT_SEND, {
      text: '연구방법을 질적으로 할지 양적으로 할지 고민이에요.',
    });
    expect(turn1.reply).not.toContain('<decision>');
    expect(turn1.suggestedDecision).toEqual({
      what: '질적 연구방법을 채택한다',
      why: '탐색적 연구질문에 더 적합하기 때문',
    });

    await assembled.invoke(IpcChannels.MEMORY_SAVE_DECISION, turn1.suggestedDecision);

    // Reload from disk with a brand-new MemoryStore instance to prove the
    // decision was actually persisted, not just held in memory. T41
    // (SPEC-TSA-002): the active project's id is no longer the fixed literal
    // 'default' — ProjectContext auto-creates a UUID-keyed project when no
    // index exists yet — so the path is resolved via project:list instead of
    // being hardcoded.
    const { activeProjectId } = await assembled.invoke<ProjectListResult>(IpcChannels.PROJECT_LIST);
    const activeMemoryFile = resolveProjectPaths(assembled.ws.paths.dataDir, activeProjectId!).memoryFile;
    const reloaded = new MemoryStore(activeMemoryFile);
    reloaded.load();
    const snapshot = reloaded.getSnapshot();
    expect(snapshot.decisions).toHaveLength(1);
    expect(snapshot.decisions[0]).toMatchObject({
      what: '질적 연구방법을 채택한다',
      why: '탐색적 연구질문에 더 적합하기 때문',
      source: 'chat',
    });
    expect(serializeMemoryForPrompt(snapshot).text).toContain('질적 연구방법을 채택한다');

    await assembled.invoke<ChatSendResult>(IpcChannels.CHAT_SEND, { text: '고마워요, 계속 진행할게요.' });

    // The SAME in-process memoryStore instance backs the conversation, so the
    // decision saved a moment ago must already be in this next turn's system
    // prompt — no reload needed for the running session to see it
    // (FR-MEM-003). calls[0] = wizard connectivity check (no system prompt),
    // calls[1] = first chat turn (before the decision was saved),
    // calls[2] = second chat turn (after the decision was saved).
    expect(calls[2]?.system).toContain('질적 연구방법을 채택한다');
    expect(calls[2]?.system).toContain('탐색적 연구질문에 더 적합하기 때문');
    // Sanity check confirming the ordering assumption above.
    expect(calls[1]?.system).not.toContain('질적 연구방법을 채택한다');
  });
});
