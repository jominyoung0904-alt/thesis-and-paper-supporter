/**
 * Automatic session backup (NFR-OPS-001, T26/SPEC-TSA-001 design decision 6,
 * SPEC-TSA-002 design decision 5).
 *
 * Timing rationale — START of the session, not on quit:
 * Electron's 'before-quit' hook is unreliable on Windows: the OS can kill a
 * portable-exe process (window close, taskkill, forced shutdown) before an
 * async cleanup handler finishes, and a synchronous handler would delay
 * shutdown and risk being force-killed mid-write, corrupting the zip. The
 * safest point to back up "the previous session's data" is therefore the
 * START of the *next* session, a few seconds after the window is created
 * (see `index.ts`). This also means `runSessionBackup` never needs to be
 * awaited — nothing downstream depends on the zip finishing before the app
 * is usable, so the spawned PowerShell process is fully detached.
 *
 * Location — backups/ lives OUTSIDE dataDir:
 * `{root}/backups/`, a sibling of `{root}/data/`, not `{root}/data/backups/`.
 * Placing it inside dataDir would make every subsequent backup include the
 * prior backups (snowballing zip-of-zips), and would also churn the backup
 * set on every run since Compress-Archive would see backups/ change.
 *
 * Zip tool — PowerShell Compress-Archive (design decision 5, SPEC-TSA-002):
 * no zip library is a runtime dependency (`archiver`/`adm-zip` are absent
 * from package.json, and `electron-builder` is a devDependency, unusable at
 * runtime). The app already assumes a Windows portable environment, so
 * shelling out to PowerShell (as `scripts/package-zip.mjs` already does for
 * release packaging) adds no new dependency.
 *
 * Failure contract — "실패=결과값" (NFR-OPS-003): every failure path returns
 * a `BackupResult` with `ok: false` and a `reason`; nothing here ever throws
 * past its own boundary, and nothing here may block app startup.
 *
 * Scope (I-1, SPEC-TSA-002 Phase 4 review): the backup zip does NOT preserve
 * per-project isolation — it archives the entirety of `dataDir` (i.e. every
 * project under `data/projects/`), not just the currently active one.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_MAX_BACKUPS = 5;
const BACKUP_ZIP_PATTERN = /^backup-\d{8}-\d{6}\.zip$/;

/**
 * Minimal shape of a spawned child process this module relies on. Matches
 * (a subset of) Node's `ChildProcess`, kept narrow so tests can inject a
 * lightweight fake instead of a real process.
 */
export interface SpawnedProcess {
  on: (event: 'close' | 'error', listener: (...args: unknown[]) => void) => unknown;
  unref?: () => void;
}

export type SpawnFn = (command: string, args: string[], options?: Record<string, unknown>) => SpawnedProcess;

export interface RunSessionBackupOptions {
  /** Directory containing the data to back up (`{root}/data`). */
  dataDir: string;
  /** Directory the zip is written into (`{root}/backups`), OUTSIDE `dataDir`. */
  backupsDir: string;
  /** Number of most-recent backups to retain. Defaults to 5. */
  maxBackups?: number;
  /** Injectable for tests. Defaults to `node:child_process`'s `spawn`. */
  spawnFn?: SpawnFn;
}

export interface BackupResult {
  /** `true` once the backup process has been successfully launched (not once it has finished — the process is detached and not awaited). */
  ok: boolean;
  /** Absolute path the zip will be written to. Present only when `ok` is `true`. */
  zipPath?: string;
  /** Korean-or-technical reason, present only when `ok` is `false`. Logged only, never shown as a blocking dialog. */
  reason?: string;
}

/** `YYYYMMDD-HHmmss`, matching `BACKUP_ZIP_PATTERN` and sorting chronologically as a plain string. */
function formatBackupTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}${mo}${d}-${h}${mi}${s}`;
}

/**
 * Escapes a path fragment for safe interpolation inside a PowerShell
 * single-quoted string literal (M-1, SPEC-TSA-002 Phase 4 review):
 * PowerShell's single-quoted strings treat `'` as literal EXCEPT that a
 * doubled `''` is the escape sequence for one literal `'`. Without this, a
 * path containing an apostrophe (e.g. a Windows user profile directory like
 * `C:\Users\O'Brien\...`) would prematurely terminate the quoted `-Path`/
 * `-DestinationPath` argument and corrupt the generated command.
 */
function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Builds the PowerShell command that zips `dataDir`'s contents into
 * `zipPath`. Exported (in addition to being used internally) so tests can
 * exercise the exact command against a real `Compress-Archive` invocation
 * without going through the detached-spawn path in `runSessionBackup`.
 */
export function buildCompressArchiveArgs(dataDir: string, zipPath: string): { command: string; args: string[] } {
  const escapedDataGlob = escapePowerShellSingleQuoted(join(dataDir, '*'));
  const escapedZipPath = escapePowerShellSingleQuoted(zipPath);
  return {
    command: 'powershell.exe',
    args: [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${escapedDataGlob}' -DestinationPath '${escapedZipPath}' -Force`,
    ],
  };
}

const defaultSpawnFn: SpawnFn = (command, args, options) =>
  nodeSpawn(command, args, options) as unknown as SpawnedProcess;

/**
 * Launches a detached, fire-and-forget backup of `dataDir` into
 * `backupsDir/backup-{timestamp}.zip`. Never blocks the caller: the spawned
 * PowerShell process is not awaited, and every failure path (directory
 * creation, missing data dir, spawn failure) returns a result instead of
 * throwing. Pruning to `maxBackups` runs once the spawned process closes,
 * so it reflects the backup set as it actually exists on disk.
 */
// @AX:ANCHOR: [AUTO] backup-timing entry point — invoked at session START, not on quit, per the module-doc rationale above. Related: SPEC-TSA-002 T58
export function runSessionBackup(options: RunSessionBackupOptions): BackupResult {
  const { dataDir, backupsDir, maxBackups = DEFAULT_MAX_BACKUPS } = options;
  const spawnFn = options.spawnFn ?? defaultSpawnFn;

  try {
    mkdirSync(backupsDir, { recursive: true });
  } catch (error) {
    return { ok: false, reason: `backups 폴더 생성 실패: ${String(error)}` };
  }

  if (!existsSync(dataDir)) {
    // First-ever launch, before any data has been written yet — nothing to back up.
    return { ok: false, reason: 'data 폴더가 아직 없어 백업을 건너뜀' };
  }

  const zipPath = join(backupsDir, `backup-${formatBackupTimestamp(new Date())}.zip`);
  const { command, args } = buildCompressArchiveArgs(dataDir, zipPath);

  try {
    const child = spawnFn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    // L-1 (SPEC-TSA-002 Phase 4 review): only prune on a clean exit — pruning
    // after an abnormal exit (non-zero code, killed by signal) could delete
    // good older backups while leaving behind a failed/partial zip from THIS
    // run, net-shrinking the retained backup set for no benefit.
    child.on('close', (code) => {
      if (code === 0) {
        pruneOldBackups(backupsDir, maxBackups);
        return;
      }
      console.error(`[backup] Compress-Archive exited abnormally (code: ${String(code)})`);
      // Best-effort cleanup of a failed/partial zip — failure here is logged
      // only, never thrown (NFR-OPS-003).
      try {
        if (existsSync(zipPath)) {
          unlinkSync(zipPath);
        }
      } catch (cleanupError) {
        console.error('[backup] failed to remove a failed backup zip:', cleanupError);
      }
    });
    child.on('error', (error) => {
      console.error('[backup] Compress-Archive process error:', error);
    });
    child.unref?.();
  } catch (error) {
    return { ok: false, reason: `백업 프로세스 시작 실패: ${String(error)}` };
  }

  return { ok: true, zipPath };
}

/**
 * Deletes the oldest zip files in `backupsDir` beyond the newest
 * `maxBackups`, ordered by filename (which sorts chronologically since
 * `formatBackupTimestamp` is zero-padded and big-endian). Non-matching
 * filenames are left untouched. Returns the list of removed filenames (empty
 * on any failure — logged, never thrown, per NFR-OPS-003).
 */
export function pruneOldBackups(backupsDir: string, maxBackups: number = DEFAULT_MAX_BACKUPS): string[] {
  try {
    const entries = readdirSync(backupsDir)
      .filter((name) => BACKUP_ZIP_PATTERN.test(name))
      .sort();

    const excess = entries.length - maxBackups;
    if (excess <= 0) {
      return [];
    }

    const removed: string[] = [];
    for (const name of entries.slice(0, excess)) {
      try {
        unlinkSync(join(backupsDir, name));
        removed.push(name);
      } catch (error) {
        console.error(`[backup] failed to prune old backup "${name}":`, error);
      }
    }
    return removed;
  } catch (error) {
    console.error('[backup] failed to list backups directory for pruning:', error);
    return [];
  }
}
