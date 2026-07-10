import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ensureAppDirectories, resolveAppPaths } from '../../src/main/paths';

describe('resolveAppPaths', () => {
  it('resolves the distribution root as the exe directory in packaged mode', () => {
    const execPath = join('C:', 'Users', 'test', 'Desktop', '논문서포터', '논문서포터.exe');
    const appPath = join('C:', 'Users', 'test', 'Desktop', '논문서포터', 'resources', 'app');

    const paths = resolveAppPaths({ isPackaged: true, execPath, appPath });

    expect(paths.root).toBe(join('C:', 'Users', 'test', 'Desktop', '논문서포터'));
    expect(paths.appDir).toBe(join(paths.root, 'app'));
    expect(paths.dataDir).toBe(join(paths.root, 'data'));
    expect(paths.configDir).toBe(join(paths.root, 'config'));
    expect(paths.settingsFile).toBe(join(paths.root, 'config', 'settings.json'));
  });

  it('resolves the distribution root as the repo root (parent of app/) in dev mode', () => {
    const appPath = join('F:', 'coding projects', '논문 작성 서포터', 'app');

    const paths = resolveAppPaths({ isPackaged: false, execPath: 'unused', appPath });

    expect(paths.root).toBe(join('F:', 'coding projects', '논문 작성 서포터'));
    expect(paths.appDir).toBe(join(paths.root, 'app'));
    expect(paths.dataDir).toBe(join(paths.root, 'data'));
  });

  it('never places resolved paths inside the app directory itself', () => {
    const appPath = join('F:', 'repo', 'app');
    const paths = resolveAppPaths({ isPackaged: false, execPath: 'unused', appPath });

    expect(paths.dataDir.startsWith(paths.appDir + sep)).toBe(false);
    expect(paths.configDir.startsWith(paths.appDir + sep)).toBe(false);
  });
});

describe('ensureAppDirectories', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'tsa-paths-test-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('creates data/ and config/ directories when missing', () => {
    const dataDir = join(workDir, 'data');
    const configDir = join(workDir, 'config');

    expect(existsSync(dataDir)).toBe(false);
    expect(existsSync(configDir)).toBe(false);

    ensureAppDirectories({ dataDir, configDir });

    expect(existsSync(dataDir)).toBe(true);
    expect(existsSync(configDir)).toBe(true);
  });

  it('is idempotent when called repeatedly', () => {
    const dataDir = join(workDir, 'data');
    const configDir = join(workDir, 'config');

    ensureAppDirectories({ dataDir, configDir });
    expect(() => ensureAppDirectories({ dataDir, configDir })).not.toThrow();
    expect(existsSync(dataDir)).toBe(true);
  });
});
