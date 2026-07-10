/**
 * `settings:get-llm-status` E2E (실사용 피드백: settings-tab "AI 연결 변경"
 * card needs to know the currently active provider/mode/key-presence before
 * rendering). Assembled through the real `registerIpcHandlers` composition
 * root, same pattern as `firstRunWizardChat.spec.ts` — `electron` and
 * `core/llm`'s `createAdapter` are mocked so no real network call is ever
 * attempted.
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
import type { LlmStatusResult, SaveProviderAndKeyResult } from '../../src/shared/ipc-channels';
import { createReadyWorkspace, makeQueueAdapter, MockCryptoBackend, type TempWorkspace } from './firstRunHelpers';

interface Assembled {
  ws: TempWorkspace;
  keyStore: KeyStore;
  invoke: <T>(channel: string, payload?: unknown) => Promise<T>;
}

/** Assembles one IPC handler set exactly the way `src/main/index.ts` bootstraps it, against a fresh temp workspace. */
function assemble(prefix: string): Assembled {
  const ws = createReadyWorkspace(prefix);
  saveSettings(ws.paths.settingsFile, createDefaultSettings());
  let settings: AppSettings = loadSettings(ws.paths.settingsFile).settings;
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

describe('settings:get-llm-status', () => {
  let assembled: Assembled | undefined;

  afterEach(() => {
    assembled?.ws.cleanup();
    assembled = undefined;
  });

  it('reports the default gemini/free settings with no key registered on a fresh install', async () => {
    assembled = assemble('tsa-e2e-llm-status-fresh-');

    const status = await assembled.invoke<LlmStatusResult>(IpcChannels.SETTINGS_GET_LLM_STATUS);

    expect(status).toEqual({ provider: 'gemini', mode: 'free', hasKey: false });
  });

  it('reflects the newly saved provider/mode/key after a successful settings:save-provider-and-key', async () => {
    assembled = assemble('tsa-e2e-llm-status-saved-');
    const { adapter } = makeQueueAdapter('claude', ['연결 확인 완료']);
    llmScript.current = adapter;

    const saveResult = await assembled.invoke<SaveProviderAndKeyResult>(IpcChannels.SETTINGS_SAVE_PROVIDER_AND_KEY, {
      provider: 'claude',
      key: 'sk-ant-fake-key-1234567890',
      mode: 'paid',
    });
    expect(saveResult.ok).toBe(true);

    const status = await assembled.invoke<LlmStatusResult>(IpcChannels.SETTINGS_GET_LLM_STATUS);

    expect(status).toEqual({ provider: 'claude', mode: 'paid', hasKey: true });
  });

  it('never leaks the stored key itself in the status payload', async () => {
    assembled = assemble('tsa-e2e-llm-status-nokey-');
    const { adapter } = makeQueueAdapter('gemini', ['연결 확인 완료']);
    llmScript.current = adapter;

    await assembled.invoke<SaveProviderAndKeyResult>(IpcChannels.SETTINGS_SAVE_PROVIDER_AND_KEY, {
      provider: 'gemini',
      key: 'AIzaSyD-fake-key-1234567890',
      mode: 'free',
    });

    const status = await assembled.invoke<LlmStatusResult>(IpcChannels.SETTINGS_GET_LLM_STATUS);

    expect(Object.keys(status).sort()).toEqual(['hasKey', 'mode', 'provider']);
  });
});
