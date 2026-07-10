/**
 * T48 (SPEC-TSA-002) — `research-history:list/get/remove` IPC handlers plus
 * the `saveResearchRecord()` auto-save helper, exercised directly against
 * `registerResearchHistoryHandlers` with `electron` mocked exactly like
 * `projectManagementIpc.spec.ts`.
 *
 * This spec does NOT go through `registerIpcHandlers` (handlers.ts) — the
 * research:run success hook that calls `saveResearchRecord()` is wired
 * centrally in `researchGateHandlers.ts` by the integration pass (see this
 * task's "배선 명세" report), which this executor's file ownership excludes.
 * `saveResearchRecord()` is exercised directly here as the unit the wiring
 * hook will call.
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

import type { PaperMetadata } from '../../src/core/academic-api/types';
import { registerResearchHistoryHandlers, saveResearchRecord } from '../../src/main/ipc/researchHistoryHandlers';
import { ensureProjectDirectories, resolveProjectPaths } from '../../src/main/project/projectPaths';
import type { DeepResearchResult, ScreenedPaper } from '../../src/core/research-pipeline/types';
import { ResearchHistoryChannels } from '../../src/shared/ipc/researchHistory';
import type {
  ResearchHistoryGetResult,
  ResearchHistoryListResult,
  ResearchHistoryRemoveResult,
} from '../../src/shared/ipc/researchHistory';

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

interface Harness {
  workDir: string;
  researchDirA: string;
  researchDirB: string;
  activeDir: { current: string };
  invoke: <T>(channel: string, payload?: unknown) => Promise<T>;
}

/** Sets up two project research dirs (default + a UUID project) and one registered handler set. */
function assemble(prefix: string): Harness {
  const workDir = mkdtempSync(join(tmpdir(), prefix));

  const pathsA = resolveProjectPaths(workDir, 'default');
  ensureProjectDirectories(pathsA);
  const pathsB = resolveProjectPaths(workDir, '11111111-1111-1111-1111-111111111111');
  ensureProjectDirectories(pathsB);

  const activeDir = { current: pathsA.researchDir };
  registerResearchHistoryHandlers({ getResearchDir: () => activeDir.current });

  return {
    workDir,
    researchDirA: pathsA.researchDir,
    researchDirB: pathsB.researchDir,
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

describe('research-history:* IPC', () => {
  let harness: Harness | undefined;

  afterEach(() => {
    if (harness) rmSync(harness.workDir, { recursive: true, force: true });
    harness = undefined;
  });

  it('lists an empty history for a fresh project', async () => {
    harness = assemble('tsa-research-history-empty-');

    const result = await harness.invoke<ResearchHistoryListResult>(ResearchHistoryChannels.RESEARCH_HISTORY_LIST);

    expect(result.records).toEqual([]);
  });

  it('saveResearchRecord() persists a record that list/get then surface', async () => {
    harness = assemble('tsa-research-history-save-');

    saveResearchRecord(harness.researchDirA, '연구 질문 1', makeResult());

    const list = await harness.invoke<ResearchHistoryListResult>(ResearchHistoryChannels.RESEARCH_HISTORY_LIST);
    expect(list.records).toHaveLength(1);
    expect(list.records[0]).toMatchObject({ question: '연구 질문 1', citedCount: 1 });

    const id = list.records[0]!.id;
    const detail = await harness.invoke<ResearchHistoryGetResult>(ResearchHistoryChannels.RESEARCH_HISTORY_GET, {
      id,
    });

    expect(detail).not.toBeNull();
    expect(detail?.report).toBe('리포트 본문 [1]');
    expect(detail?.citedPapers).toEqual([
      {
        title: 'A',
        authors: ['홍길동'],
        year: 2024,
        url: 'https://example.com/A',
        source: expect.any(String),
        // Raw metadata rides along for the library save button (FR-LIB-001).
        metadata: expect.objectContaining({ externalId: expect.any(String) }),
      },
    ]);
    expect(detail?.failedSources).toEqual([]);
  });

  it('returns null from get and false from remove for an unknown id', async () => {
    harness = assemble('tsa-research-history-unknown-');

    const detail = await harness.invoke<ResearchHistoryGetResult>(ResearchHistoryChannels.RESEARCH_HISTORY_GET, {
      id: '00000000-0000-0000-0000-000000000000',
    });
    expect(detail).toBeNull();

    const removed = await harness.invoke<ResearchHistoryRemoveResult>(
      ResearchHistoryChannels.RESEARCH_HISTORY_REMOVE,
      { id: '00000000-0000-0000-0000-000000000000' },
    );
    expect(removed).toEqual({ ok: false });
  });

  it('removes an existing record', async () => {
    harness = assemble('tsa-research-history-remove-');
    saveResearchRecord(harness.researchDirA, '삭제될 질문', makeResult());
    const list = await harness.invoke<ResearchHistoryListResult>(ResearchHistoryChannels.RESEARCH_HISTORY_LIST);
    const id = list.records[0]!.id;

    const removed = await harness.invoke<ResearchHistoryRemoveResult>(
      ResearchHistoryChannels.RESEARCH_HISTORY_REMOVE,
      { id },
    );
    expect(removed).toEqual({ ok: true });

    const after = await harness.invoke<ResearchHistoryListResult>(ResearchHistoryChannels.RESEARCH_HISTORY_LIST);
    expect(after.records).toEqual([]);
  });

  it('rejects a non-string/missing id on get and remove without an unhandled error', async () => {
    harness = assemble('tsa-research-history-invalid-');

    await expect(harness.invoke(ResearchHistoryChannels.RESEARCH_HISTORY_GET, { id: 123 })).rejects.toThrow(
      /잘못된 요청/,
    );
    await expect(harness.invoke(ResearchHistoryChannels.RESEARCH_HISTORY_REMOVE, {})).rejects.toThrow(/잘못된 요청/);
  });

  it('rejects a path-escape id ("../../index") on get and remove without touching any file outside researchDir (audit H1)', async () => {
    harness = assemble('tsa-research-history-escape-');

    await expect(
      harness.invoke(ResearchHistoryChannels.RESEARCH_HISTORY_GET, { id: '../../index' }),
    ).rejects.toThrow(/잘못된 요청/);
    await expect(
      harness.invoke(ResearchHistoryChannels.RESEARCH_HISTORY_REMOVE, { id: '../../../../index' }),
    ).rejects.toThrow(/잘못된 요청/);
  });

  it('isolates records per project — switching the active research dir changes the visible history', async () => {
    harness = assemble('tsa-research-history-isolation-');
    saveResearchRecord(harness.researchDirA, 'A 프로젝트 질문', makeResult());
    saveResearchRecord(harness.researchDirB, 'B 프로젝트 질문', makeResult());

    const listA = await harness.invoke<ResearchHistoryListResult>(ResearchHistoryChannels.RESEARCH_HISTORY_LIST);
    expect(listA.records.map((r) => r.question)).toEqual(['A 프로젝트 질문']);

    harness.activeDir.current = harness.researchDirB;
    const listB = await harness.invoke<ResearchHistoryListResult>(ResearchHistoryChannels.RESEARCH_HISTORY_LIST);
    expect(listB.records.map((r) => r.question)).toEqual(['B 프로젝트 질문']);
  });

  it('saveResearchRecord() swallows a write failure instead of throwing (never blocks the research response)', () => {
    const workDir = mkdtempSync(join(tmpdir(), 'tsa-research-history-savefail-'));
    // A file occupying the path segment forces the store's mkdirSync(recursive) to throw.
    const blockerFile = join(workDir, 'blocked');
    writeFileSync(blockerFile, 'x', 'utf-8');
    const uncreatableResearchDir = join(blockerFile, 'research');

    expect(() => saveResearchRecord(uncreatableResearchDir, '질문', makeResult())).not.toThrow();

    rmSync(workDir, { recursive: true, force: true });
  });
});
