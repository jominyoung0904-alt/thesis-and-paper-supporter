/**
 * IPC handlers for sentence polishing, mock peer review, and saved
 * mock-review history (`writing:polish`, `writing:mock-review`,
 * `writing:mock-review-history:list/get/remove` — FR-WRT-009/010/011, T59
 * SPEC-TSA-002).
 *
 * Follows the same domain-handler-file split as `researchGateHandlers.ts` /
 * `gateHistoryHandlers.ts` (T40/T56, SPEC-TSA-002) to stay under the
 * project's 300-line file limit. `WritingExtChannels` is imported directly
 * from `shared/ipc/writingExt.ts` rather than through the central
 * `shared/ipc/index.ts` barrel, so this module compiles independently of the
 * central wiring pass; see this task's "배선 명세" report for the exact
 * snippets that fold this into channels.ts / index.ts / handlers.ts /
 * preload.ts / thesisApi.ts.
 *
 * `writing:mock-review` never throws on a fail-closed (`ok: false`) outcome
 * — `runMockReview` itself is fail-closed (mirrors `runPolish`/
 * `runQualityGate`'s "return the outcome, don't throw for a business-level
 * failure" convention) — but it IS auto-saved into mock-review history right
 * after the call resolves, exactly like `saveGateRecord()` saves every
 * `quality-gate:run` result regardless of `passed` (FR-WRT-008 "동일한 저장
 * 패턴", per `mockReviewStore.ts`'s doc comment).
 */

import { ipcMain } from 'electron';

import { translateLlmError } from '../../core/llm/errorTranslator';
import type { MemoryStore } from '../../core/memory/store';
import { serializeMemoryForPrompt } from '../../core/memory/serializer';
import { runMockReview } from '../../core/writing/mockReview';
import { MockReviewStore, type MockReviewRecord } from '../../core/writing/mockReviewStore';
import { runPolish } from '../../core/writing/polish';
import {
  WritingExtChannels,
  type MockReviewHistoryGetRequest,
  type MockReviewHistoryGetResult,
  type MockReviewHistoryListResult,
  type MockReviewHistoryRecord,
  type MockReviewHistoryRemoveRequest,
  type MockReviewHistoryRemoveResult,
  type WritingMockReviewRequest,
  type WritingMockReviewResult,
  type WritingPolishRequest,
  type WritingPolishResult,
} from '../../shared/ipc/writingExt';
import { INVALID_REQUEST_MESSAGE, isBoundedString } from './guards';
import { NO_KEY_MESSAGE } from './llmService';
import type { LlmService } from './llmService';

export interface WritingExtHandlerDeps {
  llmService: LlmService;
  /**
   * Returns the ACTIVE project's memory store. Re-invoked on every call
   * (rather than captured once) so a project switch is reflected on the very
   * next channel invocation — mirrors `getMemoryStore` in
   * `researchGateHandlers.ts` (T39/T41, FR-PRJ-002).
   */
  getMemoryStore: () => MemoryStore;
  /**
   * Returns the ACTIVE project's mock-review history directory
   * (`projectPaths.ts`'s `mockReviewDir`). Re-invoked on every call — same
   * pattern as `getMemoryStore`.
   */
  getMockReviewDir: () => string;
}

const MAX_TEXT_LENGTH = 50_000;
/** UUIDs are 36 chars; generous bound keeps this a cheap sanity check, not a format validator. */
const MAX_ID_LENGTH = 200;

/** Registers `writing:polish`, `writing:mock-review`, and `writing:mock-review-history:*`. */
export function registerWritingExtHandlers(deps: WritingExtHandlerDeps): void {
  const { llmService, getMemoryStore, getMockReviewDir } = deps;

  ipcMain.handle(
    WritingExtChannels.WRITING_POLISH,
    async (_event, payload: WritingPolishRequest): Promise<WritingPolishResult> => {
      if (!isBoundedString(payload?.text, MAX_TEXT_LENGTH)) {
        throw new Error(INVALID_REQUEST_MESSAGE);
      }
      if (!llmService.hasKey()) {
        throw new Error(NO_KEY_MESSAGE);
      }

      try {
        return await runPolish(payload.text, {
          llm: llmService.getAdapter(),
          model: llmService.getModel(),
          memory: serializeMemoryForPrompt(getMemoryStore().getSnapshot()),
        });
      } catch (err) {
        throw new Error(translateLlmError(err).message);
      }
    },
  );

  ipcMain.handle(
    WritingExtChannels.WRITING_MOCK_REVIEW,
    async (_event, payload: WritingMockReviewRequest): Promise<WritingMockReviewResult> => {
      if (!isBoundedString(payload?.text, MAX_TEXT_LENGTH)) {
        throw new Error(INVALID_REQUEST_MESSAGE);
      }
      if (!llmService.hasKey()) {
        throw new Error(NO_KEY_MESSAGE);
      }

      try {
        const result = await runMockReview(payload.text, {
          llm: llmService.getAdapter(),
          model: llmService.getModel(),
          memory: serializeMemoryForPrompt(getMemoryStore().getSnapshot()),
        });
        // Auto-save (FR-WRT-011): saveMockReviewRecord() owns its own
        // try/catch and only ever logs — it can never throw here and never
        // delays/replaces the response returned below. Saved regardless of
        // result.ok, exactly like saveGateRecord().
        saveMockReviewRecord(getMockReviewDir(), payload.text, result);
        return result;
      } catch (err) {
        throw new Error(translateLlmError(err).message);
      }
    },
  );

  ipcMain.handle(WritingExtChannels.MOCK_REVIEW_HISTORY_LIST, async (): Promise<MockReviewHistoryListResult> => {
    const store = new MockReviewStore(getMockReviewDir());
    return { records: store.listSummaries() };
  });

  ipcMain.handle(
    WritingExtChannels.MOCK_REVIEW_HISTORY_GET,
    async (_event, payload: MockReviewHistoryGetRequest): Promise<MockReviewHistoryGetResult> => {
      if (!isBoundedString(payload?.id, MAX_ID_LENGTH)) {
        throw new Error(INVALID_REQUEST_MESSAGE);
      }

      const store = new MockReviewStore(getMockReviewDir());
      const record = store.get(payload.id);
      return record ? toIpcRecord(record) : null;
    },
  );

  ipcMain.handle(
    WritingExtChannels.MOCK_REVIEW_HISTORY_REMOVE,
    async (_event, payload: MockReviewHistoryRemoveRequest): Promise<MockReviewHistoryRemoveResult> => {
      if (!isBoundedString(payload?.id, MAX_ID_LENGTH)) {
        throw new Error(INVALID_REQUEST_MESSAGE);
      }

      const store = new MockReviewStore(getMockReviewDir());
      return { ok: store.remove(payload.id) };
    },
  );
}

/**
 * Persists one mock-review run into `mockReviewDir` (FR-WRT-011). Intended to
 * be called from `writing:mock-review`'s success path right after
 * `runMockReview` resolves — mirrors `saveGateRecord()` in
 * `gateHistoryHandlers.ts`.
 *
 * Save failures are logged and swallowed, never thrown: a broken history
 * write must never fail (or even delay) the mock-review result the user is
 * already waiting on.
 */
export function saveMockReviewRecord(mockReviewDir: string, text: string, result: WritingMockReviewResult): void {
  try {
    new MockReviewStore(mockReviewDir).add(text, result);
  } catch (err) {
    console.error('[mock-review-history] failed to save mock review record:', err);
  }
}

function toIpcRecord(record: MockReviewRecord): MockReviewHistoryRecord {
  return {
    id: record.id,
    ranAt: record.ranAt,
    text: record.text,
    result: record.result,
  };
}
