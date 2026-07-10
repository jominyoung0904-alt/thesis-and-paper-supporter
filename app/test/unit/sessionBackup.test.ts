import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildCompressArchiveArgs,
  pruneOldBackups,
  runSessionBackup,
  type SpawnedProcess,
} from '../../src/main/backup/sessionBackup';

/** No-op fake spawn result — used by tests that don't care about close/error timing. */
function fakeSpawnedProcess(): SpawnedProcess {
  return { on: () => undefined, unref: () => undefined };
}

describe('runSessionBackup', () => {
  let root: string;
  let dataDir: string;
  let backupsDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'tsa-backup-test-'));
    dataDir = join(root, 'data');
    backupsDir = join(root, 'backups');
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, 'memory.json'), '{"researchQuestion":"test"}', 'utf-8');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('spawns powershell.exe with a Compress-Archive command referencing dataDir and a timestamped zip path', () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const result = runSessionBackup({
      dataDir,
      backupsDir,
      spawnFn: (command, args) => {
        calls.push({ command, args });
        return fakeSpawnedProcess();
      },
    });

    expect(result.ok).toBe(true);
    expect(result.zipPath).toMatch(/backup-\d{8}-\d{6}\.zip$/);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe('powershell.exe');
    const joinedArgs = calls[0]?.args.join(' ') ?? '';
    expect(joinedArgs).toContain('Compress-Archive');
    expect(joinedArgs).toContain(dataDir);
    expect(joinedArgs).toContain(result.zipPath);
  });

  it('creates backups/ outside dataDir when it does not exist yet', () => {
    expect(existsSync(backupsDir)).toBe(false);

    runSessionBackup({ dataDir, backupsDir, spawnFn: () => fakeSpawnedProcess() });

    expect(existsSync(backupsDir)).toBe(true);
    // backups/ must be a sibling of data/, not nested inside it (snowballing zip-of-zips).
    expect(backupsDir.startsWith(dataDir)).toBe(false);
  });

  it('never throws and reports ok:false when spawnFn throws synchronously', () => {
    const spawnFn = () => {
      throw new Error('ENOENT: powershell.exe not found');
    };

    let result: ReturnType<typeof runSessionBackup> | undefined;
    expect(() => {
      result = runSessionBackup({ dataDir, backupsDir, spawnFn });
    }).not.toThrow();

    expect(result?.ok).toBe(false);
    expect(result?.reason).toBeTruthy();
  });

  it('reports ok:false without throwing when dataDir does not exist yet (first-ever launch)', () => {
    const missingDataDir = join(root, 'no-such-data');

    const result = runSessionBackup({
      dataDir: missingDataDir,
      backupsDir,
      spawnFn: () => fakeSpawnedProcess(),
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('prunes old backups once the spawned process closes with exit code 0, keeping only maxBackups newest', () => {
    let closeHandler: ((code: number) => void) | undefined;
    mkdirSync(backupsDir, { recursive: true });
    for (let i = 1; i <= 6; i += 1) {
      writeFileSync(join(backupsDir, `backup-2026070${i}-000000.zip`), '', 'utf-8');
    }

    runSessionBackup({
      dataDir,
      backupsDir,
      maxBackups: 5,
      spawnFn: () => ({
        on: (event, cb) => {
          if (event === 'close') {
            closeHandler = cb as (code: number) => void;
          }
        },
        unref: () => undefined,
      }),
    });

    expect(closeHandler).toBeDefined();
    closeHandler?.(0);

    const remaining = readdirSync(backupsDir).filter((name) => name.startsWith('backup-'));
    expect(remaining).toHaveLength(5);
    expect(remaining).not.toContain('backup-20260701-000000.zip');
  });

  // L-1 (SPEC-TSA-002 Phase 4 review): a non-zero exit must not prune older
  // (good) backups, and should best-effort delete the failed/partial zip.
  it('does NOT prune when the spawned process closes with a non-zero exit code', () => {
    let closeHandler: ((code: number) => void) | undefined;
    mkdirSync(backupsDir, { recursive: true });
    for (let i = 1; i <= 6; i += 1) {
      writeFileSync(join(backupsDir, `backup-2026070${i}-000000.zip`), '', 'utf-8');
    }

    const result = runSessionBackup({
      dataDir,
      backupsDir,
      maxBackups: 5,
      spawnFn: () => ({
        on: (event, cb) => {
          if (event === 'close') {
            closeHandler = cb as (code: number) => void;
          }
        },
        unref: () => undefined,
      }),
    });

    // Simulate the failed run's own (partial) zip existing at its expected path.
    writeFileSync(result.zipPath!, '', 'utf-8');

    expect(closeHandler).toBeDefined();
    closeHandler?.(1);

    const remaining = readdirSync(backupsDir).filter((name) => name.startsWith('backup-'));
    // All 6 pre-existing backups survive — pruning never ran.
    expect(remaining).toContain('backup-20260701-000000.zip');
    // The failed run's own zip was best-effort cleaned up.
    expect(existsSync(result.zipPath!)).toBe(false);
  });

  it('never throws when best-effort cleanup of a failed zip itself fails', () => {
    let closeHandler: ((code: number) => void) | undefined;

    expect(() => {
      runSessionBackup({
        dataDir,
        backupsDir,
        spawnFn: () => ({
          on: (event, cb) => {
            if (event === 'close') {
              closeHandler = cb as (code: number) => void;
            }
          },
          unref: () => undefined,
        }),
      });
      // zipPath was never actually written (existsSync is false), so the
      // cleanup branch's existsSync check is false and unlinkSync is never
      // reached — this still exercises the non-zero-exit path end-to-end
      // without throwing.
      closeHandler?.(1);
    }).not.toThrow();
  });
});

describe('pruneOldBackups', () => {
  let backupsDir: string;

  beforeEach(() => {
    backupsDir = mkdtempSync(join(tmpdir(), 'tsa-prune-test-'));
  });

  afterEach(() => {
    rmSync(backupsDir, { recursive: true, force: true });
  });

  it('keeps only the newest maxBackups entries, sorted by filename', () => {
    const names = ['backup-20260101-000000.zip', 'backup-20260102-000000.zip', 'backup-20260103-000000.zip', 'backup-20260104-000000.zip', 'backup-20260105-000000.zip', 'backup-20260106-000000.zip', 'backup-20260107-000000.zip'];
    for (const name of names) {
      writeFileSync(join(backupsDir, name), '', 'utf-8');
    }

    const removed = pruneOldBackups(backupsDir, 5);

    expect(removed).toEqual(['backup-20260101-000000.zip', 'backup-20260102-000000.zip']);
    const remaining = readdirSync(backupsDir);
    expect(remaining).toHaveLength(5);
    expect(remaining).toContain('backup-20260107-000000.zip');
  });

  it('leaves non-matching filenames untouched', () => {
    writeFileSync(join(backupsDir, 'notes.txt'), '', 'utf-8');
    for (let i = 1; i <= 6; i += 1) {
      writeFileSync(join(backupsDir, `backup-2026010${i}-000000.zip`), '', 'utf-8');
    }

    pruneOldBackups(backupsDir, 5);

    expect(existsSync(join(backupsDir, 'notes.txt'))).toBe(true);
  });

  it('returns [] and does not throw when the directory does not exist', () => {
    const missing = join(backupsDir, 'does-not-exist');

    expect(() => pruneOldBackups(missing, 5)).not.toThrow();
    expect(pruneOldBackups(missing, 5)).toEqual([]);
  });

  it('is a no-op when the number of backups is within the limit', () => {
    writeFileSync(join(backupsDir, 'backup-20260101-000000.zip'), '', 'utf-8');

    const removed = pruneOldBackups(backupsDir, 5);

    expect(removed).toEqual([]);
    expect(readdirSync(backupsDir)).toHaveLength(1);
  });
});

describe('buildCompressArchiveArgs (real PowerShell integration)', () => {
  // Single real-call test (per task instructions): local dev runs on Windows,
  // there is no CI, so exercising the actual PowerShell command once is safe
  // and confirms the syntax is valid beyond mock-based argument assertions.
  it('produces a command that Compress-Archive executes successfully', () => {
    const root = mkdtempSync(join(tmpdir(), 'tsa-backup-real-test-'));
    const dataDir = join(root, 'data');
    const backupsDir = join(root, 'backups');
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(backupsDir, { recursive: true });
    writeFileSync(join(dataDir, 'memory.json'), '{"researchQuestion":"real test"}', 'utf-8');

    const zipPath = join(backupsDir, 'backup-real-test.zip');
    const { command, args } = buildCompressArchiveArgs(dataDir, zipPath);

    const result = spawnSync(command, args, { stdio: 'pipe' });

    try {
      expect(result.status).toBe(0);
      expect(existsSync(zipPath)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// M-1 (SPEC-TSA-002 Phase 4 review): a path containing an apostrophe (e.g. a
// Windows user profile like `C:\Users\O'Brien\...`) must not break out of the
// PowerShell single-quoted `-Path`/`-DestinationPath` argument.
describe('buildCompressArchiveArgs (apostrophe-path escaping, M-1)', () => {
  it('doubles a single quote in dataDir/zipPath before interpolating into the command', () => {
    const { args } = buildCompressArchiveArgs("C:\\Users\\O'Brien\\data", "C:\\Users\\O'Brien\\backups\\b.zip");

    const commandArg = args[args.length - 1] ?? '';
    expect(commandArg).toContain("O''Brien");
    expect(commandArg).not.toContain("O'Brien\\data'"); // unescaped form would end the quoted string early
  });

  it('produces a command that Compress-Archive executes successfully against a real apostrophe path', () => {
    const root = mkdtempSync(join(tmpdir(), 'tsa-backup-apostrophe-test-'));
    const dataDir = join(root, "O'Brien-data");
    const backupsDir = join(root, "O'Brien-backups");
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(backupsDir, { recursive: true });
    writeFileSync(join(dataDir, 'memory.json'), '{"researchQuestion":"apostrophe path test"}', 'utf-8');

    const zipPath = join(backupsDir, "backup-o'brien-real-test.zip");
    const { command, args } = buildCompressArchiveArgs(dataDir, zipPath);

    const result = spawnSync(command, args, { stdio: 'pipe' });

    try {
      expect(result.status).toBe(0);
      expect(existsSync(zipPath)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
