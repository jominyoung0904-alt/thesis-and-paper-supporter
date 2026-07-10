/**
 * T44 (SPEC-TSA-002) — literature library IPC (FR-LIB-001/002), assembled by
 * calling `registerLibraryHandlers` directly against a mocked `ipcMain`
 * (central `handlers.ts` integration happens after this task, per the Wave 3
 * file-ownership split — see the completion report's wiring spec). Follows
 * the same structure as `projectManagementIpc.spec.ts` — `vi.mock` calls MUST
 * stay in this file (Vitest only hoists them reliably within the file
 * they're written in).
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
import { registerLibraryHandlers } from '../../src/main/ipc/libraryHandlers';
import { ensureProjectDirectories, resolveProjectPaths } from '../../src/main/project/projectPaths';
import { LibraryChannels } from '../../src/shared/ipc/library';
import type {
  LibraryListResult,
  LibraryRemoveResult,
  LibrarySaveResult,
  LibraryUpdateMemoResult,
} from '../../src/shared/ipc/library';

interface Workspace {
  dataDir: string;
  cleanup: () => void;
}

function createWorkspace(prefix: string): Workspace {
  const dataDir = mkdtempSync(join(tmpdir(), prefix));
  return { dataDir, cleanup: () => rmSync(dataDir, { recursive: true, force: true }) };
}

function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const handler = ipcHandlers.get(channel);
  if (!handler) throw new Error(`handler not registered for channel: ${channel}`);
  return handler({ sender: { send: () => undefined } }, payload) as Promise<T>;
}

const PAPER_A: PaperMetadata = {
  source: 'kci',
  externalId: 'kci-001',
  title: '국내 논문 A',
  authors: ['홍길동'],
  year: 2023,
  abstract: null,
  venue: null,
  url: 'https://example.com/a',
  citationCount: null,
};

const PAPER_B: PaperMetadata = {
  source: 'openalex',
  externalId: 'oa-002',
  title: 'Paper B',
  authors: ['Jane Doe'],
  year: 2022,
  abstract: null,
  venue: null,
  url: 'https://example.com/b',
  citationCount: 3,
};

beforeEach(() => {
  ipcHandlers.clear();
});

describe('library:* IPC — save/list/memo/remove (FR-LIB-001/002)', () => {
  let ws: Workspace | undefined;

  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  function registerForProject(projectId: string): void {
    const paths = resolveProjectPaths(ws!.dataDir, projectId);
    ensureProjectDirectories(paths);
    registerLibraryHandlers({ getLibraryFile: () => paths.libraryFile });
  }

  it('saves papers and lists them back, most-recently-saved first', async () => {
    ws = createWorkspace('tsa-e2e-library-save-');
    registerForProject('default');

    const saveA = await invoke<LibrarySaveResult>(LibraryChannels.LIBRARY_SAVE, {
      paper: PAPER_A,
      sourceResearchId: 'r1',
    });
    expect(saveA.ok).toBe(true);

    const saveB = await invoke<LibrarySaveResult>(LibraryChannels.LIBRARY_SAVE, { paper: PAPER_B });
    expect(saveB.ok).toBe(true);

    const list = await invoke<LibraryListResult>(LibraryChannels.LIBRARY_LIST);
    expect(list.papers.map((p) => p.paper.externalId)).toEqual(['oa-002', 'kci-001']);
  });

  it('rejects saving the same (source, externalId) paper twice', async () => {
    ws = createWorkspace('tsa-e2e-library-dup-');
    registerForProject('default');

    await invoke<LibrarySaveResult>(LibraryChannels.LIBRARY_SAVE, { paper: PAPER_A });
    const dup = await invoke<LibrarySaveResult>(LibraryChannels.LIBRARY_SAVE, { paper: PAPER_A });

    expect(dup).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('rejects a malformed save payload without touching disk', async () => {
    ws = createWorkspace('tsa-e2e-library-invalid-');
    registerForProject('default');

    const result = await invoke<LibrarySaveResult>(LibraryChannels.LIBRARY_SAVE, {
      paper: { title: 'no source or externalId' },
    });

    expect(result).toEqual({ ok: false, reason: 'invalid_request' });
    const list = await invoke<LibraryListResult>(LibraryChannels.LIBRARY_LIST);
    expect(list.papers).toHaveLength(0);
  });

  it('updates a memo and rejects an over-length memo', async () => {
    ws = createWorkspace('tsa-e2e-library-memo-');
    registerForProject('default');

    const saved = await invoke<LibrarySaveResult>(LibraryChannels.LIBRARY_SAVE, { paper: PAPER_A });
    if (!saved.ok) throw new Error('unreachable');

    const updated = await invoke<LibraryUpdateMemoResult>(LibraryChannels.LIBRARY_UPDATE_MEMO, {
      id: saved.paper.id,
      memo: '중요한 문헌',
    });
    expect(updated).toEqual({ ok: true, paper: expect.objectContaining({ memo: '중요한 문헌' }) });

    const tooLong = await invoke<LibraryUpdateMemoResult>(LibraryChannels.LIBRARY_UPDATE_MEMO, {
      id: saved.paper.id,
      memo: 'a'.repeat(501),
    });
    expect(tooLong).toEqual({ ok: false, reason: 'memo_too_long' });

    const missing = await invoke<LibraryUpdateMemoResult>(LibraryChannels.LIBRARY_UPDATE_MEMO, {
      id: 'does-not-exist',
      memo: '메모',
    });
    expect(missing).toEqual({ ok: false, reason: 'not_found' });
  });

  it('removes a saved paper and reports not_found on a second removal', async () => {
    ws = createWorkspace('tsa-e2e-library-remove-');
    registerForProject('default');

    const saved = await invoke<LibrarySaveResult>(LibraryChannels.LIBRARY_SAVE, { paper: PAPER_A });
    if (!saved.ok) throw new Error('unreachable');

    const removed = await invoke<LibraryRemoveResult>(LibraryChannels.LIBRARY_REMOVE, { id: saved.paper.id });
    expect(removed).toEqual({ ok: true });

    const list = await invoke<LibraryListResult>(LibraryChannels.LIBRARY_LIST);
    expect(list.papers).toHaveLength(0);

    const removeAgain = await invoke<LibraryRemoveResult>(LibraryChannels.LIBRARY_REMOVE, { id: saved.paper.id });
    expect(removeAgain).toEqual({ ok: false, reason: 'not_found' });
  });

  it('isolates library data across a project switch (S6/FR-PRJ-002 pattern)', async () => {
    ws = createWorkspace('tsa-e2e-library-isolation-');

    const pathsA = resolveProjectPaths(ws.dataDir, 'default');
    ensureProjectDirectories(pathsA);
    const projectBId = '11111111-1111-1111-1111-111111111111';
    const pathsB = resolveProjectPaths(ws.dataDir, projectBId);
    ensureProjectDirectories(pathsB);

    // Simulates `ProjectContext`'s rebuild-on-switch: `getLibraryFile`
    // observes whichever project is "active" at call time, exactly like the
    // real `getLibraryFile: () => ctx.getServices().projectPaths.libraryFile`
    // wiring documented in this task's completion report.
    let activeProjectId = 'default';
    registerLibraryHandlers({
      getLibraryFile: () => (activeProjectId === 'default' ? pathsA.libraryFile : pathsB.libraryFile),
    });

    await invoke<LibrarySaveResult>(LibraryChannels.LIBRARY_SAVE, { paper: PAPER_A, sourceResearchId: 'r-a' });

    activeProjectId = projectBId;
    await invoke<LibrarySaveResult>(LibraryChannels.LIBRARY_SAVE, { paper: PAPER_B, sourceResearchId: 'r-b' });

    const listB = await invoke<LibraryListResult>(LibraryChannels.LIBRARY_LIST);
    expect(listB.papers.map((p) => p.paper.externalId)).toEqual(['oa-002']);

    activeProjectId = 'default';
    const listA = await invoke<LibraryListResult>(LibraryChannels.LIBRARY_LIST);
    expect(listA.papers.map((p) => p.paper.externalId)).toEqual(['kci-001']);
  });
});
