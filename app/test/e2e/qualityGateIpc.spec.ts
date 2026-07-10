/**
 * Review-fix HIGH#1 (SPEC-TSA-001, FR-WRT-001/002) — end-to-end coverage for
 * the `quality-gate:run` IPC channel, assembled through the real
 * `registerIpcHandlers` wiring exactly like `firstRunWizardChat.spec.ts`.
 *
 * `vi.mock` calls MUST stay in this file (Vitest only hoists them reliably
 * within the file they're written in) — plain, mock-free helpers live in
 * `firstRunHelpers.ts`.
 */

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
import { IpcChannels } from '../../src/shared/ipc-channels';
import type { QualityGateRunResult, SaveProviderAndKeyResult } from '../../src/shared/ipc-channels';
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

const PASS_JSON = JSON.stringify({
  results: [
    { criterionId: 'research-gap', passed: true, feedback: '연구 갭이 명확히 드러나요.' },
    { criterionId: 'contribution', passed: true, feedback: '기여가 잘 명시되어 있어요.' },
  ],
});

const CITED_TEXT = '선행연구는 이 문제를 다루지 않았다 (홍길동, 2020).\n\n본 연구는 이 빈틈을 다룬다 (김민영, 2021).';

beforeEach(() => {
  ipcHandlers.clear();
  llmScript.current = null;
});

describe('quality-gate:run', () => {
  let assembled: Assembled | undefined;

  afterEach(() => {
    assembled?.ws.cleanup();
    assembled = undefined;
  });

  it('throws the no-key message when no LLM key has been registered yet', async () => {
    assembled = assemble('tsa-gate-nokey-');

    await expect(
      assembled.invoke(IpcChannels.QUALITY_GATE_RUN, { sectionId: 'introduction', text: CITED_TEXT }),
    ).rejects.toThrow(/API 키를 등록/);
  });

  it('rejects a sectionId outside the whitelist without ever calling the LLM', async () => {
    assembled = assemble('tsa-gate-badsection-');
    const { adapter, calls } = makeQueueAdapter('gemini', [PASS_JSON]);
    llmScript.current = adapter;

    await assembled.invoke<SaveProviderAndKeyResult>(IpcChannels.SETTINGS_SAVE_PROVIDER_AND_KEY, {
      provider: 'gemini',
      key: 'AIzaSyD-fake-key-1234567890',
      mode: 'free',
    });

    await expect(
      assembled.invoke(IpcChannels.QUALITY_GATE_RUN, { sectionId: 'body', text: CITED_TEXT }),
    ).rejects.toThrow(/잘못된 요청/);
    // Only the wizard's own connectivity check should have reached the adapter.
    expect(calls).toHaveLength(1);
  });

  it('rejects empty text without calling the LLM', async () => {
    assembled = assemble('tsa-gate-emptytext-');
    const { adapter, calls } = makeQueueAdapter('gemini', [PASS_JSON]);
    llmScript.current = adapter;

    await assembled.invoke(IpcChannels.SETTINGS_SAVE_PROVIDER_AND_KEY, {
      provider: 'gemini',
      key: 'AIzaSyD-fake-key-1234567890',
      mode: 'free',
    });

    await expect(
      assembled.invoke(IpcChannels.QUALITY_GATE_RUN, { sectionId: 'introduction', text: '   ' }),
    ).rejects.toThrow(/잘못된 요청/);
    expect(calls).toHaveLength(1);
  });

  it('runs the introduction gate end-to-end once a key is registered', async () => {
    assembled = assemble('tsa-gate-ok-');
    const { adapter } = makeQueueAdapter('gemini', ['연결 확인 완료', PASS_JSON]);
    llmScript.current = adapter;

    await assembled.invoke(IpcChannels.SETTINGS_SAVE_PROVIDER_AND_KEY, {
      provider: 'gemini',
      key: 'AIzaSyD-fake-key-1234567890',
      mode: 'free',
    });

    const result = await assembled.invoke<QualityGateRunResult>(IpcChannels.QUALITY_GATE_RUN, {
      sectionId: 'introduction',
      text: CITED_TEXT,
    });

    expect(result.sectionId).toBe('introduction');
    expect(result.passed).toBe(true);
    expect(result.results.map((r) => r.criterionId).sort()).toEqual(
      ['citation-presence', 'contribution', 'research-gap'].sort(),
    );
  });
});
