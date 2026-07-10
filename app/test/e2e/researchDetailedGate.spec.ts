/**
 * Paid-mode gate for "상세검색" (`research:run` detailed flag).
 *
 * Defense-in-depth (the UI toggle already hides the option in free mode):
 * `researchGateHandlers.ts` must only forward `detailed: true` to the pipeline
 * when the active settings are on paid mode, and must otherwise fall back to a
 * standard pass while telling the user once via the progress channel.
 *
 * Exercises `registerResearchGateHandlers` directly (mirroring
 * `researchGateRace.spec.ts`) so the mocked pipeline can be inspected for the
 * exact `detailed` value it received.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { ipcHandlers, pipelineMock, checkpointMock } = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>(),
  pipelineMock: { runDeepResearch: vi.fn() },
  checkpointMock: { loadCheckpoint: vi.fn(), saveCheckpoint: vi.fn(), clearCheckpoint: vi.fn() },
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, payload: unknown) => Promise<unknown>) => {
      ipcHandlers.set(channel, handler);
    },
  },
}));

vi.mock('../../src/core/research-pipeline/pipeline', () => pipelineMock);
vi.mock('../../src/core/research-pipeline/checkpoint', () => checkpointMock);

import { MemoryStore } from '../../src/core/memory/store';
import type { AppSettings } from '../../src/main/config/defaultSettings';
import { createDefaultSettings } from '../../src/main/config/defaultSettings';
import { KeyStore } from '../../src/main/config/keyStore';
import type { LlmService } from '../../src/main/ipc/llmService';
import { registerResearchGateHandlers } from '../../src/main/ipc/researchGateHandlers';
import { ensureProjectDirectories, resolveProjectPaths } from '../../src/main/project/projectPaths';
import { IpcChannels } from '../../src/shared/ipc-channels';
import type { ResearchProgressPayload, ResearchRunResult } from '../../src/shared/ipc-channels';
import { MockCryptoBackend } from './firstRunHelpers';

const fakeLlmService: LlmService = {
  hasKey: () => true,
  getModel: () => 'test-model',
  getAdapter: () => ({
    provider: 'gemini',
    chat: async () => ({ text: '{}', usage: { inputTokens: 0, outputTokens: 0 }, model: 'test-model' }),
  }),
  invalidate: () => undefined,
};

interface Harness {
  workDir: string;
  settings: { current: AppSettings };
  sent: ResearchProgressPayload[];
  invoke: <T>(channel: string, payload?: unknown) => Promise<T>;
}

function assemble(mode: 'free' | 'paid'): Harness {
  const workDir = mkdtempSync(join(tmpdir(), 'drs-detailed-gate-'));
  const paths = resolveProjectPaths(workDir, 'default');
  ensureProjectDirectories(paths);

  const initial = createDefaultSettings();
  initial.llm.mode = mode;
  const settings = { current: initial };
  const sent: ResearchProgressPayload[] = [];

  const keyStore = new KeyStore(join(workDir, 'keys.json'), new MockCryptoBackend());
  const memoryStore = new MemoryStore(paths.memoryFile);
  memoryStore.load();

  registerResearchGateHandlers({
    llmService: fakeLlmService,
    getMemoryStore: () => memoryStore,
    keyStore,
    getSettings: () => settings.current,
    getResearchDir: () => paths.researchDir,
    getGateDir: () => paths.gateDir,
    getCheckpointFile: () => paths.checkpointFile,
  });

  return {
    workDir,
    settings,
    sent,
    invoke: async <T>(channel: string, payload?: unknown): Promise<T> => {
      const handler = ipcHandlers.get(channel);
      if (!handler) throw new Error(`handler not registered for channel: ${channel}`);
      return handler(
        { sender: { send: (_ch: string, p: ResearchProgressPayload) => sent.push(p) } },
        payload,
      ) as Promise<T>;
    },
  };
}

/** Reads the `detailed` value the mocked pipeline was called with. */
function detailedArg(): boolean | undefined {
  const call = pipelineMock.runDeepResearch.mock.calls.at(-1);
  return (call?.[0] as { detailed?: boolean } | undefined)?.detailed;
}

beforeEach(() => {
  ipcHandlers.clear();
  pipelineMock.runDeepResearch.mockReset().mockResolvedValue({
    report: '리포트',
    papers: [],
    citedPapers: [],
    relatedPapers: [],
    queries: { ko: [], en: [] },
    failedSources: [],
    usage: { calls: 0, inputTokens: 0, outputTokens: 0 },
  });
  checkpointMock.loadCheckpoint.mockReset().mockReturnValue(null);
  checkpointMock.saveCheckpoint.mockReset();
  checkpointMock.clearCheckpoint.mockReset();
});

describe('research:run — 상세검색 paid gate', () => {
  let harness: Harness | undefined;

  afterEach(() => {
    if (harness) rmSync(harness.workDir, { recursive: true, force: true });
    harness = undefined;
  });

  it('forwards detailed=true to the pipeline on paid mode', async () => {
    harness = assemble('paid');

    await harness.invoke<ResearchRunResult>(IpcChannels.RESEARCH_RUN, { question: '질문', detailed: true });

    expect(detailedArg()).toBe(true);
    expect(harness.sent).toHaveLength(0); // no fallback notice
  });

  it('ignores detailed on free mode, runs standard, and notifies the user once', async () => {
    harness = assemble('free');

    await harness.invoke<ResearchRunResult>(IpcChannels.RESEARCH_RUN, { question: '질문', detailed: true });

    expect(detailedArg()).toBe(false);
    expect(harness.sent).toHaveLength(1);
    expect(harness.sent[0]?.detail).toContain('유료 모드에서만');
  });

  it('runs a standard pass (detailed=false) when the flag is omitted, even on paid mode', async () => {
    harness = assemble('paid');

    await harness.invoke<ResearchRunResult>(IpcChannels.RESEARCH_RUN, { question: '질문' });

    expect(detailedArg()).toBe(false);
    expect(harness.sent).toHaveLength(0);
  });

  it('treats a non-boolean detailed value as false (runtime guard against a hostile renderer)', async () => {
    harness = assemble('paid');

    await harness.invoke<ResearchRunResult>(IpcChannels.RESEARCH_RUN, {
      question: '질문',
      detailed: 'yes' as unknown as boolean,
    });

    expect(detailedArg()).toBe(false);
  });
});
