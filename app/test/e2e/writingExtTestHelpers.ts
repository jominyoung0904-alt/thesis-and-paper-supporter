/**
 * Shared harness for `writingExtIpc.spec.ts` / `writingExtHistoryIpc.spec.ts`
 * (T59, SPEC-TSA-002) — split out once the combined spec crossed the
 * project's 300-line file limit. Mirrors `firstRunHelpers.ts`'s "plain,
 * mock-free helpers live in their own file; `vi.mock` calls stay in the spec
 * file itself" split, since Vitest only hoists `vi.mock` reliably within the
 * file it's written in.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { vi } from 'vitest';

import type { LlmAdapter, LlmRequest, LlmResponse } from '../../src/core/llm/types';
import { MemoryStore } from '../../src/core/memory/store';
import type { LlmService } from '../../src/main/ipc/llmService';
import { registerWritingExtHandlers } from '../../src/main/ipc/writingExtHandlers';
import { ensureProjectDirectories, resolveProjectPaths } from '../../src/main/project/projectPaths';

/** Builds a minimal LlmResponse from plain text. */
export function textResponse(text: string): LlmResponse {
  return { text, usage: { inputTokens: 10, outputTokens: 10 }, model: 'test-model' };
}

/** Builds a mock LlmAdapter whose `chat` is a vi.fn, queued via mockResolvedValueOnce. */
export function mockLlm(...responses: string[]): { adapter: LlmAdapter; chat: ReturnType<typeof vi.fn> } {
  const chat = vi.fn<(req: LlmRequest) => Promise<LlmResponse>>();
  for (const r of responses) chat.mockResolvedValueOnce(textResponse(r));
  return { adapter: { provider: 'claude', chat }, chat };
}

/** Minimal `LlmService` double — `hasKey` toggled per test, `getAdapter` returns the queued mock adapter. */
function makeLlmService(adapter: LlmAdapter | null): LlmService {
  return {
    hasKey: () => adapter !== null,
    getModel: () => 'test-model',
    getAdapter: () => {
      if (!adapter) throw new Error('test setup error: no adapter registered');
      return adapter;
    },
    invalidate: () => undefined,
  };
}

export interface WritingExtHarness {
  workDir: string;
  mockReviewDirA: string;
  mockReviewDirB: string;
  activeDir: { current: string };
  invoke: <T>(channel: string, payload?: unknown) => Promise<T>;
}

/**
 * Sets up two project mock-review dirs (default + a UUID project) and one
 * registered handler set. `ipcHandlers` is the spec file's own `vi.hoisted`
 * map — passed in rather than imported, since each spec file's `vi.mock`
 * factory closes over its own map instance.
 */
export function assembleWritingExtHarness(
  prefix: string,
  adapter: LlmAdapter | null,
  ipcHandlers: Map<string, (event: unknown, payload: unknown) => Promise<unknown>>,
): WritingExtHarness {
  const workDir = mkdtempSync(join(tmpdir(), prefix));

  const pathsA = resolveProjectPaths(workDir, 'default');
  ensureProjectDirectories(pathsA);
  const pathsB = resolveProjectPaths(workDir, '11111111-1111-1111-1111-111111111111');
  ensureProjectDirectories(pathsB);

  const memoryStore = new MemoryStore(join(workDir, 'memory.json'));
  memoryStore.load();

  const activeDir = { current: pathsA.mockReviewDir };
  registerWritingExtHandlers({
    llmService: makeLlmService(adapter),
    getMemoryStore: () => memoryStore,
    getMockReviewDir: () => activeDir.current,
  });

  return {
    workDir,
    mockReviewDirA: pathsA.mockReviewDir,
    mockReviewDirB: pathsB.mockReviewDir,
    activeDir,
    invoke: async <T>(channel: string, payload?: unknown): Promise<T> => {
      const handler = ipcHandlers.get(channel);
      if (!handler) throw new Error(`handler not registered for channel: ${channel}`);
      return handler({}, payload) as Promise<T>;
    },
  };
}

export const MOCK_REVIEW_JSON = JSON.stringify({
  questions: [
    { question: '표본 크기는 왜 이렇게 선정했나요?', basis: '표본 크기 산정 근거가 본문에 없어요.' },
    { question: '기존 연구와의 차별점은 무엇인가요?', basis: '선행연구 대비 기여가 모호해요.' },
    { question: '연구 방법의 한계는 무엇인가요?', basis: '한계 논의가 부족해요.' },
  ],
  weaknesses: [
    { weakness: '표본 크기 산정 근거 부족', severity: 'major', suggestion: '표본 크기 계산 과정을 추가하세요.' },
    { weakness: '오탈자', severity: 'minor', suggestion: '교정을 한 번 더 받으세요.' },
  ],
  overallComment: '전반적으로 탄탄하지만 방법론 설명을 보완하면 좋겠어요.',
});
