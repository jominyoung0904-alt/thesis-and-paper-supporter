import { describe, expect, it } from 'vitest';

import { assembleReport } from '../../src/core/research-pipeline/report';
import type { AcademicSource, PaperMetadata } from '../../src/core/academic-api/types';
import type { LlmAdapter, LlmRequest } from '../../src/core/llm';
import type { SerializedMemory } from '../../src/core/memory/serializer';
import { createUsage } from '../../src/core/research-pipeline/types';
import type { ScreenedPaper } from '../../src/core/research-pipeline/types';

const MEMORY: SerializedMemory = { text: '', isEmpty: true, approxTokens: 0 };

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

function fixedLlm(text = '요약입니다 [1].'): LlmAdapter {
  return {
    provider: 'gemini',
    async chat(_req: LlmRequest) {
      return { text, usage: { inputTokens: 1, outputTokens: 1 }, model: 'm' };
    },
  };
}

describe('assembleReport — RISS deep-link fallback (SPEC-TSA-001 후속 T33)', () => {
  it('appends a RISS deep link when naverdoc did not participate in the run', async () => {
    const screened: ScreenedPaper[] = [{ paper: paper({ title: '논문' }), relevance: 'high' }];
    const participatingSources: AcademicSource[] = ['kci', 'semanticscholar'];

    const { report } = await assembleReport(
      'q',
      screened,
      [],
      MEMORY,
      fixedLlm(),
      'm',
      createUsage(),
      participatingSources,
      '국문검색어',
    );

    expect(report).toContain('RISS에서 직접 검색해 보실 수 있어요');
    expect(report).toContain('https://www.riss.kr/search/Search.do?queryText=&query=');
    expect(report).toContain(encodeURIComponent('국문검색어'));
  });

  it('omits the RISS deep link when naverdoc did participate in the run', async () => {
    const screened: ScreenedPaper[] = [{ paper: paper({ title: '논문' }), relevance: 'high' }];
    const participatingSources: AcademicSource[] = ['kci', 'naverdoc'];

    const { report } = await assembleReport(
      'q',
      screened,
      [],
      MEMORY,
      fixedLlm(),
      'm',
      createUsage(),
      participatingSources,
      '국문검색어',
    );

    expect(report).not.toContain('RISS에서 직접 검색해 보실 수 있어요');
  });

  it('omits the RISS deep link when the first Korean query term is empty', async () => {
    const screened: ScreenedPaper[] = [{ paper: paper({ title: '논문' }), relevance: 'high' }];

    const { report } = await assembleReport('q', screened, [], MEMORY, fixedLlm(), 'm', createUsage(), ['kci'], '   ');

    expect(report).not.toContain('RISS에서 직접 검색해 보실 수 있어요');
  });

  it('still appends the RISS deep link on the "no papers found" branch when naverdoc did not participate', async () => {
    const { report } = await assembleReport('q', [], [], MEMORY, fixedLlm(), 'm', createUsage(), ['kci'], '국문검색어');

    expect(report).toContain('문헌을 찾지 못했습니다'); // sanity: still the no-papers branch
    expect(report).toContain('RISS에서 직접 검색해 보실 수 있어요');
  });
});

describe('assembleReport — structured citedPapers/relatedPapers (실사용 피드백 #5/#6)', () => {
  it('no longer emits a "## 참고문헌" text section in the report body', async () => {
    const screened: ScreenedPaper[] = [{ paper: paper({ title: '논문' }), relevance: 'high' }];

    const { report } = await assembleReport('q', screened, [], MEMORY, fixedLlm(), 'm', createUsage(), ['kci'], 'q');

    expect(report).not.toContain('## 참고문헌');
  });

  it('returns an empty citedPapers/relatedPapers pair on the "no papers found" branch', async () => {
    const result = await assembleReport('q', [], [], MEMORY, fixedLlm(), 'm', createUsage(), ['kci'], 'q');

    expect(result.citedPapers).toEqual([]);
    expect(result.relatedPapers).toEqual([]);
  });

  it('citedPapers is empty and relatedPapers holds every medium paper when nothing gets cited', async () => {
    const screened: ScreenedPaper[] = [
      { paper: paper({ title: '중간1' }), relevance: 'medium' },
      { paper: paper({ title: '중간2' }), relevance: 'medium' },
    ];
    const llm = fixedLlm('아무 인용도 하지 않은 요약입니다.');

    const result = await assembleReport('q', screened, [], MEMORY, llm, 'm', createUsage(), ['kci'], 'q');

    expect(result.citedPapers).toEqual([]);
    expect(result.relatedPapers).toHaveLength(2);
  });
});
