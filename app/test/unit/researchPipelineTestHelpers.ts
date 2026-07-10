/**
 * Shared mock/builder helpers for the deep-research pipeline test suites
 * (`researchPipeline.test.ts`, and reusable by `researchPipelineResume.test.ts`).
 * Split out of `researchPipeline.test.ts` to keep each file under the
 * project's 300-line hard limit.
 */

import type { AcademicClient, AcademicSource, PaperMetadata, SearchFailureReason } from '../../src/core/academic-api/types';
import type { LlmAdapter, LlmRequest, LlmUsage } from '../../src/core/llm';
import type { SerializedMemory } from '../../src/core/memory/serializer';
import { runDeepResearch } from '../../src/core/research-pipeline/pipeline';
import type { DeepResearchInput, RelevanceLabel } from '../../src/core/research-pipeline/types';

export const MEMORY: SerializedMemory = {
  text: '## 프로젝트 개요\n제목: 테스트 프로젝트',
  isEmpty: false,
  approxTokens: 12,
};

export const FIXED_USAGE: LlmUsage = { inputTokens: 10, outputTokens: 5 };

/** Runs the pipeline with sensible defaults; callers override only what matters. */
export function run(overrides: Pick<DeepResearchInput, 'llm' | 'clients'> & Partial<DeepResearchInput>) {
  return runDeepResearch({ question: 'q', memory: MEMORY, model: 'm', ...overrides });
}

export function paper(overrides: Partial<PaperMetadata> & { title: string }): PaperMetadata {
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

export interface LlmScript {
  queryGen?: (question: string, callIndex: number) => string;
  screening?: (content: string) => string;
  report?: (content: string) => string;
}

export interface MockLlm {
  adapter: LlmAdapter;
  calls: Array<{ system: string; content: string; stage: string }>;
}

function stageOf(system: string): string {
  if (system.includes('검색어로 변환')) return 'query-gen';
  if (system.includes('관련도는 high')) return 'screening';
  if (system.includes('종합 리포트')) return 'report';
  return 'unknown';
}

export function makeLlm(script: LlmScript = {}): MockLlm {
  const calls: MockLlm['calls'] = [];
  let queryCalls = 0;
  const adapter: LlmAdapter = {
    provider: 'gemini',
    async chat(req: LlmRequest) {
      const system = req.system ?? '';
      const content = req.messages[req.messages.length - 1]?.content ?? '';
      const stage = stageOf(system);
      calls.push({ system, content, stage });
      let text = '';
      if (stage === 'query-gen') text = script.queryGen ? script.queryGen(content, queryCalls++) : defaultQueryJson();
      else if (stage === 'screening') text = script.screening ? script.screening(content) : screenAll('high')(content);
      else if (stage === 'report') text = script.report ? script.report(content) : '선행연구 종합 결과입니다 [1].';
      return { text, usage: FIXED_USAGE, model: req.model };
    },
  };
  return { adapter, calls };
}

export function defaultQueryJson(): string {
  return JSON.stringify({ ko: ['국문검색어1', '국문검색어2'], en: ['english one', 'english two'] });
}

/** Screening handler that labels every numbered item with `label`. */
export function screenAll(label: RelevanceLabel): (content: string) => string {
  return (content) => {
    const count = (content.match(/^\d+\. /gm) ?? []).length;
    return JSON.stringify(Array.from({ length: count }, (_, i) => ({ index: i + 1, relevance: label })));
  };
}

export function okClient(source: AcademicSource, papers: PaperMetadata[]): AcademicClient {
  return { source, async search() { return { ok: true, papers }; } };
}

export function failClient(source: AcademicSource, reason: SearchFailureReason): AcademicClient {
  return { source, async search() { return { ok: false, reason }; } };
}

export function recordingClient(source: AcademicSource, papers: PaperMetadata[], log: string[]): AcademicClient {
  return { source, async search(query: string) { log.push(query); return { ok: true, papers }; } };
}
