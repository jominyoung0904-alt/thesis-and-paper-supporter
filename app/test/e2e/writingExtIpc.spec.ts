/**
 * T59 (SPEC-TSA-002) — `writing:polish` / `writing:mock-review` IPC handlers,
 * exercised directly against `registerWritingExtHandlers` with `electron`
 * mocked exactly like `gateHistoryIpc.spec.ts` / `researchHistoryIpc.spec.ts`.
 * Mock-review history CRUD lives in the sibling
 * `writingExtHistoryIpc.spec.ts` (split to stay under the project's 300-line
 * file limit).
 *
 * This spec does NOT go through `registerIpcHandlers` (handlers.ts) — the
 * central wiring that assembles a real `LlmService`/`ProjectContext` is done
 * by the integration pass (see this task's "배선 명세" report), which this
 * executor's file ownership excludes. A minimal in-file `LlmService` double
 * (`writingExtTestHelpers.ts`) and a real `MemoryStore` (backed by a temp
 * file) stand in for those.
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
import type { MockReviewHistoryListResult, WritingMockReviewResult, WritingPolishResult } from '../../src/shared/ipc/writingExt';
import { assembleWritingExtHarness, mockLlm, MOCK_REVIEW_JSON, type WritingExtHarness } from './writingExtTestHelpers';

const POLISH_JSON = JSON.stringify({
  polishedText: '본 연구는 중요한 논제를 다룬다.',
  changes: [{ before: '진짜 중요한', after: '중요한', reason: '구어체를 학술 문체로 다듬었어요.' }],
  language: 'ko',
});

beforeEach(() => {
  ipcHandlers.clear();
});

describe('writing:polish', () => {
  let harness: WritingExtHarness | undefined;

  afterEach(() => {
    if (harness) rmSync(harness.workDir, { recursive: true, force: true });
    harness = undefined;
  });

  it('throws the no-key message when no LLM key has been registered yet', async () => {
    harness = assembleWritingExtHarness('tsa-writing-polish-nokey-', null, ipcHandlers);

    await expect(
      harness.invoke(WritingExtChannels.WRITING_POLISH, { text: '다듬을 문장입니다.' }),
    ).rejects.toThrow(/API 키를 등록/);
  });

  it('rejects empty text without calling the LLM', async () => {
    const { adapter, chat } = mockLlm(POLISH_JSON);
    harness = assembleWritingExtHarness('tsa-writing-polish-empty-', adapter, ipcHandlers);

    await expect(harness.invoke(WritingExtChannels.WRITING_POLISH, { text: '   ' })).rejects.toThrow(/잘못된 요청/);
    expect(chat).not.toHaveBeenCalled();
  });

  it('rejects text over the 50,000-char bound without calling the LLM', async () => {
    const { adapter, chat } = mockLlm(POLISH_JSON);
    harness = assembleWritingExtHarness('tsa-writing-polish-toolong-', adapter, ipcHandlers);

    await expect(
      harness.invoke(WritingExtChannels.WRITING_POLISH, { text: 'a'.repeat(50_001) }),
    ).rejects.toThrow(/잘못된 요청/);
    expect(chat).not.toHaveBeenCalled();
  });

  it('runs the polish engine end-to-end and returns the parsed result', async () => {
    const { adapter } = mockLlm(POLISH_JSON);
    harness = assembleWritingExtHarness('tsa-writing-polish-ok-', adapter, ipcHandlers);

    const result = await harness.invoke<WritingPolishResult>(WritingExtChannels.WRITING_POLISH, {
      text: '이 연구는 진짜 중요한 얘기를 다루고 있다고 생각한다.',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.polishedText).toBe('본 연구는 중요한 논제를 다룬다.');
    expect(result.language).toBe('ko');
  });
});

describe('writing:mock-review', () => {
  let harness: WritingExtHarness | undefined;

  afterEach(() => {
    if (harness) rmSync(harness.workDir, { recursive: true, force: true });
    harness = undefined;
  });

  it('runs the mock-review engine end-to-end and auto-saves the result into history', async () => {
    const { adapter } = mockLlm(MOCK_REVIEW_JSON);
    harness = assembleWritingExtHarness('tsa-writing-mockreview-ok-', adapter, ipcHandlers);

    const result = await harness.invoke<WritingMockReviewResult>(WritingExtChannels.WRITING_MOCK_REVIEW, {
      text: '이것은 심사받을 원고 전체입니다.',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.questions).toHaveLength(3);
    expect(result.weaknesses.map((w) => w.severity).sort()).toEqual(['major', 'minor']);
    expect(result.overallComment).toContain('방법론');

    const list = await harness.invoke<MockReviewHistoryListResult>(WritingExtChannels.MOCK_REVIEW_HISTORY_LIST);
    expect(list.records).toHaveLength(1);
    expect(list.records[0]).toMatchObject({ ok: true, textPreview: '이것은 심사받을 원고 전체입니다.' });
  });

  it('auto-saves a fail-closed (ok: false) outcome into history too, and still returns it (never throws)', async () => {
    const { adapter } = mockLlm('이건 JSON이 아니에요', '이것도 JSON이 아니에요');
    harness = assembleWritingExtHarness('tsa-writing-mockreview-failclosed-', adapter, ipcHandlers);

    const result = await harness.invoke<WritingMockReviewResult>(WritingExtChannels.WRITING_MOCK_REVIEW, {
      text: '파싱에 실패할 원고입니다.',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected fail-closed');
    expect(result.reason).toContain('모의 심사');

    const list = await harness.invoke<MockReviewHistoryListResult>(WritingExtChannels.MOCK_REVIEW_HISTORY_LIST);
    expect(list.records).toHaveLength(1);
    expect(list.records[0]?.ok).toBe(false);
  });

  it('throws the no-key message when no LLM key has been registered yet', async () => {
    harness = assembleWritingExtHarness('tsa-writing-mockreview-nokey-', null, ipcHandlers);

    await expect(
      harness.invoke(WritingExtChannels.WRITING_MOCK_REVIEW, { text: '심사받을 원고입니다.' }),
    ).rejects.toThrow(/API 키를 등록/);
  });

  it('rejects empty text without calling the LLM', async () => {
    const { adapter, chat } = mockLlm(MOCK_REVIEW_JSON);
    harness = assembleWritingExtHarness('tsa-writing-mockreview-empty-', adapter, ipcHandlers);

    await expect(harness.invoke(WritingExtChannels.WRITING_MOCK_REVIEW, { text: '' })).rejects.toThrow(
      /잘못된 요청/,
    );
    expect(chat).not.toHaveBeenCalled();
  });
});
