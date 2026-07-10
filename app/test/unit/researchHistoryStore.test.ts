import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { PaperMetadata } from '../../src/core/academic-api/types';
import { ResearchHistoryStore } from '../../src/core/research-history/store';
import type { DeepResearchResult, ScreenedPaper } from '../../src/core/research-pipeline/types';

function paper(title: string): PaperMetadata {
  return {
    source: 'semanticscholar',
    externalId: `id-${title}`,
    title,
    authors: ['홍길동'],
    year: 2024,
    abstract: null,
    venue: null,
    url: `https://example.com/${title}`,
    citationCount: 0,
  };
}

function screened(title: string): ScreenedPaper {
  return { paper: paper(title), relevance: 'high' };
}

function makeResult(overrides: Partial<DeepResearchResult> = {}): DeepResearchResult {
  return {
    report: '리포트 본문 [1]',
    papers: [screened('A'), screened('B')],
    citedPapers: [screened('A')],
    relatedPapers: [screened('B')],
    queries: { ko: ['질의'], en: ['query'] },
    failedSources: [],
    usage: { calls: 3, inputTokens: 100, outputTokens: 50 },
    ...overrides,
  };
}

describe('ResearchHistoryStore', () => {
  let workDir: string;
  let researchDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'tsa-research-history-test-'));
    researchDir = join(workDir, 'projects', 'p1', 'research');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  describe('add()', () => {
    it('persists a record snapshot derived from question + DeepResearchResult', () => {
      const store = new ResearchHistoryStore(researchDir);

      const record = store.add('연구 질문 1', makeResult());

      expect(record.question).toBe('연구 질문 1');
      expect(record.report).toBe('리포트 본문 [1]');
      expect(record.citedPapers).toHaveLength(1);
      expect(record.relatedPapers).toHaveLength(1);
      expect(record.usage).toEqual({ calls: 3, inputTokens: 100, outputTokens: 50 });
      expect(existsSync(join(researchDir, `${record.id}.json`))).toBe(true);
    });

    it('leaves no stray .tmp file behind after a successful write', () => {
      const store = new ResearchHistoryStore(researchDir);

      store.add('연구 질문 1', makeResult());

      const entries = readdirSync(researchDir);
      expect(entries.some((name) => name.endsWith('.tmp'))).toBe(false);
    });
  });

  describe('listSummaries()', () => {
    it('returns an empty list when the directory does not exist yet', () => {
      const store = new ResearchHistoryStore(researchDir);

      expect(store.listSummaries()).toEqual([]);
    });

    it('returns summaries with citedCount derived from citedPapers length', () => {
      const store = new ResearchHistoryStore(researchDir);
      const record = store.add('연구 질문 1', makeResult());

      const summaries = store.listSummaries();

      expect(summaries).toEqual([
        { id: record.id, question: '연구 질문 1', ranAt: record.ranAt, citedCount: 1 },
      ]);
    });

    it('sorts summaries by ranAt descending (most recent first)', () => {
      const store = new ResearchHistoryStore(researchDir);
      const first = store.add('첫 번째', makeResult());
      // Force a distinct, later timestamp on the second record for a deterministic order.
      const second = store.add('두 번째', makeResult());
      const laterFile = join(researchDir, `${second.id}.json`);
      const laterRecord = { ...second, ranAt: new Date(Date.parse(first.ranAt) + 1000).toISOString() };
      writeFileSync(laterFile, JSON.stringify(laterRecord, null, 2), 'utf-8');

      const summaries = store.listSummaries();

      expect(summaries.map((s) => s.id)).toEqual([second.id, first.id]);
    });

    it('skips a corrupted (unparsable) file without breaking the rest of the list', () => {
      const store = new ResearchHistoryStore(researchDir);
      const valid = store.add('정상 기록', makeResult());
      mkdirSync(researchDir, { recursive: true });
      writeFileSync(join(researchDir, 'broken.json'), '{ not valid json', 'utf-8');

      const summaries = store.listSummaries();

      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.id).toBe(valid.id);
    });

    it('skips a well-formed JSON file that does not match the ResearchRecord shape', () => {
      const store = new ResearchHistoryStore(researchDir);
      const valid = store.add('정상 기록', makeResult());
      mkdirSync(researchDir, { recursive: true });
      writeFileSync(join(researchDir, 'malformed.json'), JSON.stringify({ hello: 'world' }), 'utf-8');

      const summaries = store.listSummaries();

      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.id).toBe(valid.id);
    });
  });

  describe('get()', () => {
    it('returns the full record by id', () => {
      const store = new ResearchHistoryStore(researchDir);
      const record = store.add('연구 질문 1', makeResult());

      const loaded = store.get(record.id);

      expect(loaded).toEqual(record);
    });

    it('returns undefined for an unknown id', () => {
      const store = new ResearchHistoryStore(researchDir);
      store.add('연구 질문 1', makeResult());

      expect(store.get('00000000-0000-0000-0000-000000000000')).toBeUndefined();
    });

    it('returns undefined for a corrupted record file rather than throwing', () => {
      const store = new ResearchHistoryStore(researchDir);
      mkdirSync(researchDir, { recursive: true });
      const brokenId = '11111111-1111-1111-1111-111111111111';
      writeFileSync(join(researchDir, `${brokenId}.json`), '{ not valid json', 'utf-8');

      expect(() => store.get(brokenId)).not.toThrow();
      expect(store.get(brokenId)).toBeUndefined();
    });
  });

  describe('remove()', () => {
    it('deletes an existing record and returns true', () => {
      const store = new ResearchHistoryStore(researchDir);
      const record = store.add('연구 질문 1', makeResult());

      const removed = store.remove(record.id);

      expect(removed).toBe(true);
      expect(store.get(record.id)).toBeUndefined();
      expect(store.listSummaries()).toEqual([]);
    });

    it('returns false for an unknown id', () => {
      const store = new ResearchHistoryStore(researchDir);

      expect(store.remove('missing-id')).toBe(false);
    });
  });

  describe('50-record cap', () => {
    it('auto-prunes the oldest record once a 51st record is added', () => {
      mkdirSync(researchDir, { recursive: true });
      const store = new ResearchHistoryStore(researchDir);

      // Seed 50 records directly on disk with fixed, strictly increasing
      // past timestamps — deterministic regardless of the host system clock,
      // since any real add() below will always be "now" (far later than 2020).
      const seededIds: string[] = [];
      for (let i = 0; i < 50; i += 1) {
        const id = randomUUID();
        const record = {
          schemaVersion: 1,
          id,
          question: `씨앗 질문 ${i}`,
          ranAt: new Date(Date.UTC(2020, 0, 1, 0, 0, i)).toISOString(),
          report: '리포트',
          citedPapers: [],
          relatedPapers: [],
          failedSources: [],
          usage: { calls: 0, inputTokens: 0, outputTokens: 0 },
        };
        writeFileSync(join(researchDir, `${id}.json`), JSON.stringify(record, null, 2), 'utf-8');
        seededIds.push(id);
      }

      // This 51st add carries the real "now" timestamp, which is always
      // later than the seeded 2020 dates, and pushes the store past the cap.
      const newest = store.add('새 질문', makeResult());

      const summaries = store.listSummaries();

      expect(summaries).toHaveLength(50);
      // The oldest seeded record (index 0, earliest timestamp) must have been pruned.
      expect(summaries.some((s) => s.id === seededIds[0])).toBe(false);
      expect(store.get(seededIds[0]!)).toBeUndefined();
      // The newest record must survive the prune.
      expect(summaries.some((s) => s.id === newest.id)).toBe(true);
    });
  });
});
