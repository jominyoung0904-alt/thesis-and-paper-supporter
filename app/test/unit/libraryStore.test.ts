import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PaperMetadata } from '../../src/core/academic-api/types';
import { LibraryValidationError } from '../../src/core/library/model';
import { LibraryStore } from '../../src/core/library/store';

function makePaper(overrides: Partial<PaperMetadata> = {}): PaperMetadata {
  return {
    source: 'openalex',
    externalId: 'W123',
    title: '메타인지와 학업 성취',
    authors: ['홍길동'],
    year: 2024,
    abstract: null,
    venue: null,
    url: 'https://openalex.org/W123',
    citationCount: null,
    ...overrides,
  };
}

describe('LibraryStore', () => {
  let workDir: string;
  let libraryFile: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'tsa-library-test-'));
    libraryFile = join(workDir, 'projects', 'p1', 'library.json');
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(workDir, { recursive: true, force: true });
  });

  describe('load()', () => {
    it('returns "created" and starts with an empty library when the file does not exist', () => {
      const store = new LibraryStore(libraryFile);

      const result = store.load();

      expect(result.status).toBe('created');
      expect(store.list()).toEqual([]);
    });

    it('returns "loaded" and restores previously saved data on a fresh instance', () => {
      const first = new LibraryStore(libraryFile);
      first.load();
      first.add(makePaper());
      first.save();

      const second = new LibraryStore(libraryFile);
      const result = second.load();

      expect(result.status).toBe('loaded');
      expect(second.list()).toHaveLength(1);
      expect(second.list()[0]?.paper.title).toBe('메타인지와 학업 성취');
    });

    it('recovers from an unparsable (invalid JSON) file, preserving it as .bak', () => {
      mkdirSync(dirname(libraryFile), { recursive: true });
      writeFileSync(libraryFile, '{ this is not valid json', 'utf-8');

      const store = new LibraryStore(libraryFile);
      const result = store.load();

      expect(result.status).toBe('recovered');
      expect(result.backupPath).toBe(`${libraryFile}.bak`);
      expect(existsSync(`${libraryFile}.bak`)).toBe(true);
      expect(readFileSync(`${libraryFile}.bak`, 'utf-8')).toBe('{ this is not valid json');
      expect(store.list()).toEqual([]);
    });

    it('recovers from a well-formed JSON file that does not match the LibraryFile shape', () => {
      mkdirSync(dirname(libraryFile), { recursive: true });
      writeFileSync(libraryFile, JSON.stringify({ hello: 'world' }), 'utf-8');

      const store = new LibraryStore(libraryFile);
      const result = store.load();

      expect(result.status).toBe('recovered');
      expect(existsSync(`${libraryFile}.bak`)).toBe(true);
      expect(store.list()).toEqual([]);
    });
  });

  describe('save()', () => {
    it('writes indented (2-space) JSON and leaves no stray temp file behind', () => {
      const store = new LibraryStore(libraryFile);
      store.load();
      store.add(makePaper());

      store.save();

      const raw = readFileSync(libraryFile, 'utf-8');
      expect(raw).toContain('\n  "schemaVersion"');
      const dirEntries = readdirSync(join(libraryFile, '..'));
      expect(dirEntries.some((name) => name.endsWith('.tmp'))).toBe(false);
    });

    it('overwrites the existing file atomically on repeated saves', () => {
      const store = new LibraryStore(libraryFile);
      store.load();
      store.add(makePaper({ externalId: 'W1' }));
      store.save();

      store.add(makePaper({ externalId: 'W2' }));
      store.save();

      const reloaded = new LibraryStore(libraryFile);
      reloaded.load();
      expect(reloaded.list()).toHaveLength(2);
    });
  });

  describe('add() (FR-LIB-001)', () => {
    it('saves a paper with a generated id, savedAt timestamp, and empty memo by default', () => {
      const store = new LibraryStore(libraryFile);
      store.load();

      const result = store.add(makePaper(), 'research-1');

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok result');
      expect(result.paper.id).toBeTruthy();
      expect(result.paper.sourceResearchId).toBe('research-1');
      expect(result.paper.memo).toBe('');
      expect(typeof result.paper.savedAt).toBe('string');
    });

    it('rejects a duplicate paper with the same externalId and source', () => {
      const store = new LibraryStore(libraryFile);
      store.load();
      store.add(makePaper());

      const duplicate = store.add(makePaper());

      expect(duplicate).toEqual({ ok: false, reason: 'duplicate' });
      expect(store.list()).toHaveLength(1);
    });

    it('allows the same externalId when the source differs', () => {
      const store = new LibraryStore(libraryFile);
      store.load();
      store.add(makePaper({ source: 'openalex' }));

      const second = store.add(makePaper({ source: 'semanticscholar' }));

      expect(second.ok).toBe(true);
      expect(store.list()).toHaveLength(2);
    });
  });

  describe('list()', () => {
    it('returns saved papers most-recently-saved first', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

      const store = new LibraryStore(libraryFile);
      store.load();
      store.add(makePaper({ externalId: 'W1' }));

      vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
      store.add(makePaper({ externalId: 'W2' }));

      const list = store.list();
      expect(list.map((entry) => entry.paper.externalId)).toEqual(['W2', 'W1']);
    });
  });

  describe('updateMemo() (FR-LIB-002)', () => {
    it('updates the memo on an existing paper', () => {
      const store = new LibraryStore(libraryFile);
      store.load();
      const added = store.add(makePaper());
      if (!added.ok) throw new Error('expected ok result');

      const updated = store.updateMemo(added.paper.id, '재검토 필요');

      expect(updated?.memo).toBe('재검토 필요');
    });

    it('rejects a memo longer than 500 characters', () => {
      const store = new LibraryStore(libraryFile);
      store.load();
      const added = store.add(makePaper());
      if (!added.ok) throw new Error('expected ok result');

      const tooLong = 'x'.repeat(501);
      expect(() => store.updateMemo(added.paper.id, tooLong)).toThrow(LibraryValidationError);
    });

    it('returns undefined when updating the memo of an unknown id', () => {
      const store = new LibraryStore(libraryFile);
      store.load();

      expect(store.updateMemo('missing-id', '메모')).toBeUndefined();
    });
  });

  describe('remove()', () => {
    it('hard-deletes a saved paper by id', () => {
      const store = new LibraryStore(libraryFile);
      store.load();
      const added = store.add(makePaper());
      if (!added.ok) throw new Error('expected ok result');

      const removed = store.remove(added.paper.id);

      expect(removed).toBe(true);
      expect(store.list()).toHaveLength(0);
    });

    it('returns false when removing an unknown id', () => {
      const store = new LibraryStore(libraryFile);
      store.load();

      expect(store.remove('missing-id')).toBe(false);
    });
  });

  describe('has()', () => {
    it('reports whether a paper is already saved by externalId and source', () => {
      const store = new LibraryStore(libraryFile);
      store.load();
      store.add(makePaper({ externalId: 'W1', source: 'openalex' }));

      expect(store.has('W1', 'openalex')).toBe(true);
      expect(store.has('W1', 'semanticscholar')).toBe(false);
      expect(store.has('W999', 'openalex')).toBe(false);
    });
  });
});
