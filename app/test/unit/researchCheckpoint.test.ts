import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AcademicSource, PaperMetadata } from '../../src/core/academic-api/types';
import {
  CHECKPOINT_SCHEMA_VERSION,
  clearCheckpoint,
  loadCheckpoint,
  saveCheckpoint,
} from '../../src/core/research-pipeline/checkpoint';
import type { CheckpointData } from '../../src/core/research-pipeline/checkpoint';

function paper(title: string, source: AcademicSource = 'kci'): PaperMetadata {
  return {
    source,
    externalId: `id-${title}`,
    title,
    authors: ['홍길동'],
    year: 2024,
    abstract: '테스트 초록입니다.',
    venue: null,
    url: 'https://example.com/paper',
    citationCount: null,
  };
}

function baseData(overrides: Partial<CheckpointData> = {}): CheckpointData {
  return {
    question: '메타인지 학습에 대한 선행연구가 있어?',
    queries: { ko: ['국문검색어'], en: ['english term'] },
    papers: [paper('논문 A')],
    failedSources: [],
    completedStage: 'searching',
    ...overrides,
  };
}

describe('research-pipeline checkpoint', () => {
  let workDir: string;
  let file: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'tsa-checkpoint-test-'));
    file = join(workDir, 'projects', 'p1', 'research-checkpoint.json');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  describe('loadCheckpoint()', () => {
    it('returns null when the file does not exist', () => {
      expect(loadCheckpoint(file)).toBeNull();
    });

    it('round-trips a saved "searching"-stage checkpoint', () => {
      const data = baseData();
      saveCheckpoint(file, data);

      const loaded = loadCheckpoint(file);

      expect(loaded).not.toBeNull();
      expect(loaded?.question).toBe(data.question);
      expect(loaded?.queries).toEqual(data.queries);
      expect(loaded?.papers).toEqual(data.papers);
      expect(loaded?.completedStage).toBe('searching');
      expect(loaded?.screened).toBeUndefined();
      expect(loaded?.version).toBe(CHECKPOINT_SCHEMA_VERSION);
      expect(typeof loaded?.savedAt).toBe('string');
    });

    it('round-trips a saved "screening"-stage checkpoint including screened papers', () => {
      const data = baseData({
        completedStage: 'screening',
        screened: [{ paper: paper('논문 A'), relevance: 'high' }],
      });
      saveCheckpoint(file, data);

      const loaded = loadCheckpoint(file);

      expect(loaded?.completedStage).toBe('screening');
      expect(loaded?.screened).toEqual(data.screened);
    });

    it('writes atomically: no stray .tmp file is left behind after a save', () => {
      saveCheckpoint(file, baseData());

      expect(existsSync(file)).toBe(true);
      expect(existsSync(`${file}.tmp`)).toBe(false);
    });

    it('returns null (never throws) when the file contains invalid JSON', () => {
      mkdirSync(join(workDir, 'projects', 'p1'), { recursive: true });
      writeFileSync(file, '{ not valid json', 'utf-8');

      expect(() => loadCheckpoint(file)).not.toThrow();
      expect(loadCheckpoint(file)).toBeNull();
    });

    it('returns null when the parsed JSON is structurally malformed', () => {
      mkdirSync(join(workDir, 'projects', 'p1'), { recursive: true });
      writeFileSync(file, JSON.stringify({ foo: 'bar' }), 'utf-8');

      expect(loadCheckpoint(file)).toBeNull();
    });

    it('returns null when the schema version does not match (future/older format)', () => {
      const data = baseData();
      saveCheckpoint(file, data);
      mkdirSync(join(workDir, 'projects', 'p1'), { recursive: true });
      writeFileSync(
        file,
        JSON.stringify({ ...data, version: CHECKPOINT_SCHEMA_VERSION + 1, savedAt: new Date().toISOString() }),
        'utf-8',
      );

      expect(loadCheckpoint(file)).toBeNull();
    });
  });

  describe('clearCheckpoint()', () => {
    it('deletes an existing checkpoint file', () => {
      saveCheckpoint(file, baseData());
      expect(existsSync(file)).toBe(true);

      clearCheckpoint(file);

      expect(existsSync(file)).toBe(false);
    });

    it('is a no-op (never throws) when there is no checkpoint file to clear', () => {
      expect(() => clearCheckpoint(file)).not.toThrow();
    });
  });

  describe('saveCheckpoint()', () => {
    it('never throws even when the target directory cannot be created (invalid path)', () => {
      // NUL is invalid in a path component on both POSIX and Windows.
      const invalidFile = join(workDir, 'proj\0ect', 'research-checkpoint.json');

      expect(() => saveCheckpoint(invalidFile, baseData())).not.toThrow();
    });
  });
});
