/**
 * T41 (SPEC-TSA-002) — project management IPC wiring, assembled through the
 * real `registerIpcHandlers` (handlers.ts, projectContext.ts, projectHandlers.ts),
 * with `electron` and `core/llm`'s `createAdapter` mocked so no real network
 * call is ever attempted. Follows the same structure as
 * `firstRunWizardChat.spec.ts` — `vi.mock` calls MUST stay in this file
 * (Vitest only hoists them reliably within the file they're written in).
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
import { MemoryStore } from '../../src/core/memory/store';
import { resolveProjectPaths } from '../../src/main/project/projectPaths';
import { IpcChannels } from '../../src/shared/ipc-channels';
import type {
  ChatSendResult,
  ProjectArchiveResult,
  ProjectCreateResult,
  ProjectListResult,
  ProjectRenameResult,
  ProjectSwitchResult,
  SaveProviderAndKeyResult,
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

describe('project:* IPC — CRUD + memory isolation across a switch', () => {
  let assembled: Assembled | undefined;

  afterEach(() => {
    assembled?.ws.cleanup();
    assembled = undefined;
  });

  it('auto-creates a default project so project:list is never empty at startup', async () => {
    assembled = assemble('tsa-e2e-project-list-');

    const list = await assembled.invoke<ProjectListResult>(IpcChannels.PROJECT_LIST);

    expect(list.projects).toHaveLength(1);
    expect(list.activeProjectId).toBe(list.projects[0]?.id);
  });

  it('creates a project, switches to it immediately, and isolates memory writes per project', async () => {
    assembled = assemble('tsa-e2e-project-crud-');

    const before = await assembled.invoke<ProjectListResult>(IpcChannels.PROJECT_LIST);
    const projectAId = before.projects[0]!.id;

    // `memory:save-decision` never requires an LLM key — safe to exercise
    // without registering a provider first.
    await assembled.invoke(IpcChannels.MEMORY_SAVE_DECISION, { what: 'A 결정', why: 'A 이유' });

    const created = await assembled.invoke<ProjectCreateResult>(IpcChannels.PROJECT_CREATE, {
      name: '프로젝트 B',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error('unreachable');
    const projectBId = created.project.id;
    expect(projectBId).not.toBe(projectAId);

    const afterCreate = await assembled.invoke<ProjectListResult>(IpcChannels.PROJECT_LIST);
    expect(afterCreate.projects).toHaveLength(2);
    expect(afterCreate.activeProjectId).toBe(projectBId);

    // Now active project is B — this decision must land in B's memory only.
    await assembled.invoke(IpcChannels.MEMORY_SAVE_DECISION, { what: 'B 결정', why: 'B 이유' });

    const pathsA = resolveProjectPaths(assembled.ws.paths.dataDir, projectAId);
    const pathsB = resolveProjectPaths(assembled.ws.paths.dataDir, projectBId);
    const memoryA = new MemoryStore(pathsA.memoryFile);
    memoryA.load();
    const memoryB = new MemoryStore(pathsB.memoryFile);
    memoryB.load();

    expect(memoryA.listDecisions().map((d) => d.what)).toEqual(['A 결정']);
    expect(memoryB.listDecisions().map((d) => d.what)).toEqual(['B 결정']);

    // Switch back to A — subsequent writes must go through A's store again.
    const switched = await assembled.invoke<ProjectSwitchResult>(IpcChannels.PROJECT_SWITCH, { id: projectAId });
    expect(switched).toEqual({ ok: true, projectId: projectAId });

    await assembled.invoke(IpcChannels.MEMORY_SAVE_DECISION, { what: 'A 두번째 결정', why: 'A 이유 2' });
    const memoryAReloaded = new MemoryStore(pathsA.memoryFile);
    memoryAReloaded.load();
    expect(memoryAReloaded.listDecisions().map((d) => d.what)).toEqual(['A 결정', 'A 두번째 결정']);
  });

  it('rejects switching to an unknown project id and keeps the current active project', async () => {
    assembled = assemble('tsa-e2e-project-switch-invalid-');
    const before = await assembled.invoke<ProjectListResult>(IpcChannels.PROJECT_LIST);

    const result = await assembled.invoke<ProjectSwitchResult>(IpcChannels.PROJECT_SWITCH, {
      id: '11111111-1111-1111-1111-111111111111',
    });

    expect(result).toEqual({ ok: false, reason: 'not_found' });
    const after = await assembled.invoke<ProjectListResult>(IpcChannels.PROJECT_LIST);
    expect(after.activeProjectId).toBe(before.activeProjectId);
  });

  it('renames a project', async () => {
    assembled = assemble('tsa-e2e-project-rename-');
    const before = await assembled.invoke<ProjectListResult>(IpcChannels.PROJECT_LIST);
    const id = before.projects[0]!.id;

    const result = await assembled.invoke<ProjectRenameResult>(IpcChannels.PROJECT_RENAME, {
      id,
      name: '새 이름',
    });

    expect(result).toEqual({ ok: true, project: expect.objectContaining({ id, name: '새 이름' }) });
  });

  it('rejects renaming with an out-of-bounds name', async () => {
    assembled = assemble('tsa-e2e-project-rename-invalid-');
    const before = await assembled.invoke<ProjectListResult>(IpcChannels.PROJECT_LIST);
    const id = before.projects[0]!.id;

    const result = await assembled.invoke<ProjectRenameResult>(IpcChannels.PROJECT_RENAME, { id, name: '' });

    expect(result).toEqual({ ok: false, reason: 'invalid_name' });
  });

  it('archives a project, hiding it from the list, and refuses to archive the last remaining project', async () => {
    assembled = assemble('tsa-e2e-project-archive-');
    const before = await assembled.invoke<ProjectListResult>(IpcChannels.PROJECT_LIST);
    const onlyProjectId = before.projects[0]!.id;

    const rejectedLast = await assembled.invoke<ProjectArchiveResult>(IpcChannels.PROJECT_ARCHIVE, {
      id: onlyProjectId,
    });
    expect(rejectedLast).toEqual({ ok: false, reason: 'last_active_project' });

    const created = await assembled.invoke<ProjectCreateResult>(IpcChannels.PROJECT_CREATE, {
      name: '프로젝트 B',
    });
    if (!created.ok) throw new Error('unreachable');

    // Now two projects exist (B is active) — archiving the inactive A must succeed.
    const archived = await assembled.invoke<ProjectArchiveResult>(IpcChannels.PROJECT_ARCHIVE, {
      id: onlyProjectId,
    });
    expect(archived.ok).toBe(true);

    const after = await assembled.invoke<ProjectListResult>(IpcChannels.PROJECT_LIST);
    expect(after.projects.map((p) => p.id)).toEqual([created.project.id]);
    expect(after.activeProjectId).toBe(created.project.id);
  });
});

describe('project:switch resets the in-memory chat transcript (FR-PRJ-002)', () => {
  let assembled: Assembled | undefined;

  afterEach(() => {
    assembled?.ws.cleanup();
    assembled = undefined;
  });

  it('does not leak the previous project chat history into the next turn after a switch', async () => {
    assembled = assemble('tsa-e2e-project-switch-chat-reset-');

    const { adapter, calls } = makeQueueAdapter('gemini', [
      '연결 확인 완료',
      '첫 프로젝트 응답입니다.',
      '두번째 프로젝트 응답입니다.',
    ]);
    llmScript.current = adapter;

    await assembled.invoke<SaveProviderAndKeyResult>(IpcChannels.SETTINGS_SAVE_PROVIDER_AND_KEY, {
      provider: 'gemini',
      key: 'AIzaSyD-fake-key-1234567890',
      mode: 'free',
    });

    await assembled.invoke<ChatSendResult>(IpcChannels.CHAT_SEND, { text: '프로젝트 A에서의 질문' });

    const created = await assembled.invoke<ProjectCreateResult>(IpcChannels.PROJECT_CREATE, {
      name: '프로젝트 B',
    });
    if (!created.ok) throw new Error('unreachable');

    await assembled.invoke<ChatSendResult>(IpcChannels.CHAT_SEND, { text: '프로젝트 B에서의 질문' });

    // calls[0] = wizard connectivity check, calls[1] = project A's turn,
    // calls[2] = project B's turn. If the switch had NOT reset the
    // transcript, calls[2].messages would carry project A's prior
    // user+assistant turns ahead of this new one (3 entries instead of 1).
    expect(calls[2]?.content).toBe('프로젝트 B에서의 질문');
    expect(calls[2]?.messages).toHaveLength(1);
    expect(calls[2]?.messages[0]).toEqual({ role: 'user', content: '프로젝트 B에서의 질문' });
  });
});
