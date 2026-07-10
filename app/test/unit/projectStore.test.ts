import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ProjectValidationError } from '../../src/core/project/model';
import { ProjectIndexStore } from '../../src/core/project/projectStore';

describe('ProjectIndexStore', () => {
  let workDir: string;
  let indexFile: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'tsa-project-index-test-'));
    indexFile = join(workDir, 'projects', 'index.json');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  describe('load()', () => {
    it('returns "created" and starts with an empty index when the file does not exist', () => {
      const store = new ProjectIndexStore(indexFile);

      const result = store.load();

      expect(result.status).toBe('created');
      expect(store.list()).toEqual([]);
      expect(store.getActive()).toBeUndefined();
    });

    it('returns "loaded" and restores previously saved data on a fresh instance', () => {
      const first = new ProjectIndexStore(indexFile);
      first.load();
      first.create('첫 프로젝트');
      first.save();

      const second = new ProjectIndexStore(indexFile);
      const result = second.load();

      expect(result.status).toBe('loaded');
      expect(second.list()).toHaveLength(1);
      expect(second.list()[0]?.name).toBe('첫 프로젝트');
    });

    it('recovers from an unparsable (invalid JSON) file, preserving it as .bak', () => {
      mkdirSync(dirname(indexFile), { recursive: true });
      writeFileSync(indexFile, '{ not valid json', 'utf-8');

      const store = new ProjectIndexStore(indexFile);
      const result = store.load();

      expect(result.status).toBe('recovered');
      expect(result.backupPath).toBe(`${indexFile}.bak`);
      expect(existsSync(`${indexFile}.bak`)).toBe(true);
      expect(readFileSync(`${indexFile}.bak`, 'utf-8')).toBe('{ not valid json');
      expect(store.list()).toEqual([]);
    });

    it('recovers from a well-formed JSON file that does not match the ProjectIndex shape', () => {
      mkdirSync(dirname(indexFile), { recursive: true });
      writeFileSync(indexFile, JSON.stringify({ hello: 'world' }), 'utf-8');

      const store = new ProjectIndexStore(indexFile);
      const result = store.load();

      expect(result.status).toBe('recovered');
      expect(existsSync(`${indexFile}.bak`)).toBe(true);
      expect(store.list()).toEqual([]);
    });
  });

  describe('save()', () => {
    it('writes indented (2-space) JSON and leaves no stray temp file behind', () => {
      const store = new ProjectIndexStore(indexFile);
      store.load();
      store.create('프로젝트 A');

      store.save();

      const raw = readFileSync(indexFile, 'utf-8');
      expect(raw).toContain('\n  "schemaVersion"');
      const dirEntries = readdirSync(dirname(indexFile));
      expect(dirEntries.some((name) => name.endsWith('.tmp'))).toBe(false);
    });

    it('overwrites the existing file atomically on repeated saves', () => {
      const store = new ProjectIndexStore(indexFile);
      store.load();
      store.create('프로젝트 A');
      store.save();

      store.create('프로젝트 B');
      store.save();

      const reloaded = new ProjectIndexStore(indexFile);
      reloaded.load();
      expect(reloaded.list()).toHaveLength(2);
    });
  });

  describe('create() (FR-PRJ-001)', () => {
    it('generates default names "내 연구 1", "내 연구 2" when no name is given', () => {
      const store = new ProjectIndexStore(indexFile);
      store.load();

      const first = store.create();
      const second = store.create();

      expect(first.name).toBe('내 연구 1');
      expect(second.name).toBe('내 연구 2');
    });

    it('resumes default numbering after an archived project so numbers never collide', () => {
      const store = new ProjectIndexStore(indexFile);
      store.load();
      const first = store.create();
      store.archive(first.id);

      const third = store.create();

      expect(third.name).toBe('내 연구 2');
    });

    it('immediately switches the active project to the newly created one (S1)', () => {
      const store = new ProjectIndexStore(indexFile);
      store.load();
      store.create('프로젝트 A');

      const secondProject = store.create('프로젝트 B');

      expect(store.getActive()?.id).toBe(secondProject.id);
    });

    it('uses a custom name when provided', () => {
      const store = new ProjectIndexStore(indexFile);
      store.load();

      const project = store.create('2주차 논문');

      expect(project.name).toBe('2주차 논문');
    });
  });

  describe('rename() (FR-PRJ-004)', () => {
    it('renames an existing project without changing its id', () => {
      const store = new ProjectIndexStore(indexFile);
      store.load();
      const project = store.create('원래 이름');

      const renamed = store.rename(project.id, '졸업논문(최종)');

      expect(renamed?.name).toBe('졸업논문(최종)');
      expect(renamed?.id).toBe(project.id);
    });

    it('returns undefined for an unknown id', () => {
      const store = new ProjectIndexStore(indexFile);
      store.load();

      expect(store.rename('missing-id', '새 이름')).toBeUndefined();
    });

    it('rejects a blank (whitespace-only) name', () => {
      const store = new ProjectIndexStore(indexFile);
      store.load();
      const project = store.create('원래 이름');

      expect(() => store.rename(project.id, '   ')).toThrow(ProjectValidationError);
    });
  });

  describe('archive() (FR-PRJ-005)', () => {
    it('marks a project archived and excludes it from the default list', () => {
      const store = new ProjectIndexStore(indexFile);
      store.load();
      store.create('프로젝트 A');
      const projectB = store.create('프로젝트 B');

      const result = store.archive(projectB.id);

      expect(result).toEqual({ ok: true, project: expect.objectContaining({ archived: true }) });
      expect(store.list().some((p) => p.id === projectB.id)).toBe(false);
      expect(store.list({ includeArchived: true }).some((p) => p.id === projectB.id)).toBe(true);
    });

    it('rejects archiving the last remaining non-archived project', () => {
      const store = new ProjectIndexStore(indexFile);
      store.load();
      const only = store.create('유일한 프로젝트');

      const result = store.archive(only.id);

      expect(result).toEqual({ ok: false, reason: 'last_active_project' });
      expect(store.list()).toHaveLength(1);
    });

    it('returns not_found for an unknown id', () => {
      const store = new ProjectIndexStore(indexFile);
      store.load();
      store.create('프로젝트 A');

      expect(store.archive('missing-id')).toEqual({ ok: false, reason: 'not_found' });
    });

    it('reassigns the active project when the archived one was active', () => {
      const store = new ProjectIndexStore(indexFile);
      store.load();
      const projectA = store.create('프로젝트 A');
      store.create('프로젝트 B');
      store.setActive(projectA.id);

      store.archive(projectA.id);

      expect(store.getActive()?.id).not.toBe(projectA.id);
      expect(store.getActive()).toBeDefined();
    });
  });

  describe('setActive() (FR-PRJ-002)', () => {
    it('switches the active project to an existing, non-archived project', () => {
      const store = new ProjectIndexStore(indexFile);
      store.load();
      const projectA = store.create('프로젝트 A');
      store.create('프로젝트 B');

      const result = store.setActive(projectA.id);

      expect(result).toEqual({ ok: true, project: projectA });
      expect(store.getActive()?.id).toBe(projectA.id);
    });

    it('rejects switching to an unknown id', () => {
      const store = new ProjectIndexStore(indexFile);
      store.load();
      store.create('프로젝트 A');

      expect(store.setActive('missing-id')).toEqual({ ok: false, reason: 'not_found' });
    });

    it('rejects switching to an archived project', () => {
      const store = new ProjectIndexStore(indexFile);
      store.load();
      const projectA = store.create('프로젝트 A');
      store.create('프로젝트 B');
      store.archive(projectA.id);

      expect(store.setActive(projectA.id)).toEqual({ ok: false, reason: 'archived' });
    });
  });

  describe('list() archived filter', () => {
    it('excludes archived projects by default and includes them with includeArchived', () => {
      const store = new ProjectIndexStore(indexFile);
      store.load();
      store.create('프로젝트 A');
      const projectB = store.create('프로젝트 B');
      store.create('프로젝트 C');
      store.archive(projectB.id);

      expect(store.list()).toHaveLength(2);
      expect(store.list({ includeArchived: true })).toHaveLength(3);
    });
  });
});
