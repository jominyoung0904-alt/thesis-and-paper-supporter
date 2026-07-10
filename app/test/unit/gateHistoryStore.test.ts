import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GateHistoryStore } from '../../src/core/writing/gateHistoryStore';
import type { GateResult } from '../../src/core/writing/qualityGate';

function makeResult(passed: boolean): GateResult {
  return {
    sectionId: 'introduction',
    passed,
    results: [{ criterionId: 'research-gap', passed, feedback: passed ? '충족했어요.' : '미흡해요.' }],
    summary: passed ? '모두 충족했어요.' : '일부 미흡해요.',
  };
}

describe('GateHistoryStore', () => {
  let workDir: string;
  let gateDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'tsa-gate-history-test-'));
    gateDir = join(workDir, 'projects', 'p1', 'gate');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  describe('add() (FR-WRT-008)', () => {
    it('persists a new record with a generated id, ranAt timestamp, text and result', () => {
      const store = new GateHistoryStore(gateDir);

      const record = store.add('introduction', '서론 본문입니다.', makeResult(true));

      expect(record.id).toBeTruthy();
      expect(record.sectionId).toBe('introduction');
      expect(() => new Date(record.ranAt).toISOString()).not.toThrow();
      expect(record.text).toBe('서론 본문입니다.');
      expect(record.result).toEqual(makeResult(true));
    });

    it('creates the gate directory if it does not exist yet', () => {
      expect(existsSync(gateDir)).toBe(false);

      const store = new GateHistoryStore(gateDir);
      store.add('introduction', '텍스트', makeResult(true));

      expect(existsSync(gateDir)).toBe(true);
    });

    it('writes atomically, leaving no stray .tmp files behind', () => {
      const store = new GateHistoryStore(gateDir);
      store.add('introduction', '텍스트', makeResult(true));

      const entries = readdirSync(gateDir);
      expect(entries.some((name) => name.endsWith('.tmp'))).toBe(false);
      expect(entries.some((name) => name.endsWith('.json'))).toBe(true);
    });

    it('is durable across store instances (a fresh store reads the same directory)', () => {
      const first = new GateHistoryStore(gateDir);
      first.add('introduction', '첫 번째 기록', makeResult(true));

      const second = new GateHistoryStore(gateDir);
      const summaries = second.listSummaries();

      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.textPreview.startsWith('첫 번째 기록')).toBe(true);
    });
  });

  describe('listSummaries() (FR-WRT-009)', () => {
    it('returns records most-recently-run first', () => {
      const store = new GateHistoryStore(gateDir);
      const first = store.add('introduction', '오래된 기록', makeResult(true));
      const second = store.add('introduction', '최신 기록', makeResult(false));

      const summaries = store.listSummaries();

      expect(summaries.map((s) => s.id)).toEqual([second.id, first.id]);
    });

    it('truncates textPreview to the first 60 characters', () => {
      const longText = 'a'.repeat(120);
      const store = new GateHistoryStore(gateDir);
      store.add('introduction', longText, makeResult(true));

      const summaries = store.listSummaries();

      expect(summaries[0]?.textPreview).toHaveLength(60);
      expect(summaries[0]?.textPreview).toBe('a'.repeat(60));
    });

    it('reflects the passed flag from the stored GateResult', () => {
      const store = new GateHistoryStore(gateDir);
      store.add('introduction', '실패 기록', makeResult(false));

      expect(store.listSummaries()[0]?.passed).toBe(false);
    });

    it('returns an empty array when the directory has never been created', () => {
      const store = new GateHistoryStore(gateDir);

      expect(store.listSummaries()).toEqual([]);
    });

    it('silently skips a corrupted (unparsable) record file instead of throwing', () => {
      const store = new GateHistoryStore(gateDir);
      const good = store.add('introduction', '정상 기록', makeResult(true));
      mkdirSync(gateDir, { recursive: true });
      writeFileSync(join(gateDir, 'broken-record.json'), '{ not valid json', 'utf-8');

      const summaries = store.listSummaries();

      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.id).toBe(good.id);
    });

    it('silently skips a well-formed JSON file that does not match the GateRecord shape', () => {
      const store = new GateHistoryStore(gateDir);
      const good = store.add('introduction', '정상 기록', makeResult(true));
      mkdirSync(gateDir, { recursive: true });
      writeFileSync(join(gateDir, 'wrong-shape.json'), JSON.stringify({ hello: 'world' }), 'utf-8');

      const summaries = store.listSummaries();

      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.id).toBe(good.id);
    });
  });

  describe('get()', () => {
    it('returns the full record (including text and result) for a known id', () => {
      const store = new GateHistoryStore(gateDir);
      const created = store.add('introduction', '전체 본문', makeResult(true));

      const found = store.get(created.id);

      expect(found).toEqual(created);
    });

    it('returns undefined for an unknown id', () => {
      const store = new GateHistoryStore(gateDir);
      store.add('introduction', '텍스트', makeResult(true));

      expect(store.get('missing-id')).toBeUndefined();
    });

    it('returns undefined for a corrupted record file', () => {
      mkdirSync(gateDir, { recursive: true });
      writeFileSync(join(gateDir, 'broken.json'), '{ not valid json', 'utf-8');

      const store = new GateHistoryStore(gateDir);

      expect(store.get('broken')).toBeUndefined();
    });
  });

  describe('remove()', () => {
    it('deletes an existing record and returns true', () => {
      const store = new GateHistoryStore(gateDir);
      const created = store.add('introduction', '텍스트', makeResult(true));

      const removed = store.remove(created.id);

      expect(removed).toBe(true);
      expect(store.get(created.id)).toBeUndefined();
      expect(store.listSummaries()).toEqual([]);
    });

    it('returns false for an unknown id', () => {
      const store = new GateHistoryStore(gateDir);

      expect(store.remove('missing-id')).toBe(false);
    });
  });

  describe('cap at 30 records', () => {
    it('auto-prunes the oldest records once more than 30 have been added', () => {
      const store = new GateHistoryStore(gateDir);
      const created = Array.from({ length: 35 }, (_, i) => store.add('introduction', `기록 ${i}`, makeResult(true)));

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
