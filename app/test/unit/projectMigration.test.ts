import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migrateDefaultProject } from '../../src/main/project/migration';
import { indexFilePath, resolveProjectPaths } from '../../src/main/project/projectPaths';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('migrateDefaultProject', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'tsa-project-migration-test-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  describe('branch 1: index already exists', () => {
    it('is a no-op when index.json already exists (valid content)', () => {
      const indexPath = indexFilePath(dataDir);
      mkdirSync(join(dataDir, 'projects'), { recursive: true });
      writeFileSync(indexPath, JSON.stringify({ schemaVersion: 1, activeProjectId: null, projects: [] }), 'utf-8');

      const result = migrateDefaultProject(dataDir);

      expect(result).toEqual({ migrated: false, reason: 'already-indexed' });
    });

    it('is a no-op even when index.json is corrupted (presence-only check)', () => {
      const indexPath = indexFilePath(dataDir);
      mkdirSync(join(dataDir, 'projects'), { recursive: true });
      writeFileSync(indexPath, '{ not valid json', 'utf-8');

      const result = migrateDefaultProject(dataDir);

      expect(result).toEqual({ migrated: false, reason: 'already-indexed' });
    });
  });

  describe('branch 3: brand-new user (no index, no default dir)', () => {
    it('creates an empty index with a single "내 연구 1" project', () => {
      const result = migrateDefaultProject(dataDir);

      expect(result.migrated).toBe(true);
      expect(result.fresh).toBe(true);
      expect(result.project?.name).toBe('내 연구 1');
      expect(result.project?.archived).toBe(false);
    });

    it('persists the index to disk with the active project set', () => {
      const result = migrateDefaultProject(dataDir);

      const indexPath = indexFilePath(dataDir);
      const saved = JSON.parse(readFileSync(indexPath, 'utf-8'));
      expect(saved.activeProjectId).toBe(result.project?.id);
      expect(saved.projects).toHaveLength(1);
    });

    it('is idempotent: a second call reports already-indexed and adds no project', () => {
      migrateDefaultProject(dataDir);

      const second = migrateDefaultProject(dataDir);

      expect(second).toEqual({ migrated: false, reason: 'already-indexed' });
      const saved = JSON.parse(readFileSync(indexFilePath(dataDir), 'utf-8'));
      expect(saved.projects).toHaveLength(1);
    });
  });

  describe('branch 2: Sprint 1 user (default/ exists, no index)', () => {
    function seedDefaultProject(): string {
      const defaultPaths = resolveProjectPaths(dataDir, 'default');
      mkdirSync(defaultPaths.root, { recursive: true });
      writeFileSync(defaultPaths.memoryFile, JSON.stringify({ researchQuestion: 'Sprint 1 데이터' }), 'utf-8');
      return defaultPaths.root;
    }

    it('absorbs default/ into a newly minted UUID project (rename succeeds)', () => {
      seedDefaultProject();

      const result = migrateDefaultProject(dataDir);

      expect(result.migrated).toBe(true);
      expect(result.fresh).toBeUndefined();
      expect(result.project?.name).toBe('내 연구 1');
      expect(result.project?.id).toMatch(UUID_PATTERN);
    });

    it('moves the directory to data/projects/{uuid} and preserves the file contents', () => {
      seedDefaultProject();

      const result = migrateDefaultProject(dataDir);

      const newPaths = resolveProjectPaths(dataDir, result.project!.id);
      expect(existsSync(resolveProjectPaths(dataDir, 'default').root)).toBe(false);
      expect(existsSync(newPaths.root)).toBe(true);
      const content = JSON.parse(readFileSync(newPaths.memoryFile, 'utf-8'));
      expect(content.researchQuestion).toBe('Sprint 1 데이터');
    });

    it('writes the index with activeProjectId matching the new project id', () => {
      seedDefaultProject();

      const result = migrateDefaultProject(dataDir);

      const saved = JSON.parse(readFileSync(indexFilePath(dataDir), 'utf-8'));
      expect(saved.activeProjectId).toBe(result.project?.id);
      expect(saved.projects[0].id).toBe(result.project?.id);
    });

    it('falls back to the literal "default" id when the rename fails', () => {
      seedDefaultProject();

      const result = migrateDefaultProject(dataDir, {
        renameSync: () => {
          throw new Error('EBUSY: file is locked');
        },
      });

      expect(result.migrated).toBe(true);
      expect(result.project?.id).toBe('default');
      expect(result.project?.name).toBe('내 연구 1');
    });

    it('leaves the default/ directory untouched on the rename-fallback path', () => {
      const defaultRoot = seedDefaultProject();

      migrateDefaultProject(dataDir, {
        renameSync: () => {
          throw new Error('EBUSY: file is locked');
        },
      });

      expect(existsSync(defaultRoot)).toBe(true);
      expect(existsSync(join(defaultRoot, 'memory.json'))).toBe(true);
    });

    it('writes an index recording the "default" id when the rename fallback is used', () => {
      seedDefaultProject();

      migrateDefaultProject(dataDir, {
        renameSync: () => {
          throw new Error('EBUSY: file is locked');
        },
      });

      const saved = JSON.parse(readFileSync(indexFilePath(dataDir), 'utf-8'));
      expect(saved.activeProjectId).toBe('default');
      expect(saved.projects[0].id).toBe('default');
    });

    it('is idempotent: a second call after absorption reports already-indexed', () => {
      seedDefaultProject();
      migrateDefaultProject(dataDir);

      const second = migrateDefaultProject(dataDir);

      expect(second).toEqual({ migrated: false, reason: 'already-indexed' });
    });

    it('leaves no stray .tmp file behind after the index write', () => {
      seedDefaultProject();

      migrateDefaultProject(dataDir);

      const entries = readdirSync(join(dataDir, 'projects'));
      expect(entries.some((name) => name.endsWith('.tmp'))).toBe(false);
    });
  });

  describe('error handling (NFR-OPS-003: 실패=결과값)', () => {
    it('never throws and returns an error result with a Korean user message', () => {
      const result = migrateDefaultProject(dataDir, {
        existsSync: () => {
          throw new Error('unexpected fs failure');
        },
      });

      expect(result).toEqual({
        migrated: false,
        reason: 'error',
        userMessage: expect.any(String),
      });
      expect(result.userMessage?.length).toBeGreaterThan(0);
    });
  });
});
