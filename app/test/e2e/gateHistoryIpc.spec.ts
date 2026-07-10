/**
 * T56 (SPEC-TSA-002) — `gate-history:list/get/remove` IPC handlers plus the
 * `saveGateRecord()` auto-save helper, exercised directly against
 * `registerGateHistoryHandlers` with `electron` mocked exactly like
 * `researchHistoryIpc.spec.ts` / `projectManagementIpc.spec.ts`.
 *
 * This spec does NOT go through `registerIpcHandlers` (handlers.ts) — the
 * quality-gate:run success hook that calls `saveGateRecord()` is wired
 * centrally in `researchGateHandlers.ts` by the integration pass (see this
 * task's "배선 명세" report), which this executor's file ownership excludes.
 * `saveGateRecord()` is exercised directly here as the unit the wiring hook
 * will call.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

import type { GateResult } from '../../src/core/writing/qualityGate';
import { registerGateHistoryHandlers, saveGateRecord } from '../../src/main/ipc/gateHistoryHandlers';
import { ensureProjectDirectories, resolveProjectPaths } from '../../src/main/project/projectPaths';
import { GateHistoryChannels } from '../../src/shared/ipc/gateHistory';
import type {
  GateHistoryGetResult,
  GateHistoryListResult,
  GateHistoryRemoveResult,
} from '../../src/shared/ipc/gateHistory';

function makeGateResult(passed: boolean): GateResult {
  return {
    sectionId: 'introduction',
    passed,
    results: [{ criterionId: 'citation-presence', passed, feedback: passed ? '충분해요' : '부족해요' }],
    summary: passed ? '모두 충족했어요.' : '보완이 필요해요.',
  };
}

interface Harness {
  workDir: string;
  gateDirA: string;
  gateDirB: string;
  activeDir: { current: string };
  invoke: <T>(channel: string, payload?: unknown) => Promise<T>;
}

/** Sets up two project gate dirs (default + a UUID project) and one registered handler set. */
function assemble(prefix: string): Harness {
  const workDir = mkdtempSync(join(tmpdir(), prefix));

  const pathsA = resolveProjectPaths(workDir, 'default');
  ensureProjectDirectories(pathsA);
  const pathsB = resolveProjectPaths(workDir, '11111111-1111-1111-1111-111111111111');
  ensureProjectDirectories(pathsB);

  const activeDir = { current: pathsA.gateDir };
  registerGateHistoryHandlers({ getGateDir: () => activeDir.current });

  return {
    workDir,
    gateDirA: pathsA.gateDir,
    gateDirB: pathsB.gateDir,
    activeDir,
    invoke: async <T>(channel: string, payload?: unknown): Promise<T> => {
      const handler = ipcHandlers.get(channel);
      if (!handler) throw new Error(`handler not registered for channel: ${channel}`);
      return handler({}, payload) as Promise<T>;
    },
  };
}

beforeEach(() => {
  ipcHandlers.clear();
});

describe('gate-history:* IPC', () => {
  let harness: Harness | undefined;

  afterEach(() => {
    if (harness) rmSync(harness.workDir, { recursive: true, force: true });
    harness = undefined;
  });

  it('lists an empty history for a fresh project', async () => {
    harness = assemble('tsa-gate-history-empty-');

    const result = await harness.invoke<GateHistoryListResult>(GateHistoryChannels.GATE_HISTORY_LIST);

    expect(result.records).toEqual([]);
  });

  it('saveGateRecord() persists a record that list/get then surface', async () => {
    harness = assemble('tsa-gate-history-save-');

    saveGateRecord(harness.gateDirA, 'introduction', '검사한 원문입니다.', makeGateResult(true));

    const list = await harness.invoke<GateHistoryListResult>(GateHistoryChannels.GATE_HISTORY_LIST);
    expect(list.records).toHaveLength(1);
    expect(list.records[0]).toMatchObject({
      sectionId: 'introduction',
      passed: true,
      textPreview: '검사한 원문입니다.',
    });

    const id = list.records[0]!.id;
    const detail = await harness.invoke<GateHistoryGetResult>(GateHistoryChannels.GATE_HISTORY_GET, { id });

    expect(detail).not.toBeNull();
    expect(detail?.text).toBe('검사한 원문입니다.');
    expect(detail?.result).toEqual(makeGateResult(true));
  });

  it('returns null from get and false from remove for an unknown id', async () => {
    harness = assemble('tsa-gate-history-unknown-');

    const detail = await harness.invoke<GateHistoryGetResult>(GateHistoryChannels.GATE_HISTORY_GET, {
      id: '00000000-0000-0000-0000-000000000000',
    });
    expect(detail).toBeNull();

    const removed = await harness.invoke<GateHistoryRemoveResult>(GateHistoryChannels.GATE_HISTORY_REMOVE, {
      id: '00000000-0000-0000-0000-000000000000',
    });
    expect(removed).toEqual({ ok: false });
  });

  it('removes an existing record', async () => {
    harness = assemble('tsa-gate-history-remove-');
    saveGateRecord(harness.gateDirA, 'introduction', '삭제될 원문', makeGateResult(false));
    const list = await harness.invoke<GateHistoryListResult>(GateHistoryChannels.GATE_HISTORY_LIST);
    const id = list.records[0]!.id;

    const removed = await harness.invoke<GateHistoryRemoveResult>(GateHistoryChannels.GATE_HISTORY_REMOVE, { id });
    expect(removed).toEqual({ ok: true });

    const after = await harness.invoke<GateHistoryListResult>(GateHistoryChannels.GATE_HISTORY_LIST);
    expect(after.records).toEqual([]);
  });

  it('rejects a non-string/missing id on get and remove without an unhandled error', async () => {
    harness = assemble('tsa-gate-history-invalid-');

    await expect(harness.invoke(GateHistoryChannels.GATE_HISTORY_GET, { id: 123 })).rejects.toThrow(/잘못된 요청/);
    await expect(harness.invoke(GateHistoryChannels.GATE_HISTORY_REMOVE, {})).rejects.toThrow(/잘못된 요청/);
  });

  it('isolates records per project — switching the active gate dir changes the visible history', async () => {
    harness = assemble('tsa-gate-history-isolation-');
    saveGateRecord(harness.gateDirA, 'introduction', 'A 프로젝트 원문', makeGateResult(true));
    saveGateRecord(harness.gateDirB, 'introduction', 'B 프로젝트 원문', makeGateResult(false));

    const listA = await harness.invoke<GateHistoryListResult>(GateHistoryChannels.GATE_HISTORY_LIST);
    expect(listA.records.map((r) => r.textPreview)).toEqual(['A 프로젝트 원문']);

    harness.activeDir.current = harness.gateDirB;
    const listB = await harness.invoke<GateHistoryListResult>(GateHistoryChannels.GATE_HISTORY_LIST);
    expect(listB.records.map((r) => r.textPreview)).toEqual(['B 프로젝트 원문']);
  });

  it('saveGateRecord() swallows a write failure instead of throwing (never blocks the gate response)', () => {
    const workDir = mkdtempSync(join(tmpdir(), 'tsa-gate-history-savefail-'));
    // A file occupying the path segment forces the store's mkdirSync(recursive) to throw.
    const blockerFile = join(workDir, 'blocked');
    writeFileSync(blockerFile, 'x', 'utf-8');
    const uncreatableGateDir = join(blockerFile, 'gate');

    expect(() => saveGateRecord(uncreatableGateDir, 'introduction', '텍스트', makeGateResult(true))).not.toThrow();

    rmSync(workDir, { recursive: true, force: true });
  });
});
