import { describe, expect, it } from 'vitest';

import type { AcademicClient, AcademicSource, PaperMetadata, SearchFailureReason } from '../../src/core/academic-api/types';
import type { LlmAdapter, LlmRequest, LlmUsage } from '../../src/core/llm';
import type { SerializedMemory } from '../../src/core/memory/serializer';
import { dedupePapers, runDeepResearch } from '../../src/core/research-pipeline/pipeline';
import { ACCESS_GUIDANCE } from '../../src/core/research-pipeline/report';
import type { DeepResearchInput, RelevanceLabel } from '../../src/core/research-pipeline/types';

/** Runs the pipeline with sensible defaults; callers override only what matters. */
function run(overrides: Pick<DeepResearchInput, 'llm' | 'clients'> & Partial<DeepResearchInput>) {
  return runDeepResearch({ question: 'q', memory: MEMORY, model: 'm', ...overrides });
}

const MEMORY: SerializedMemory = {
  text: '## 프로젝트 개요\n제목: 테스트 프로젝트',
  isEmpty: false,
  approxTokens: 12,
};

const FIXED_USAGE: LlmUsage = { inputTokens: 10, outputTokens: 5 };

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
  queryGen?: (question: string, callIndex: number) => string;
  screening?: (content: string) => string;
  report?: (content: string) => string;
}

interface MockLlm {
  adapter: LlmAdapter;
  calls: Array<{ system: string; content: string; stage: string }>;
}

function stageOf(system: string): string {
  if (system.includes('검색어로 변환')) return 'query-gen';
  if (system.includes('관련도는 high')) return 'screening';
  if (system.includes('종합 리포트')) return 'report';
  return 'unknown';
}

function makeLlm(script: LlmScript = {}): MockLlm {
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

function defaultQueryJson(): string {
  return JSON.stringify({ ko: ['국문검색어1', '국문검색어2'], en: ['english one', 'english two'] });
}

/** Screening handler that labels every numbered item with `label`. */
function screenAll(label: RelevanceLabel): (content: string) => string {
  return (content) => {
    const count = (content.match(/^\d+\. /gm) ?? []).length;
    return JSON.stringify(Array.from({ length: count }, (_, i) => ({ index: i + 1, relevance: label })));
  };
}

function okClient(source: AcademicSource, papers: PaperMetadata[]): AcademicClient {
  return { source, async search() { return { ok: true, papers }; } };
}

function failClient(source: AcademicSource, reason: SearchFailureReason): AcademicClient {
  return { source, async search() { return { ok: false, reason }; } };
}

function recordingClient(source: AcademicSource, papers: PaperMetadata[], log: string[]): AcademicClient {
  return { source, async search(query: string) { log.push(query); return { ok: true, papers }; } };
}

describe('runDeepResearch', () => {
  it('completes the happy path: generates queries, screens, and assembles a report', async () => {
    const { adapter } = makeLlm();
    const clients = [okClient('kci', [paper({ title: '메타인지 학습 전략 연구' })])];

    const result = await run({ question: '메타인지 학습에 대한 선행연구가 있어?', llm: adapter, clients });

    expect(result.queries.ko).toHaveLength(2);
    expect(result.queries.en).toHaveLength(2);
    expect(result.papers).toHaveLength(1);
    expect(result.papers[0]?.relevance).toBe('high');
    expect(result.report).not.toContain('## 참고문헌');
    expect(result.report).toContain(ACCESS_GUIDANCE);
    expect(result.citedPapers).toHaveLength(1);
    expect(result.citedPapers[0]?.paper.title).toBe('메타인지 학습 전략 연구');
    expect(result.relatedPapers).toEqual([]);
    expect(result.failedSources).toEqual([]);
  });

  it('falls back to the raw question as the search term when query JSON never parses', async () => {
    const { adapter, calls } = makeLlm({ queryGen: () => '검색어를 잘 모르겠어요, 죄송합니다.' });
    const question = '표절 탐지 알고리즘';

    const result = await run({ question, llm: adapter, clients: [okClient('kci', [paper({ title: '표절 탐지' })])] });

    expect(result.queries).toEqual({ ko: [question], en: [question] });
    // A parse miss triggers exactly one retry before the fallback.
    expect(calls.filter((c) => c.stage === 'query-gen')).toHaveLength(2);
  });

  it('recovers on the retry when the second query response is valid JSON', async () => {
    const { adapter, calls } = makeLlm({
      queryGen: (_q, idx) => (idx === 0 ? 'not json' : JSON.stringify({ ko: ['가', '나'], en: ['a', 'b'] })),
    });

    const result = await run({ llm: adapter, clients: [okClient('kci', [paper({ title: '논문' })])] });

    expect(result.queries).toEqual({ ko: ['가', '나'], en: ['a', 'b'] });
    expect(calls.filter((c) => c.stage === 'query-gen')).toHaveLength(2);
  });

  it('reports a partially failed source transparently without dropping the rest (FR-RES-009)', async () => {
    const { adapter } = makeLlm();
    const clients = [
      failClient('kci', 'network'),
      okClient('semanticscholar', [paper({ source: 'semanticscholar', title: 'Deep Research Pipelines' })]),
    ];

    const result = await run({ llm: adapter, clients });

    expect(result.failedSources).toEqual([{ source: 'kci', reason: 'network' }]);
    expect(result.papers).toHaveLength(1);
    expect(result.papers[0]?.paper.source).toBe('semanticscholar');
    expect(result.report).toContain('KCI');
    expect(result.report).toContain('네트워크 오류');
  });

  it('deduplicates papers by normalized title across sources', async () => {
    const { adapter } = makeLlm();
    const clients = [
      okClient('kci', [paper({ title: '학술 문헌 자동 분류' })]),
      okClient('semanticscholar', [paper({ source: 'semanticscholar', title: '학술 문헌 자동 분류!!!  ' })]),
    ];

    const result = await run({ llm: adapter, clients });

    expect(result.papers).toHaveLength(1);
  });

  it('labels every paper in a batch medium when screening JSON is unparseable', async () => {
    const { adapter } = makeLlm({ screening: () => '판단하기 어렵습니다.' });
    const clients = [okClient('kci', [paper({ title: '논문 A' }), paper({ title: '논문 B' })])];

    const result = await run({ llm: adapter, clients });

    expect(result.papers).toHaveLength(2);
    expect(result.papers.every((p) => p.relevance === 'medium')).toBe(true);
  });

  it('builds the cited-papers list deterministically from PaperMetadata, never from LLM-authored bibliography (FR-RES-005)', async () => {
    const realPaper = paper({ title: '진짜 논문 제목', authors: ['김철수', '이영희'], year: 2022, venue: '한국정보과학회', url: 'https://real.example/paper/42' });
    // The model fabricates a bibliography and cites it — none of this may leak.
    const { adapter } = makeLlm({ report: () => '요약입니다 [1]. 가짜저자(3000). 존재하지않는논문.' });
    const clients = [okClient('kci', [realPaper])];

    const result = await run({ llm: adapter, clients });

    // The deterministic guarantee is the structured citedPapers list: it is
    // built only from PaperMetadata, so an LLM-authored bibliography can
    // never leak into it (the report body's free-form prose is a separate
    // concern — the model's own sentences are not stripped, only invalid
    // [n] citation markers are; see the "strips citation numbers" test).
    expect(result.citedPapers).toHaveLength(1);
    expect(result.citedPapers[0]?.paper).toMatchObject({
      title: '진짜 논문 제목',
      authors: ['김철수', '이영희'],
      year: 2022,
      venue: '한국정보과학회',
      url: 'https://real.example/paper/42',
    });
  });

  it('strips citation numbers the model invented for papers that are not in the list', async () => {
    const { adapter } = makeLlm({ report: () => '핵심은 [1] 이며 [99] 는 존재하지 않는다.' });
    const clients = [okClient('kci', [paper({ title: '유일 논문' })])];

    const result = await run({ llm: adapter, clients });

    expect(result.report).toContain('[1]');
    expect(result.report).not.toContain('[99]');
    expect(result.citedPapers).toHaveLength(1);
  });

  it('renumbers citations to a contiguous 1..N sequence in order of first appearance', async () => {
    const p1 = paper({ title: '논문 하나' });
    const p2 = paper({ title: '논문 둘' });
    const p3 = paper({ title: '논문 셋' });
    // Screening labels every paper 'high' by default (screenAll('high')), so
    // candidates are numbered [1]=하나, [2]=둘, [3]=셋. The model only cites
    // [3] then [1] — [2] is never cited.
    const { adapter } = makeLlm({ report: () => '먼저 [3] 을 보고 이어서 [1] 을 본다.' });
    const clients = [okClient('kci', [p1, p2, p3])];

    const result = await run({ llm: adapter, clients });

    // First appearance was original [3], so it becomes the new [1]; original
    // [1] appeared second, so it becomes the new [2].
    expect(result.report).toContain('먼저 [1] 을 보고 이어서 [2] 을 본다.');
    expect(result.citedPapers).toHaveLength(2);
    expect(result.citedPapers[0]?.paper.title).toBe('논문 셋');
    expect(result.citedPapers[1]?.paper.title).toBe('논문 하나');
  });

  it('surfaces uncited medium-relevance papers as relatedPapers, capped at 8', async () => {
    const cited = paper({ title: '인용된 논문' });
    const uncitedMedium = Array.from({ length: 10 }, (_, i) => paper({ title: `미인용 medium ${i}` }));
    const { adapter } = makeLlm({
      screening: (content) => {
        const count = (content.match(/^\d+\. /gm) ?? []).length;
        // First paper is high (gets cited), the rest are medium.
        return JSON.stringify(
          Array.from({ length: count }, (_, i) => ({ index: i + 1, relevance: i === 0 ? 'high' : 'medium' })),
        );
      },
      report: () => '요약입니다 [1].',
    });
    const clients = [okClient('kci', [cited, ...uncitedMedium])];

    const result = await run({ llm: adapter, clients });

    expect(result.citedPapers).toHaveLength(1);
    expect(result.citedPapers[0]?.paper.title).toBe('인용된 논문');
    expect(result.relatedPapers).toHaveLength(8);
    expect(result.relatedPapers.every((p) => p.relevance === 'medium')).toBe(true);
  });

  it('aggregates LLM usage across query-gen, screening, and report', async () => {
    const { adapter } = makeLlm();
    const clients = [okClient('kci', [paper({ title: '논문' })])];

    const result = await run({ llm: adapter, clients });

    expect(result.usage.calls).toBe(3);
    expect(result.usage.inputTokens).toBe(30);
    expect(result.usage.outputTokens).toBe(15);
  });

  it('skips the screening call when no papers are found and still returns a valid report', async () => {
    const { adapter } = makeLlm();
    const clients = [okClient('kci', [])];

    const result = await run({ llm: adapter, clients });

    expect(result.papers).toEqual([]);
    // Only query-gen consumes an LLM call: screening is skipped (no papers) and
    // the empty-result report is assembled deterministically without an LLM call.
    expect(result.usage.calls).toBe(1);
    expect(result.report).toContain(ACCESS_GUIDANCE);
  });

  it('emits progress events for all four stages in order', async () => {
    const { adapter } = makeLlm();
    const stages: string[] = [];
    const clients = [okClient('kci', [paper({ title: '논문' })])];

    await run({ llm: adapter, clients, onProgress: (e) => stages.push(e.stage) });

    expect(stages).toEqual(['query-gen', 'searching', 'screening', 'report']);
  });

  it('routes Korean terms to KCI/ScienceON and English terms to Semantic Scholar', async () => {
    const { adapter } = makeLlm({
      queryGen: () => JSON.stringify({ ko: ['국문A', '국문B'], en: ['engA', 'engB'] }),
    });
    const kciLog: string[] = [];
    const ssLog: string[] = [];
    const clients = [
      recordingClient('kci', [paper({ title: '논문' })], kciLog),
      recordingClient('semanticscholar', [], ssLog),
    ];

    await run({ llm: adapter, clients });

    expect(kciLog).toEqual(['국문A', '국문B']);
    expect(ssLog).toEqual(['engA', 'engB']);
  });

  it('splits screening into multiple batches when there are more than 20 papers', async () => {
    const { adapter, calls } = makeLlm();
    const many = Array.from({ length: 25 }, (_, i) => paper({ title: `논문 ${i}` }));
    const clients = [okClient('kci', many)];

    const result = await run({ llm: adapter, clients });

    expect(result.papers).toHaveLength(25);
    expect(calls.filter((c) => c.stage === 'screening')).toHaveLength(2);
  });

  it('uses the injected screening model/adapter when provided', async () => {
    const main = makeLlm();
    const screening = makeLlm();
    const clients = [okClient('kci', [paper({ title: '논문' })])];

    await run({
      llm: main.adapter,
      screeningLlm: screening.adapter,
      screeningModel: 'light-model',
      clients,
    });

    const screeningCalls = screening.calls.filter((c) => c.stage === 'screening');
    expect(screeningCalls).toHaveLength(1);
    // Screening ran on the injected adapter, not the main one.
    expect(main.calls.some((c) => c.stage === 'screening')).toBe(false);
  });
});

describe('dedupePapers', () => {
  it('keeps the first occurrence and drops normalized-title duplicates', () => {
    const input = [
      paper({ title: 'A B C' }),
      paper({ title: 'a, b. c!' }),
      paper({ title: '다른 논문' }),
    ];

    const result = dedupePapers(input);

    expect(result).toHaveLength(2);
    expect(result[0]?.title).toBe('A B C');
    expect(result[1]?.title).toBe('다른 논문');
  });
});
