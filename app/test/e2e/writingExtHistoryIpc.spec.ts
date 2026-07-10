/**
 * T59 (SPEC-TSA-002) — `writing:mock-review-history:list/get/remove` IPC
 * handlers, exercised directly against `registerWritingExtHandlers`. Split
 * out of `writingExtIpc.spec.ts` (which owns `writing:polish` /
 * `writing:mock-review`) to stay under the project's 300-line file limit.
 *
 * `vi.mock` calls MUST stay in this file (Vitest only hoists them reliably
 * within the file they're written in) — plain, mock-free helpers live in
 * `writingExtTestHelpers.ts`.
 */

import { rmSync } from 'node:fs';

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

import { WritingExtChannels } from '../../src/shared/ipc/writingExt';
import type {
  MockReviewHistoryGetResult,
  MockReviewHistoryListResult,
  MockReviewHistoryRemoveResult,
} from '../../src/shared/ipc/writingExt';
import { assembleWritingExtHarness, mockLlm, MOCK_REVIEW_JSON, type WritingExtHarness } from './writingExtTestHelpers';

beforeEach(() => {
  ipcHandlers.clear();
});

describe('writing:mock-review-history:*', () => {
  let harness: WritingExtHarness | undefined;

  afterEach(() => {
    if (harness) rmSync(harness.workDir, { recursive: true, force: true });
    harness = undefined;
  });

  it('lists an empty history for a fresh project', async () => {
    harness = assembleWritingExtHarness('tsa-mockreview-history-empty-', null, ipcHandlers);

    const result = await harness.invoke<MockReviewHistoryListResult>(WritingExtChannels.MOCK_REVIEW_HISTORY_LIST);

    expect(result.records).toEqual([]);
  });

  it('gets the full record (text + result) for a saved run', async () => {
    const { adapter } = mockLlm(MOCK_REVIEW_JSON);
    harness = assembleWritingExtHarness('tsa-mockreview-history-get-', adapter, ipcHandlers);

    await harness.invoke(WritingExtChannels.WRITING_MOCK_REVIEW, { text: '심사받을 원고 전체입니다.' });
    const list = await harness.invoke<MockReviewHistoryListResult>(WritingExtChannels.MOCK_REVIEW_HISTORY_LIST);
    const id = list.records[0]!.id;

    const detail = await harness.invoke<MockReviewHistoryGetResult>(WritingExtChannels.MOCK_REVIEW_HISTORY_GET, {
      id,
    });

    expect(detail).not.toBeNull();
    expect(detail?.text).toBe('심사받을 원고 전체입니다.');
    expect(detail?.result.ok).toBe(true);
  });

  it('returns null from get and false from remove for an unknown id', async () => {
    harness = assembleWritingExtHarness('tsa-mockreview-history-unknown-', null, ipcHandlers);

    const detail = await harness.invoke<MockReviewHistoryGetResult>(WritingExtChannels.MOCK_REVIEW_HISTORY_GET, {
      id: '00000000-0000-0000-0000-000000000000',
    });
    expect(detail).toBeNull();

    const removed = await harness.invoke<MockReviewHistoryRemoveResult>(
      WritingExtChannels.MOCK_REVIEW_HISTORY_REMOVE,
      { id: '00000000-0000-0000-0000-000000000000' },
    );
    expect(removed).toEqual({ ok: false });
  });

  it('removes an existing record', async () => {
    const { adapter } = mockLlm(MOCK_REVIEW_JSON);
    harness = assembleWritingExtHarness('tsa-mockreview-history-remove-', adapter, ipcHandlers);

    await harness.invoke(WritingExtChannels.WRITING_MOCK_REVIEW, { text: '삭제될 원고입니다.' });
    const list = await harness.invoke<MockReviewHistoryListResult>(WritingExtChannels.MOCK_REVIEW_HISTORY_LIST);
    const id = list.records[0]!.id;

    const removed = await harness.invoke<MockReviewHistoryRemoveResult>(
      WritingExtChannels.MOCK_REVIEW_HISTORY_REMOVE,
      { id },
    );
    expect(removed).toEqual({ ok: true });

    const after = await harness.invoke<MockReviewHistoryListResult>(WritingExtChannels.MOCK_REVIEW_HISTORY_LIST);
    expect(after.records).toEqual([]);
  });

  it('rejects a non-string/missing id on get and remove without an unhandled error', async () => {
    harness = assembleWritingExtHarness('tsa-mockreview-history-invalid-', null, ipcHandlers);

    await expect(
      harness.invoke(WritingExtChannels.MOCK_REVIEW_HISTORY_GET, { id: 123 }),
    ).rejects.toThrow(/잘못된 요청/);
    await expect(harness.invoke(WritingExtChannels.MOCK_REVIEW_HISTORY_REMOVE, {})).rejects.toThrow(/잘못된 요청/);
  });

  it('isolates records per project — switching the active mock-review dir changes the visible history', async () => {
    const { adapter } = mockLlm(MOCK_REVIEW_JSON, MOCK_REVIEW_JSON);
    harness = assembleWritingExtHarness('tsa-mockreview-history-isolation-', adapter, ipcHandlers);

    await harness.invoke(WritingExtChannels.WRITING_MOCK_REVIEW, { text: 'A 프로젝트 원고' });
    const listA = await harness.invoke<MockReviewHistoryListResult>(WritingExtChannels.MOCK_REVIEW_HISTORY_LIST);
    expect(listA.records.map((r) => r.textPreview)).toEqual(['A 프로젝트 원고']);

    harness.activeDir.current = harness.mockReviewDirB;
    await harness.invoke(WritingExtChannels.WRITING_MOCK_REVIEW, { text: 'B 프로젝트 원고' });
    const listB = await harness.invoke<MockReviewHistoryListResult>(WritingExtChannels.MOCK_REVIEW_HISTORY_LIST);
    expect(listB.records.map((r) => r.textPreview)).toEqual(['B 프로젝트 원고']);
  });
});
