import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectIndexStore } from '../../src/core/project/projectStore';
import { indexFilePath, type ProjectPaths } from '../../src/main/project/projectPaths';
import { ProjectContext } from '../../src/main/ipc/projectContext';

describe('ProjectContext', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'tsa-project-context-test-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  function newIndexStore(): ProjectIndexStore {
    return new ProjectIndexStore(indexFilePath(dataDir));
  }

  /** Seeds two projects on disk and returns their ids (first is active). */
  function seedTwoProjects(): { a: string; b: string } {
    const store = newIndexStore();
    store.load();
    const a = store.create('프로젝트 A');
    const b = store.create('프로젝트 B');
    store.setActive(a.id);
    store.save();
    return { a: a.id, b: b.id };
  }

  describe('initialize()', () => {
    it('loads the index and assembles services for the active project', () => {
      const { a } = seedTwoProjects();
      const ctx = new ProjectContext({ dataDir, indexStore: newIndexStore() });

      ctx.initialize();

      expect(ctx.getActiveProjectId()).toBe(a);
      const services = ctx.getServices();
      expect(services.memoryStore).toBeDefined();
      expect(services.projectPaths.memoryFile).toContain(a);
    });

    it('creates and persists a default project when the index has none', () => {
      const ctx = new ProjectContext({ dataDir, indexStore: newIndexStore() });

      ctx.initialize();

      const activeId = ctx.getActiveProjectId();
      expect(activeId).toBeTruthy();

      // The created project is persisted so it survives a restart.
      const reopened = newIndexStore();
      reopened.load();
      expect(reopened.getActive()?.id).toBe(activeId);
    });

    it('creates the active project directory on disk', () => {
      const ctx = new ProjectContext({ dataDir, indexStore: newIndexStore() });
      ctx.initialize();
      expect(existsSync(ctx.getServices().projectPaths.root)).toBe(true);
      expect(existsSync(ctx.getServices().projectPaths.chatsDir)).toBe(true);
    });

    it('invokes buildExtras with the active project paths', () => {
      const { a } = seedTwoProjects();
      const buildExtras = vi.fn((paths: ProjectPaths) => ({ libraryFile: paths.libraryFile }));
      const ctx = new ProjectContext({ dataDir, indexStore: newIndexStore(), buildExtras });

      ctx.initialize();

      expect(buildExtras).toHaveBeenCalledTimes(1);
      expect(ctx.getExtras()).toEqual({ libraryFile: expect.stringContaining(a) });
    });

    it('exposes an empty extras record when no buildExtras is supplied', () => {
      seedTwoProjects();
      const ctx = new ProjectContext({ dataDir, indexStore: newIndexStore() });
      ctx.initialize();
      expect(ctx.getExtras()).toEqual({});
    });
  });

  it('throws from every accessor until initialized', () => {
    const ctx = new ProjectContext({ dataDir, indexStore: newIndexStore() });
    expect(() => ctx.getActiveProjectId()).toThrow(/not initialized/i);
    expect(() => ctx.getServices()).toThrow(/not initialized/i);
    expect(() => ctx.getExtras()).toThrow(/not initialized/i);
  });

  describe('switchProject()', () => {
    it('re-assembles services against the new project (fresh MemoryStore instance)', () => {
      const { a, b } = seedTwoProjects();
      const ctx = new ProjectContext({ dataDir, indexStore: newIndexStore() });
      ctx.initialize();

      const storeA = ctx.getServices().memoryStore;
      const result = ctx.switchProject(b);

      expect(result).toEqual({ ok: true, projectId: b });
      expect(ctx.getActiveProjectId()).toBe(b);
      const storeB = ctx.getServices().memoryStore;
      expect(storeB).not.toBe(storeA);
      expect(ctx.getServices().projectPaths.memoryFile).toContain(b);
      expect(ctx.getServices().projectPaths.memoryFile).not.toContain(a);
    });

    it('isolates data between projects across a switch', () => {
      const { a, b } = seedTwoProjects();
      const ctx = new ProjectContext({ dataDir, indexStore: newIndexStore() });
      ctx.initialize();

      // Write into project A and persist, then switch to B.
      ctx.getServices().memoryStore.addResearchQuestion({ text: 'A 질문' });
      ctx.getServices().memoryStore.save();
      ctx.switchProject(b);

      // B starts empty — A's data is not visible.
      expect(ctx.getServices().memoryStore.listResearchQuestions()).toEqual([]);

      // Switching back to A restores A's persisted data.
      ctx.switchProject(a);
      const questions = ctx.getServices().memoryStore.listResearchQuestions();
      expect(questions).toHaveLength(1);
      expect(questions[0]?.text).toBe('A 질문');
    });

    it('re-invokes buildExtras on each switch, bound to the new project paths', () => {
      const { a, b } = seedTwoProjects();
      const buildExtras = vi.fn((paths: ProjectPaths) => ({ root: paths.root }));
      const ctx = new ProjectContext({ dataDir, indexStore: newIndexStore(), buildExtras });
      ctx.initialize();

      buildExtras.mockClear();
      ctx.switchProject(b);

      expect(buildExtras).toHaveBeenCalledTimes(1);
      expect(ctx.getExtras()).toEqual({ root: expect.stringContaining(b) });
      expect(ctx.getExtras()).not.toEqual({ root: expect.stringContaining(a) });
    });

    it('persists the active-project change to the index on switch', () => {
      const { b } = seedTwoProjects();
      const ctx = new ProjectContext({ dataDir, indexStore: newIndexStore() });
      ctx.initialize();

      ctx.switchProject(b);

      const reopened = newIndexStore();
      reopened.load();
      expect(reopened.getActive()?.id).toBe(b);
    });

    it('rejects switching to a non-existent project and keeps current services', () => {
      const { a } = seedTwoProjects();
      const ctx = new ProjectContext({ dataDir, indexStore: newIndexStore() });
      ctx.initialize();
      const before = ctx.getServices();

      const result = ctx.switchProject('11111111-1111-1111-1111-111111111111');

      expect(result).toEqual({ ok: false, reason: 'not_found' });
      expect(ctx.getActiveProjectId()).toBe(a);
      expect(ctx.getServices()).toBe(before);
    });

    it('rejects switching to an archived project and keeps current services', () => {
      const { a, b } = seedTwoProjects();
      const store = newIndexStore();
      store.load();
      store.archive(b);
      store.save();

      const ctx = new ProjectContext({ dataDir, indexStore: newIndexStore() });
      ctx.initialize();
      const before = ctx.getServices();

      const result = ctx.switchProject(b);

      expect(result).toEqual({ ok: false, reason: 'archived' });
      expect(ctx.getActiveProjectId()).toBe(a);
      expect(ctx.getServices()).toBe(before);
    });
  });

  describe('beforeSwitch hook', () => {
    it('runs beforeSwitch with the outgoing services before re-assembly', () => {
      const { a, b } = seedTwoProjects();
      const order: string[] = [];
      const buildExtras = vi.fn(() => {
        order.push('assemble');
        return {};
      });
      const beforeSwitch = vi.fn((outgoing) => {
        order.push('beforeSwitch');
        // The outgoing services must still be project A's at this point.
        expect(outgoing.projectPaths.memoryFile).toContain(a);
      });
      const ctx = new ProjectContext({ dataDir, indexStore: newIndexStore(), buildExtras, beforeSwitch });
      ctx.initialize();

      order.length = 0;
      ctx.switchProject(b);

      expect(beforeSwitch).toHaveBeenCalledTimes(1);
      expect(order).toEqual(['beforeSwitch', 'assemble']);
    });

    it('does not run beforeSwitch when the switch is rejected', () => {
      seedTwoProjects();
      const beforeSwitch = vi.fn();
      const ctx = new ProjectContext({ dataDir, indexStore: newIndexStore(), beforeSwitch });
      ctx.initialize();

      ctx.switchProject('22222222-2222-2222-2222-222222222222');

      expect(beforeSwitch).not.toHaveBeenCalled();
    });
  });

  describe('onSwitch listeners', () => {
    it('notifies listeners with the new project id after a successful switch', () => {
      const { b } = seedTwoProjects();
      const ctx = new ProjectContext({ dataDir, indexStore: newIndexStore() });
      ctx.initialize();
      const listener = vi.fn();
      ctx.onSwitch(listener);

      ctx.switchProject(b);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(b);
    });

    it('does not notify on the initial initialize() assembly', () => {
      const { b } = seedTwoProjects();
      const ctx = new ProjectContext({ dataDir, indexStore: newIndexStore() });
      const listener = vi.fn();
      ctx.onSwitch(listener);

      ctx.initialize();

      expect(listener).not.toHaveBeenCalled();
      // But it does fire on a subsequent switch.
      ctx.switchProject(b);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('does not notify a listener after it unsubscribes', () => {
      const { a, b } = seedTwoProjects();
      const ctx = new ProjectContext({ dataDir, indexStore: newIndexStore() });
      ctx.initialize();
      const listener = vi.fn();
      const unsubscribe = ctx.onSwitch(listener);

      ctx.switchProject(b);
      unsubscribe();
      ctx.switchProject(a);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenLastCalledWith(b);
    });

    it('does not notify listeners when the switch is rejected', () => {
      seedTwoProjects();
      const ctx = new ProjectContext({ dataDir, indexStore: newIndexStore() });
      ctx.initialize();
      const listener = vi.fn();
      ctx.onSwitch(listener);

      ctx.switchProject('33333333-3333-3333-3333-333333333333');

      expect(listener).not.toHaveBeenCalled();
    });

    it('notifies AFTER re-assembly so listeners observe the new active services', () => {
      const { b } = seedTwoProjects();
      const ctx = new ProjectContext({ dataDir, indexStore: newIndexStore() });
      ctx.initialize();
      let observedId: string | undefined;
      ctx.onSwitch((id) => {
        // Inside the listener, the context already reflects the new project.
        expect(ctx.getActiveProjectId()).toBe(id);
        expect(ctx.getServices().projectPaths.memoryFile).toContain(id);
        observedId = id;
      });

      ctx.switchProject(b);

      expect(observedId).toBe(b);
    });
  });
});
