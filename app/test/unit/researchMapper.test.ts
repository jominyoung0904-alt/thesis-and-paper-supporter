import { describe, expect, it } from 'vitest';

import type { PaperMetadata } from '../../src/core/academic-api/types';
import { mapDeepResearchResult } from '../../src/main/ipc/researchMapper';
import { createUsage } from '../../src/core/research-pipeline/types';
import type { DeepResearchResult } from '../../src/core/research-pipeline/types';

function paper(overrides: Partial<PaperMetadata> & { title: string }): PaperMetadata {
  return {
    source: 'kci',
    externalId: `id-${overrides.title}`,
    authors: ['홍길동'],
    year: 2024,
    abstract: null,
    venue: null,
    url: 'https://example.com/paper',
    citationCount: null,
    ...overrides,
  };
}

function result(overrides: Partial<DeepResearchResult> = {}): DeepResearchResult {
  return {
    report: '리포트 본문',
    papers: [],
    citedPapers: [],
    relatedPapers: [],
    queries: { ko: [], en: [] },
    failedSources: [],
    usage: createUsage(),
    ...overrides,
  };
}

describe('mapDeepResearchResult', () => {
  it('maps a screened paper into a renderer-ready payload with a Korean source label', () => {
    const mapped = mapDeepResearchResult(
      result({ papers: [{ paper: paper({ title: '논문 A', source: 'semanticscholar' }), relevance: 'high' }] }),
    );

    expect(mapped.papers).toEqual([
      {
        title: '논문 A',
        authors: ['홍길동'],
        year: 2024,
        url: 'https://example.com/paper',
        source: 'Semantic Scholar',
        // Raw metadata rides along for the library save button (FR-LIB-001) —
        // note `source` here is the raw id, not the display label above.
        metadata: paper({ title: '논문 A', source: 'semanticscholar' }),
      },
    ]);
  });

  it('maps citedPapers and relatedPapers the same way as papers, preserving array order', () => {
    const mapped = mapDeepResearchResult(
      result({
        citedPapers: [{ paper: paper({ title: '인용 논문' }), relevance: 'high' }],
        relatedPapers: [{ paper: paper({ title: '관련 논문' }), relevance: 'medium' }],
      }),
    );

    expect(mapped.citedPapers).toEqual([
      {
        title: '인용 논문',
        authors: ['홍길동'],
        year: 2024,
        url: 'https://example.com/paper',
        source: 'KCI',
        metadata: paper({ title: '인용 논문' }),
      },
    ]);
    expect(mapped.relatedPapers).toEqual([
      {
        title: '관련 논문',
        authors: ['홍길동'],
        year: 2024,
        url: 'https://example.com/paper',
        source: 'KCI',
        metadata: paper({ title: '관련 논문' }),
      },
    ]);
  });

  it('maps a failed source into Korean source + reason labels', () => {
    const mapped = mapDeepResearchResult(result({ failedSources: [{ source: 'kci', reason: 'timeout' }] }));

    expect(mapped.failedSources).toEqual([{ source: 'KCI', reason: '응답 시간 초과' }]);
  });

  it('drops usage/queries and passes the report text through unchanged', () => {
    const mapped = mapDeepResearchResult(result({ report: '## 결과\n내용' }));

    expect(mapped).toEqual({ report: '## 결과\n내용', papers: [], citedPapers: [], relatedPapers: [], failedSources: [] });
    expect(mapped).not.toHaveProperty('usage');
    expect(mapped).not.toHaveProperty('queries');
  });
});
