/**
 * T29 (SPEC-TSA-001, Wave 5) — first-run E2E, part 3: the S2 free-mode deep
 * research journey, assembled from real production modules — the actual
 * `KciClient`/`ScienceOnClient`/`SemanticScholarClient` classes (in
 * `mockMode: true`, so zero network calls) plus the real
 * `withRateLimit`/`runDeepResearch` — with only the LLM adapter's `chat()`
 * scripted. No `electron` import is involved here, so no `vi.mock` is needed.
 */

import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { AcademicClient } from '../../src/core/academic-api/types';
import { KciClient } from '../../src/core/academic-api/kciClient';
import { KCI_MOCK_PAPERS, SCIENCEON_MOCK_PAPERS, SEMANTIC_SCHOLAR_MOCK_PAPERS } from '../../src/core/academic-api/mockData';
import { ScienceOnClient } from '../../src/core/academic-api/scienceOnClient';
import { SemanticScholarClient } from '../../src/core/academic-api/semanticScholarClient';
import type { LlmAdapter, LlmRequest } from '../../src/core/llm';
import { withRateLimit } from '../../src/core/llm/rateLimiter';
import { MemoryStore } from '../../src/core/memory/store';
import { serializeMemoryForPrompt, type SerializedMemory } from '../../src/core/memory/serializer';
import { runDeepResearch } from '../../src/core/research-pipeline/pipeline';
import { ACCESS_GUIDANCE } from '../../src/core/research-pipeline/report';
import { createReadyWorkspace, type TempWorkspace } from './firstRunHelpers';

/** Matches the exact task-instruction substrings queryGen.ts/screening.ts/report.ts embed in their system prompts. */
function stageOf(system: string): 'query-gen' | 'screening' | 'report' | 'unknown' {
  if (system.includes('검색어로 변환')) return 'query-gen';
  if (system.includes('관련도는 high')) return 'screening';
  if (system.includes('종합 리포트')) return 'report';
  return 'unknown';
}

/** A minimal, deterministic LLM that answers every pipeline stage without any network I/O. */
function makeResearchLlm(): { adapter: LlmAdapter; calls: Array<{ stage: string }> } {
  const calls: Array<{ stage: string }> = [];
  const adapter: LlmAdapter = {
    provider: 'gemini',
    async chat(req: LlmRequest) {
      const stage = stageOf(req.system ?? '');
      calls.push({ stage });

      let text = '';
      if (stage === 'query-gen') {
        text = JSON.stringify({
          ko: ['대학생 SNS 중독', 'SNS 과의존 실태'],
          en: ['social media addiction', 'college students'],
        });
      } else if (stage === 'screening') {
        const count = (req.messages[0]?.content.match(/^\d+\. /gm) ?? []).length;
        text = JSON.stringify(Array.from({ length: count }, (_, i) => ({ index: i + 1, relevance: 'high' })));
      } else if (stage === 'report') {
        text = 'SNS 이용과 중독 경향 사이의 관계를 다룬 선행연구를 종합하면 다음과 같다 [1][2][3].';
      }
      return { text, usage: { inputTokens: 20, outputTokens: 10 }, model: req.model };
    },
  };
  return { adapter, calls };
}

function mockClients(): AcademicClient[] {
  return [
    new KciClient({ baseUrl: 'https://kci.example.test', mockMode: true }),
    new ScienceOnClient({ baseUrl: 'https://scienceon.example.test', mockMode: true }),
    new SemanticScholarClient({ baseUrl: 'https://s2.example.test', mockMode: true }),
  ];
}

describe('S2 — 무료 모드 딥리서치 완주 (rate-limited mock adapter + 3종 mock 학술 클라이언트)', () => {
  let ws: TempWorkspace | undefined;

  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  it('generates queries, screens, and assembles a report whose references match PaperMetadata 1:1', async () => {
    ws = createReadyWorkspace('tsa-e2e-s2-');
    const memoryStore = new MemoryStore(join(ws.paths.dataDir, 'projects', 'default', 'memory.json'));
    memoryStore.load();
    memoryStore.addResearchQuestion({ text: '국내 대학생 SNS 중독 관련 연구 있어?' });
    const memory: SerializedMemory = serializeMemoryForPrompt(memoryStore.getSnapshot());

    const { adapter: rawAdapter, calls } = makeResearchLlm();
    // "RPM 충분히 크게": the free-tier limiter must never throttle a single run.
    const adapter = withRateLimit(rawAdapter, { requestsPerMinute: 1000 });
    const stages: string[] = [];

    const result = await runDeepResearch({
      question: '국내 대학생 SNS 중독 관련 연구 있어?',
      memory,
      llm: adapter,
      clients: mockClients(),
      model: 'gemini-2.5-flash',
      onProgress: (event) => stages.push(event.stage),
    });

    expect(stages).toEqual(['query-gen', 'searching', 'screening', 'report']);
    expect(result.failedSources).toEqual([]);
    expect(result.papers.length).toBeGreaterThan(0);

    const allMockPapers = [...KCI_MOCK_PAPERS, ...SCIENCEON_MOCK_PAPERS, ...SEMANTIC_SCHOLAR_MOCK_PAPERS];
    for (const screened of result.papers) {
      const source = allMockPapers.find((p) => p.externalId === screened.paper.externalId);
      expect(source, `no PaperMetadata fixture matches externalId ${screened.paper.externalId}`).toBeDefined();
      expect(screened.paper.title).toBe(source?.title);
      expect(screened.paper.authors).toEqual(source?.authors);
    }

    expect(result.report).toContain('## 참고문헌');
    expect(result.report).toContain(ACCESS_GUIDANCE);
    expect(result.usage.calls).toBe(calls.length);
    expect(result.usage.calls).toBeGreaterThan(0);
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
  });

  it('reports a failed KCI source transparently while keeping ScienceON + Semantic Scholar results (FR-RES-009)', async () => {
    const memory: SerializedMemory = { text: '## 프로젝트 개요\n제목: 테스트 프로젝트', isEmpty: true, approxTokens: 8 };
    const { adapter: rawAdapter } = makeResearchLlm();
    const adapter = withRateLimit(rawAdapter, { requestsPerMinute: 1000 });

    const failingKci: AcademicClient = {
      source: 'kci',
      async search() {
        return { ok: false, reason: 'network' };
      },
    };
    const clients: AcademicClient[] = [
      failingKci,
      new ScienceOnClient({ baseUrl: 'https://scienceon.example.test', mockMode: true }),
      new SemanticScholarClient({ baseUrl: 'https://s2.example.test', mockMode: true }),
    ];

    const result = await runDeepResearch({
      question: '국내 대학생 SNS 중독 관련 연구 있어?',
      memory,
      llm: adapter,
      clients,
      model: 'gemini-2.5-flash',
    });

    expect(result.failedSources).toEqual([{ source: 'kci', reason: 'network' }]);
    expect(result.papers.length).toBeGreaterThan(0);
    expect(result.papers.every((p) => p.paper.source !== 'kci')).toBe(true);
    expect(result.papers.some((p) => p.paper.source === 'scienceon')).toBe(true);
    expect(result.papers.some((p) => p.paper.source === 'semanticscholar')).toBe(true);
    expect(result.report).toContain('KCI');
    expect(result.report).toContain('네트워크 오류');
  });
});
