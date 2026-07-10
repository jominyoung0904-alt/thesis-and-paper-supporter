/**
 * H2 fix regression (SPEC-TSA-002 Phase 4 review) — `research:run` and
 * `quality-gate:run` must snapshot the active project's directories ONCE at
 * handler entry, so a project switch that happens WHILE a run is still in
 * flight can never make that single execution straddle two projects (see
 * `researchGateHandlers.ts`'s H2 snapshot comment).
 *
 * Exercises `registerResearchGateHandlers` directly (not through the full
 * `registerIpcHandlers` composition root), mirroring the direct-handler
 * registration pattern in `researchHistoryIpc.spec.ts` / `gateHistoryIpc.spec.ts`,
 * so the test can control exactly when the mocked pipeline/gate functions
 * resolve relative to a simulated `getResearchDir()` / `getGateDir()` /
 * `getCheckpointFile()` switch.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { ipcHandlers, pipelineMock, checkpointMock, gateMock } = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>(),
  pipelineMock: { runDeepResearch: vi.fn() },
  checkpointMock: { loadCheckpoint: vi.fn(), saveCheckpoint: vi.fn(), clearCheckpoint: vi.fn() },
  gateMock: { runQualityGate: vi.fn() },
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
vi.mock('../../src/core/writing/qualityGate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/writing/qualityGate')>();
  return { ...actual, runQualityGate: gateMock.runQualityGate };
});

import { MemoryStore } from '../../src/core/memory/store';
import { GateHistoryStore } from '../../src/core/writing/gateHistoryStore';
import { ResearchHistoryStore } from '../../src/core/research-history/store';
import { createDefaultSettings } from '../../src/main/config/defaultSettings';
import { KeyStore } from '../../src/main/config/keyStore';
import type { LlmService } from '../../src/main/ipc/llmService';
import { registerResearchGateHandlers } from '../../src/main/ipc/researchGateHandlers';
import { ensureProjectDirectories, resolveProjectPaths } from '../../src/main/project/projectPaths';
import { IpcChannels } from '../../src/shared/ipc-channels';
import type { QualityGateRunResult, ResearchRunResult } from '../../src/shared/ipc-channels';
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
  researchDirA: string;
  researchDirB: string;
  gateDirA: string;
  gateDirB: string;
  checkpointFileA: string;
  checkpointFileB: string;
  activeResearchDir: { current: string };
  activeGateDir: { current: string };
  activeCheckpointFile: { current: string };
  invoke: <T>(channel: string, payload?: unknown) => Promise<T>;
}

/** Sets up two project dirs (default + a UUID project) and one registered handler set, with switchable accessors. */
function assemble(prefix: string): Harness {
  const workDir = mkdtempSync(join(tmpdir(), prefix));
  const pathsA = resolveProjectPaths(workDir, 'default');
  ensureProjectDirectories(pathsA);
  const pathsB = resolveProjectPaths(workDir, '11111111-1111-1111-1111-111111111111');
  ensureProjectDirectories(pathsB);

  const activeResearchDir = { current: pathsA.researchDir };
  const activeGateDir = { current: pathsA.gateDir };
  const activeCheckpointFile = { current: pathsA.checkpointFile };

  const keyStore = new KeyStore(join(workDir, 'keys.json'), new MockCryptoBackend());
  const memoryStore = new MemoryStore(pathsA.memoryFile);
  memoryStore.load();

  registerResearchGateHandlers({
    llmService: fakeLlmService,
    getMemoryStore: () => memoryStore,
    keyStore,
    getSettings: () => createDefaultSettings(),
    getResearchDir: () => activeResearchDir.current,
    getGateDir: () => activeGateDir.current,
    getCheckpointFile: () => activeCheckpointFile.current,
  });

  return {
    workDir,
    researchDirA: pathsA.researchDir,
    researchDirB: pathsB.researchDir,
    gateDirA: pathsA.gateDir,
    gateDirB: pathsB.gateDir,
    checkpointFileA: pathsA.checkpointFile,
    checkpointFileB: pathsB.checkpointFile,
    activeResearchDir,
    activeGateDir,
    activeCheckpointFile,
    invoke: async <T>(channel: string, payload?: unknown): Promise<T> => {
      const handler = ipcHandlers.get(channel);
      if (!handler) throw new Error(`handler not registered for channel: ${channel}`);
      return handler({ sender: { send: () => undefined } }, payload) as Promise<T>;
    },
  };
}

beforeEach(() => {
  ipcHandlers.clear();
  pipelineMock.runDeepResearch.mockReset();
  checkpointMock.loadCheckpoint.mockReset().mockReturnValue(null);
  checkpointMock.saveCheckpoint.mockReset();
  checkpointMock.clearCheckpoint.mockReset();
  gateMock.runQualityGate.mockReset();
});

describe('research:run / quality-gate:run — H2 project-switch-mid-run race fix', () => {
  let harness: Harness | undefined;

  afterEach(() => {
    if (harness) rmSync(harness.workDir, { recursive: true, force: true });
    harness = undefined;
  });

  it('research:run saves the record + checkpoint into the project active at ENTRY, even if getResearchDir()/getCheckpointFile() change mid-run', async () => {
    harness = assemble('tsa-research-race-');

    // Simulates a checkpoint write happening mid-run, and a project switch
    // happening concurrently (e.g. the user switched projects in the UI
    // while research:run was still in flight).
    pipelineMock.runDeepResearch.mockImplementation(async (input: { checkpoint?: { save: (s: unknown) => void } }) => {
      input.checkpoint?.save({ step: 'screening' });
      harness!.activeResearchDir.current = harness!.researchDirB;
      harness!.activeCheckpointFile.current = harness!.checkpointFileB;

      return {
        report: '리포트 [1]',
        papers: [],
        citedPapers: [],
        relatedPapers: [],
        queries: { ko: [], en: [] },
        failedSources: [],
        usage: { calls: 1, inputTokens: 1, outputTokens: 1 },
      };
    });

    await harness.invoke<ResearchRunResult>(IpcChannels.RESEARCH_RUN, { question: '레이스 테스트 질문' });

    // Checkpoint save must have used the ENTRY-time path, never the post-switch one.
    expect(checkpointMock.saveCheckpoint).toHaveBeenCalledWith(harness.checkpointFileA, { step: 'screening' });
    expect(checkpointMock.saveCheckpoint).not.toHaveBeenCalledWith(harness.checkpointFileB, expect.anything());

    // The auto-saved research record must land in the ENTRY-time researchDir (A), not B.
    const storeA = new ResearchHistoryStore(harness.researchDirA);
    const storeB = new ResearchHistoryStore(harness.researchDirB);
    expect(storeA.listSummaries()).toHaveLength(1);
    expect(storeB.listSummaries()).toHaveLength(0);
  });

  it('quality-gate:run saves the record into the project active at ENTRY, even if getGateDir() changes mid-run', async () => {
    harness = assemble('tsa-gate-race-');

    gateMock.runQualityGate.mockImplementation(async () => {
      // Project switch happens WHILE the LLM/rule evaluation is still in flight.
      harness!.activeGateDir.current = harness!.gateDirB;
      return {
        sectionId: 'introduction',
        passed: true,
        results: [{ criterionId: 'citation-presence', passed: true, feedback: '충분해요' }],
        summary: '모두 충족했어요.',
      };
    });

    await harness.invoke<QualityGateRunResult>(IpcChannels.QUALITY_GATE_RUN, {
      sectionId: 'introduction',
      text: '검사할 원문입니다.',
    });

    const storeA = new GateHistoryStore(harness.gateDirA);
    const storeB = new GateHistoryStore(harness.gateDirB);
    expect(storeA.listSummaries()).toHaveLength(1);
    expect(storeB.listSummaries()).toHaveLength(0);
  });
});
