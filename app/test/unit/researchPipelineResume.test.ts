/**
 * Deep-research checkpoint resume behavior (FR-RES-007/008, T61).
 *
 * Split out of `researchPipeline.test.ts` to stay under the project's
 * 300-line file limit — helper fixtures (`paper`, `makeLlm`, `okClient`,
 * `recordingClient`, `run`) are intentionally duplicated in miniature here
 * rather than shared, so each test file stays independently readable and
 * neither file depends on the other's internal layout.
 */

import { describe, expect, it } from 'vitest';

import type { AcademicClient, AcademicSource, PaperMetadata } from '../../src/core/academic-api/types';
import type { LlmAdapter, LlmRequest, LlmUsage } from '../../src/core/llm';
import type { SerializedMemory } from '../../src/core/memory/serializer';
import type { CheckpointData, CheckpointState } from '../../src/core/research-pipeline/checkpoint';
import { runDeepResearch } from '../../src/core/research-pipeline/pipeline';
import type { CheckpointHooks, DeepResearchInput, RelevanceLabel } from '../../src/core/research-pipeline/types';

const MEMORY: SerializedMemory = {
  text: '## 프로젝트 개요\n제목: 테스트 프로젝트',
  isEmpty: false,
  approxTokens: 12,
};

const FIXED_USAGE: LlmUsage = { inputTokens: 10, outputTokens: 5 };
const RESUME_NOTICE = '이전에 진행하던 리서치를 이어서 해요.';

/** Runs the pipeline with sensible defaults; callers override only what matters. */
function run(overrides: Pick<DeepResearchInput, 'llm' | 'clients'> & Partial<DeepResearchInput>) {
  return runDeepResearch({ question: 'q', memory: MEMORY, model: 'm', ...overrides });
}

function paper(overrides: Partial<PaperMetadata> & { title: string }): PaperMetadata {
  return {
    source: 'kci',
    externalId: `id-${overrides.title}`,
    authors: ['홍길동'],
    year: 2024,
    abstract: '테스트 초록입니다.',
    venue: null,
    url: 'https://example.com/paper',
    citationCount: null,
    ...overrides,
  };
}

interface LlmScript {
  report?: (content: string) => string;
}

interface MockLlm {
  adapter: LlmAdapter;
  calls: Array<{ system: string; stage: string }>;
}

function stageOf(system: string): string {
  if (system.includes('검색어로 변환')) return 'query-gen';
  if (system.includes('관련도는 high')) return 'screening';
  if (system.includes('종합 리포트')) return 'report';
  return 'unknown';
}

function screenAllHigh(content: string): string {
  const count = (content.match(/^\d+\. /gm) ?? []).length;
  return JSON.stringify(Array.from({ length: count }, (_, i) => ({ index: i + 1, relevance: 'high' as RelevanceLabel })));
}

function makeLlm(script: LlmScript = {}): MockLlm {
  const calls: MockLlm['calls'] = [];
  const adapter: LlmAdapter = {
    provider: 'gemini',
    async chat(req: LlmRequest) {
      const system = req.system ?? '';
      const stage = stageOf(system);
      calls.push({ system, stage });
      let text = '';
      if (stage === 'query-gen') text = JSON.stringify({ ko: ['국문검색어1', '국문검색어2'], en: ['english one', 'english two'] });
      else if (stage === 'screening') text = screenAllHigh(req.messages[req.messages.length - 1]?.content ?? '');
      else if (stage === 'report') text = script.report ? script.report('') : '선행연구 종합 결과입니다 [1].';
      return { text, usage: FIXED_USAGE, model: req.model };
    },
  };
  return { adapter, calls };
}

function okClient(source: AcademicSource, papers: PaperMetadata[]): AcademicClient {
  return { source, async search() { return { ok: true, papers }; } };
}

function recordingClient(source: AcademicSource, papers: PaperMetadata[], log: string[]): AcademicClient {
  return { source, async search(query: string) { log.push(query); return { ok: true, papers }; } };
}

/** In-memory `CheckpointHooks` implementation — mirrors `checkpoint.ts`'s contract without touching disk. */
function createMemoryCheckpoint(seed: CheckpointState | null = null): {
  hooks: CheckpointHooks;
  saveCount: number;
  clearCount: number;
  state: CheckpointState | null;
} {
  const tracker = { hooks: undefined as unknown as CheckpointHooks, saveCount: 0, clearCount: 0, state: seed };
  tracker.hooks = {
    load: () => tracker.state,
    save: (data: CheckpointData) => {
      tracker.saveCount += 1;
      tracker.state = { ...data, version: 1, savedAt: new Date().toISOString() };
    },
    clear: () => {
      tracker.clearCount += 1;
      tracker.state = null;
    },
  };
  return tracker;
}

describe('runDeepResearch — checkpoint resume (FR-RES-007/008)', () => {
  it('behaves exactly as before when input.checkpoint is omitted (regression: no checkpoint file involved)', async () => {
    const { adapter } = makeLlm();
    const clients = [okClient('kci', [paper({ title: '논문' })])];

    const result = await run({ llm: adapter, clients });

    expect(result.report).toBeTruthy();
  });

  it('saves a "searching" checkpoint after search, then a "screening" checkpoint after screening, and clears it on success', async () => {
    const { adapter } = makeLlm();
    const clients = [okClient('kci', [paper({ title: '논문' })])];
    const checkpoint = createMemoryCheckpoint();

    await run({ llm: adapter, clients, checkpoint: checkpoint.hooks });

    // Exactly two saves (post-search, post-screening), then cleared on success.
    expect(checkpoint.saveCount).toBe(2);
    expect(checkpoint.state).toBeNull();
    expect(checkpoint.clearCount).toBeGreaterThanOrEqual(1);
  });

  it('resumes from a "screening" checkpoint after a report failure, re-calling neither the academic clients nor the screening LLM', async () => {
    const question = '메타인지 학습에 대한 선행연구가 있어?';
    const searchLog: string[] = [];
    const clients = [
      recordingClient('kci', [paper({ title: '메타인지 학습 전략 연구' })], searchLog),
      recordingClient('semanticscholar', [], searchLog),
    ];
    let reportAttempts = 0;
    const { adapter, calls } = makeLlm({
      report: () => {
        reportAttempts += 1;
        if (reportAttempts === 1) throw new Error('llm network error');
        return '요약입니다 [1].';
      },
    });
    const checkpoint = createMemoryCheckpoint();

    await expect(run({ question, llm: adapter, clients, checkpoint: checkpoint.hooks })).rejects.toThrow();

    expect(checkpoint.state?.completedStage).toBe('screening');
    const searchCallsAfterFirstRun = searchLog.length;
    const screeningCallsAfterFirstRun = calls.filter((c) => c.stage === 'screening').length;
    const queryGenCallsAfterFirstRun = calls.filter((c) => c.stage === 'query-gen').length;

    const progress: string[] = [];
    const result = await run({
      question,
      llm: adapter,
      clients,
      checkpoint: checkpoint.hooks,
      onProgress: (e) => progress.push(`${e.stage}:${e.detail ?? ''}`),
    });

    expect(result.report).toContain('요약입니다');
    // No new academic-API calls or query-gen/screening LLM calls on the second run.
    expect(searchLog.length).toBe(searchCallsAfterFirstRun);
    expect(calls.filter((c) => c.stage === 'screening').length).toBe(screeningCallsAfterFirstRun);
    expect(calls.filter((c) => c.stage === 'query-gen').length).toBe(queryGenCallsAfterFirstRun);
    // Only report ran, with the resume notice attached.
    expect(progress).toEqual([`report:${RESUME_NOTICE}`]);
    // Cleared after the successful second run.
    expect(checkpoint.state).toBeNull();
  });

  it('resumes from a "searching" checkpoint by skipping query-gen and search, but still runs screening', async () => {
    const question = '메타인지 학습에 대한 선행연구가 있어?';
    const searchLog: string[] = [];
    const clients = [recordingClient('kci', [], searchLog)];
    const { adapter, calls } = makeLlm();
    const seeded: CheckpointState = {
      version: 1,
      savedAt: new Date().toISOString(),
      question,
      queries: { ko: ['국문검색어1'], en: ['english one'] },
      papers: [paper({ title: '이미 수집된 논문' })],
      failedSources: [],
      completedStage: 'searching',
    };
    const checkpoint = createMemoryCheckpoint(seeded);

    const progress: string[] = [];
    const result = await run({
      question,
      llm: adapter,
      clients,
      checkpoint: checkpoint.hooks,
      onProgress: (e) => progress.push(`${e.stage}:${e.detail ?? ''}`),
    });

    expect(searchLog).toEqual([]); // search never re-invoked
    expect(calls.filter((c) => c.stage === 'query-gen')).toHaveLength(0); // query-gen never re-invoked
    expect(calls.filter((c) => c.stage === 'screening')).toHaveLength(1); // screening still runs
    expect(result.papers).toHaveLength(1);
    expect(result.papers[0]?.paper.title).toBe('이미 수집된 논문');
    expect(progress[0]).toBe(`screening:${RESUME_NOTICE} 1편 스크리닝`);
    expect(progress[1]).toBe('report:');
    expect(checkpoint.state).toBeNull(); // cleared on success
  });

  it('discards a checkpoint for a different question and runs fresh from query-gen', async () => {
    const searchLog: string[] = [];
    const clients = [recordingClient('kci', [paper({ title: '논문' })], searchLog)];
    const { adapter, calls } = makeLlm();
    const seeded: CheckpointState = {
      version: 1,
      savedAt: new Date().toISOString(),
      question: '이전에 물어본 다른 질문',
      queries: { ko: ['옛날검색어'], en: ['old term'] },
      papers: [],
      failedSources: [],
      completedStage: 'searching',
    };
    const checkpoint = createMemoryCheckpoint(seeded);

    await run({ question: '새로운 질문', llm: adapter, clients, checkpoint: checkpoint.hooks });

    expect(searchLog.length).toBeGreaterThan(0); // search DID run — nothing was reused
    expect(calls.filter((c) => c.stage === 'query-gen')).toHaveLength(1);
    expect(checkpoint.state).toBeNull();
  });
});
