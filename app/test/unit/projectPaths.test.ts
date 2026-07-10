import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assertValidProjectId,
  ensureProjectDirectories,
  indexFilePath,
  resolveProjectPaths,
} from '../../src/main/project/projectPaths';

const VALID_UUID = 'c3a1f9e2-4b8d-4a7e-9c1a-2f6d8b0e5a11';

describe('assertValidProjectId', () => {
  it('accepts the literal "default"', () => {
    expect(() => assertValidProjectId('default')).not.toThrow();
  });

  it('accepts a canonical UUID', () => {
    expect(() => assertValidProjectId(VALID_UUID)).not.toThrow();
  });

  it('accepts an upper-case UUID', () => {
    expect(() => assertValidProjectId(VALID_UUID.toUpperCase())).not.toThrow();
  });

  it('rejects an empty string', () => {
    expect(() => assertValidProjectId('')).toThrow();
  });

  it('rejects ".." path traversal segments', () => {
    expect(() => assertValidProjectId('..')).toThrow();
    expect(() => assertValidProjectId('../other-project')).toThrow();
  });

  it('rejects forward-slash injection', () => {
    expect(() => assertValidProjectId('foo/bar')).toThrow();
  });

  it('rejects back-slash injection', () => {
    expect(() => assertValidProjectId('foo\\bar')).toThrow();
  });

  it('rejects absolute-path fragments', () => {
    expect(() => assertValidProjectId('C:\\Windows\\System32')).toThrow();
    expect(() => assertValidProjectId('/etc/passwd')).toThrow();
  });

  it('rejects a malformed UUID (wrong segment lengths)', () => {
    expect(() => assertValidProjectId('c3a1f9e2-4b8d-4a7e-9c1a')).toThrow();
  });

  it('rejects arbitrary free-text ids', () => {
    expect(() => assertValidProjectId('my project')).toThrow();
    expect(() => assertValidProjectId('default2')).toThrow();
  });
});

describe('resolveProjectPaths', () => {
  it('assembles the default project layout under data/projects/default/', () => {
    const dataDir = join('C:', 'app', 'data');

    const paths = resolveProjectPaths(dataDir, 'default');

    expect(paths.root).toBe(join(dataDir, 'projects', 'default'));
    expect(paths.memoryFile).toBe(join(paths.root, 'memory.json'));
    expect(paths.libraryFile).toBe(join(paths.root, 'library.json'));
    expect(paths.chatsDir).toBe(join(paths.root, 'chats'));
    expect(paths.researchDir).toBe(join(paths.root, 'research'));
    expect(paths.gateDir).toBe(join(paths.root, 'gate'));
    expect(paths.checkpointFile).toBe(join(paths.root, 'research-checkpoint.json'));
  });

  it('assembles the layout for a UUID project id', () => {
    const dataDir = join('C:', 'app', 'data');

    const paths = resolveProjectPaths(dataDir, VALID_UUID);

    expect(paths.root).toBe(join(dataDir, 'projects', VALID_UUID));
    expect(paths.memoryFile).toBe(join(dataDir, 'projects', VALID_UUID, 'memory.json'));
  });

  it('throws (and computes no path) when given an invalid project id', () => {
    expect(() => resolveProjectPaths(join('C:', 'app', 'data'), '../escape')).toThrow();
  });
});

describe('indexFilePath', () => {
  it('resolves to data/projects/index.json', () => {
    const dataDir = join('C:', 'app', 'data');
    expect(indexFilePath(dataDir)).toBe(join(dataDir, 'projects', 'index.json'));
  });
});

describe('ensureProjectDirectories', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'tsa-project-paths-test-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('creates root, chats/, research/, and gate/ directories when missing', () => {
    const paths = resolveProjectPaths(workDir, 'default');

    expect(existsSync(paths.root)).toBe(false);

    ensureProjectDirectories(paths);

    expect(existsSync(paths.root)).toBe(true);
    expect(existsSync(paths.chatsDir)).toBe(true);
    expect(existsSync(paths.researchDir)).toBe(true);
    expect(existsSync(paths.gateDir)).toBe(true);
  });

  it('is idempotent when called repeatedly', () => {
    const paths = resolveProjectPaths(workDir, VALID_UUID);

    ensureProjectDirectories(paths);
    expect(() => ensureProjectDirectories(paths)).not.toThrow();
    expect(existsSync(paths.chatsDir)).toBe(true);
  });

  it('does not create memoryFile/libraryFile/checkpointFile as directories', () => {
    const paths = resolveProjectPaths(workDir, 'default');

    ensureProjectDirectories(paths);

    // Files themselves are written by their respective stores, not this helper.
    expect(existsSync(paths.memoryFile)).toBe(false);
    expect(existsSync(paths.libraryFile)).toBe(false);
    expect(existsSync(paths.checkpointFile)).toBe(false);
  });
});
