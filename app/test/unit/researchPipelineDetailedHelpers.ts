/**
 * Shared mock/builder helpers for the detailed-mode ("상세검색") pipeline test
 * suites (`researchPipelineDetailed.test.ts`,
 * `researchPipelineDetailedCheckpoint.test.ts`). Split out to keep each test
 * file under the project's 300-line hard limit.
 */

import type { AcademicClient, AcademicSource, PaperMetadata } from '../../src/core/academic-api/types';
import type { LlmAdapter, LlmRequest, LlmUsage } from '../../src/core/llm';
import type { CheckpointData, CheckpointState } from '../../src/core/research-pipeline/checkpoint';
import { runDeepResearch } from '../../src/core/research-pipeline/pipeline';
import type { CheckpointHooks, DeepResearchInput, RelevanceLabel } from '../../src/core/research-pipeline/types';
import { MEMORY } from './researchPipelineTestHelpers';

export const FIXED_USAGE: LlmUsage = { inputTokens: 10, outputTokens: 5 };

export const FIRST_KO = ['국문검색어1', '국문검색어2'];
export const FIRST_EN = ['english one', 'english two'];
export const AUGMENT_TERMS = JSON.stringify({ ko: ['보강국문1', '보강국문2'], en: ['aug eng1', 'aug eng2'] });

export function run(overrides: Pick<DeepResearchInput, 'llm' | 'clients'> & Partial<DeepResearchInput>) {
  return runDeepResearch({ question: 'q', memory: MEMORY, model: 'm', ...overrides });
}

export interface Call {
  stage: string;
  content: string;
}

export interface MockLlm {
  adapter: LlmAdapter;
  calls: Call[];
}

function stageOf(system: string): string {
  if (system.includes('보강하기 위한 추가 검색어')) return 'augment';
  if (system.includes('검색어로 변환')) return 'query-gen';
  if (system.includes('관련도는 high')) return 'screening';
  if (system.includes('종합 리포트')) return 'report';
  return 'unknown';
}

/** Labels every numbered paper in a screening batch `high` so it survives into the report. */
function screenHigh(content: string): string {
  const count = (content.match(/^\d+\. /gm) ?? []).length;
  return JSON.stringify(Array.from({ length: count }, (_, i) => ({ index: i + 1, relevance: 'high' as RelevanceLabel })));
}

/** `augment` is the raw text the augmentation-query LLM call returns. */
export function makeLlm(augment: string): MockLlm {
  const calls: Call[] = [];
  const adapter: LlmAdapter = {
    provider: 'gemini',
    async chat(req: LlmRequest) {
      const system = req.system ?? '';
      const content = req.messages[req.messages.length - 1]?.content ?? '';
      const stage = stageOf(system);
      calls.push({ stage, content });
      let text = '';
      if (stage === 'query-gen') text = JSON.stringify({ ko: FIRST_KO, en: FIRST_EN });
      else if (stage === 'augment') text = augment;
      else if (stage === 'screening') text = screenHigh(content);
      else if (stage === 'report') text = '종합 결과입니다 [1].';
      return { text, usage: FIXED_USAGE, model: req.model };
    },
  };
  return { adapter, calls };
}

/** Client that returns papers keyed by the exact search term, recording every term it saw. */
export function termClient(source: AcademicSource, map: Record<string, PaperMetadata[]>, log: string[] = []): AcademicClient {
  return {
    source,
    async search(query: string) {
      log.push(query);
      return { ok: true, papers: map[query] ?? [] };
    },
  };
}

/** In-memory `CheckpointHooks` recording every saved payload (schema v2). */
export function createMemoryCheckpoint(seed: CheckpointState | null = null): {
  hooks: CheckpointHooks;
  saved: CheckpointData[];
  clearCount: number;
  state: CheckpointState | null;
} {
  const tracker = {
    hooks: undefined as unknown as CheckpointHooks,
    saved: [] as CheckpointData[],
    clearCount: 0,
    state: seed,
  };
  tracker.hooks = {
    load: () => tracker.state,
    save: (data: CheckpointData) => {
      tracker.saved.push(data);
      tracker.state = { ...data, version: 2, savedAt: new Date().toISOString() };
    },
    clear: () => {
      tracker.clearCount += 1;
      tracker.state = null;
    },
  };
  return tracker;
}
