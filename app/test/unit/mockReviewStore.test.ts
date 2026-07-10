import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MockReviewStore } from '../../src/core/writing/mockReviewStore';
import type { MockReviewOutcome } from '../../src/core/writing/mockReview';

function makeOutcome(ok: boolean): MockReviewOutcome {
  if (!ok) return { ok: false, reason: '자동 모의 심사에 실패했어요. 다시 시도해 주세요' };
  return {
    ok: true,
    questions: [{ question: '예상 질문이에요?', basis: '근거예요.' }],
    weaknesses: [{ weakness: '약점이에요.', severity: 'major', suggestion: '제안이에요.' }],
    overallComment: '총평이에요.',
  };
}

describe('MockReviewStore', () => {
  let workDir: string;
  let reviewDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'tsa-mock-review-store-test-'));
    reviewDir = join(workDir, 'projects', 'p1', 'mock-review');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  describe('add() (FR-WRT-011)', () => {
    it('persists a new record with a generated id, ranAt timestamp, text and result', () => {
      const store = new MockReviewStore(reviewDir);

      const record = store.add('원고 본문입니다.', makeOutcome(true));

      expect(record.id).toBeTruthy();
      expect(() => new Date(record.ranAt).toISOString()).not.toThrow();
      expect(record.text).toBe('원고 본문입니다.');
      expect(record.result).toEqual(makeOutcome(true));
    });

    it('creates the mock-review directory if it does not exist yet', () => {
      expect(existsSync(reviewDir)).toBe(false);

      const store = new MockReviewStore(reviewDir);
      store.add('텍스트', makeOutcome(true));

      expect(existsSync(reviewDir)).toBe(true);
    });

    it('writes atomically, leaving no stray .tmp files behind', () => {
      const store = new MockReviewStore(reviewDir);
      store.add('텍스트', makeOutcome(true));

      const entries = readdirSync(reviewDir);
      expect(entries.some((name) => name.endsWith('.tmp'))).toBe(false);
      expect(entries.some((name) => name.endsWith('.json'))).toBe(true);
    });

    it('is durable across store instances (a fresh store reads the same directory)', () => {
      const first = new MockReviewStore(reviewDir);
      first.add('첫 번째 기록', makeOutcome(true));

      const second = new MockReviewStore(reviewDir);
      const summaries = second.listSummaries();

      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.textPreview.startsWith('첫 번째 기록')).toBe(true);
    });

    it('persists a failed (ok:false) outcome without dropping it from history', () => {
      const store = new MockReviewStore(reviewDir);
      store.add('실패한 심사', makeOutcome(false));

      const summaries = store.listSummaries();

      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.ok).toBe(false);
    });
  });

  describe('listSummaries()', () => {
    it('returns records most-recently-run first', () => {
      const store = new MockReviewStore(reviewDir);
      const first = store.add('오래된 기록', makeOutcome(true));
      const second = store.add('최신 기록', makeOutcome(true));

      const summaries = store.listSummaries();

      expect(summaries.map((s) => s.id)).toEqual([second.id, first.id]);
    });

    it('truncates textPreview to the first 60 characters', () => {
      const longText = 'a'.repeat(120);
      const store = new MockReviewStore(reviewDir);
      store.add(longText, makeOutcome(true));

      const summaries = store.listSummaries();

      expect(summaries[0]?.textPreview).toHaveLength(60);
      expect(summaries[0]?.textPreview).toBe('a'.repeat(60));
    });

    it('reflects the ok flag from the stored result', () => {
      const store = new MockReviewStore(reviewDir);
      store.add('성공 기록', makeOutcome(true));

      expect(store.listSummaries()[0]?.ok).toBe(true);
    });

    it('returns an empty array when the directory has never been created', () => {
      const store = new MockReviewStore(reviewDir);

      expect(store.listSummaries()).toEqual([]);
    });

    it('silently skips a corrupted (unparsable) record file instead of throwing', () => {
      const store = new MockReviewStore(reviewDir);
      const good = store.add('정상 기록', makeOutcome(true));
      mkdirSync(reviewDir, { recursive: true });
      writeFileSync(join(reviewDir, 'broken-record.json'), '{ not valid json', 'utf-8');

      const summaries = store.listSummaries();

      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.id).toBe(good.id);
    });

    it('silently skips a well-formed JSON file that does not match the MockReviewRecord shape', () => {
      const store = new MockReviewStore(reviewDir);
      const good = store.add('정상 기록', makeOutcome(true));
      mkdirSync(reviewDir, { recursive: true });
      writeFileSync(join(reviewDir, 'wrong-shape.json'), JSON.stringify({ hello: 'world' }), 'utf-8');

      const summaries = store.listSummaries();

      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.id).toBe(good.id);
    });
  });

  describe('get()', () => {
    it('returns the full record (including text and result) for a known id', () => {
      const store = new MockReviewStore(reviewDir);
      const created = store.add('전체 본문', makeOutcome(true));

      const found = store.get(created.id);

      expect(found).toEqual(created);
    });

    it('returns undefined for an unknown id', () => {
      const store = new MockReviewStore(reviewDir);
      store.add('텍스트', makeOutcome(true));

      expect(store.get('missing-id')).toBeUndefined();
    });

    it('returns undefined for a corrupted record file', () => {
      mkdirSync(reviewDir, { recursive: true });
      writeFileSync(join(reviewDir, 'broken.json'), '{ not valid json', 'utf-8');

      const store = new MockReviewStore(reviewDir);

      expect(store.get('broken')).toBeUndefined();
    });
  });

  describe('remove()', () => {
    it('deletes an existing record and returns true', () => {
      const store = new MockReviewStore(reviewDir);
      const created = store.add('텍스트', makeOutcome(true));

      const removed = store.remove(created.id);

      expect(removed).toBe(true);
      expect(store.get(created.id)).toBeUndefined();
      expect(store.listSummaries()).toEqual([]);
    });

    it('returns false for an unknown id', () => {
      const store = new MockReviewStore(reviewDir);

      expect(store.remove('missing-id')).toBe(false);
    });
  });

  describe('cap at 30 records', () => {
    it('auto-prunes the oldest records once more than 30 have been added', () => {
      const store = new MockReviewStore(reviewDir);
      const created = Array.from({ length: 35 }, (_, i) => store.add(`기록 ${i}`, makeOutcome(true)));

      const summaries = store.listSummaries();

      expect(summaries).toHaveLength(30);
      // The 5 oldest (first added) records must have been pruned.
      const remainingIds = new Set(summaries.map((s) => s.id));
      for (const stale of created.slice(0, 5)) {
        expect(remainingIds.has(stale.id)).toBe(false);
      }
      for (const kept of created.slice(5)) {
        expect(remainingIds.has(kept.id)).toBe(true);
      }
    });
  });
});
