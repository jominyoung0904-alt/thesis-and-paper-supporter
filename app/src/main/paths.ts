import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { AppPaths } from '../shared/types';

/**
 * Inputs required to resolve portable app paths without depending on the
 * `electron` module directly. Keeping this pure (no `electron` import) makes
 * it unit-testable outside of an Electron runtime.
 *
 * - In packaged (portable) mode, the distribution root is the directory
 *   containing the executable (e.g. the extracted zip root that also holds
 *   `data/` and `config/`).
 * - In dev mode, the distribution root is the repository root, i.e. the
 *   parent of the `app/` directory (Electron's `app.getAppPath()` points to
 *   `app/` when running unpackaged from source).
 */
export interface ResolveAppPathsInput {
  /** Mirrors Electron's `app.isPackaged`. */
  isPackaged: boolean;
  /** Mirrors Node's `process.execPath`. */
  execPath: string;
  /** Mirrors Electron's `app.getAppPath()`. */
  appPath: string;
}

/**
 * Resolves the portable directory layout (app/data/config) from the given
 * runtime signals. This is the single source of truth for path resolution —
 * all other modules that need `data/` or `config/` locations MUST call this
 * function (or reuse an already-resolved `AppPaths`) instead of computing
 * paths themselves.
 */
export function resolveAppPaths(input: ResolveAppPathsInput): AppPaths {
  const root = input.isPackaged ? dirname(input.execPath) : dirname(input.appPath);

  const appDir = join(root, 'app');
  const dataDir = join(root, 'data');
  const configDir = join(root, 'config');
  const settingsFile = join(configDir, 'settings.json');

  return { root, appDir, dataDir, configDir, settingsFile };
}

/**
 * Ensures the `data/` and `config/` directories exist, creating them
 * recursively if missing. Safe to call multiple times (idempotent).
 */
export function ensureAppDirectories(paths: Pick<AppPaths, 'dataDir' | 'configDir'>): void {
  mkdirSync(paths.dataDir, { recursive: true });
  mkdirSync(paths.configDir, { recursive: true });
}
