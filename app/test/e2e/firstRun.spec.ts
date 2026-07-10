/**
 * T29 (SPEC-TSA-001, Wave 5) — first-run E2E, part 1: bootstrap-level
 * scenarios that need no Electron runtime and no LLM at all (S1, zip
 * detection, S4 path-convention prep, settings recovery). Uses only real
 * filesystem I/O against an isolated temp directory per test.
 *
 * Wizard/chat/research journeys that need a mocked `electron`/`core/llm` live
 * in `firstRunWizardChat.spec.ts` and `firstRunResearch.spec.ts` respectively
 * (split to keep each file well under the 300-line hard limit).
 */

import { basename, dirname, join, sep } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { createDefaultSettings } from '../../src/main/config/defaultSettings';
import { KeyStore } from '../../src/main/config/keyStore';
import { loadSettings } from '../../src/main/config/settingsLoader';
import { ensureAppDirectories } from '../../src/main/paths';
import { checkRunLocation } from '../../src/main/startup/pathCheck';
import { createReadyWorkspace, createTempWorkspace, MockCryptoBackend, type TempWorkspace } from './firstRunHelpers';

describe('S1 — 첫 실행: 임시 디렉터리에서 부트스트랩 시퀀스 완주', () => {
  let ws: TempWorkspace | undefined;

  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  it('starts with no data/ or config/ directories present', () => {
    ws = createTempWorkspace('tsa-e2e-s1-empty-');
    expect(existsSync(ws.paths.dataDir)).toBe(false);
    expect(existsSync(ws.paths.configDir)).toBe(false);
  });

  it('resolveAppPaths -> ensureAppDirectories -> loadSettings -> empty keyStore -> firstRun verdict', () => {
    ws = createTempWorkspace('tsa-e2e-s1-full-');

    ensureAppDirectories(ws.paths);
    expect(existsSync(ws.paths.dataDir)).toBe(true);
    expect(existsSync(ws.paths.configDir)).toBe(true);

    const loadResult = loadSettings(ws.paths.settingsFile);
    expect(loadResult.created).toBe(true);
    expect(loadResult.settings).toEqual(createDefaultSettings());

    // NFR-CFG-001: a non-technical user must be able to open this in Notepad.
    const raw = readFileSync(ws.paths.settingsFile, 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(raw).toContain('\n'); // pretty-printed, not a single JSON blob
    expect(JSON.parse(raw)).toEqual(createDefaultSettings());

    const keyStore = new KeyStore(join(ws.paths.dataDir, 'keys.json'), new MockCryptoBackend());
    expect(keyStore.listStoredProviders()).toEqual([]);

    // Mirrors handlers.ts's `app:get-startup-state` verdict exactly.
    const firstRun = keyStore.listStoredProviders().length === 0;
    expect(firstRun).toBe(true);
  });
});

describe('zip 미해제 감지 (checkRunLocation, NFR-DEP-002)', () => {
  it('blocks launch from the OS temp dir in packaged mode, with Korean guidance', () => {
    const execPath = join(tmpdir(), 'random-extract-dir', '논문서포터.exe');

    const verdict = checkRunLocation({ execPath, tempDirs: [tmpdir()], isPackaged: true });

    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('temp-folder');
    expect(verdict.userMessage).toContain('압축');
  });

  it('blocks the Explorer zip-preview path pattern even outside a recognized temp root', () => {
    const execPath = join('C:', 'Users', 'test', 'AppData', 'Local', 'Temp1_논문서포터.zip', '논문서포터.exe');

    const verdict = checkRunLocation({ execPath, tempDirs: [join('C:', 'other-temp')], isPackaged: true });

    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('zip-preview');
    expect(verdict.userMessage).toContain('압축');
  });

  it('always passes in dev mode, even when launched from a temp path', () => {
    const execPath = join(tmpdir(), '논문서포터.exe');

    const verdict = checkRunLocation({ execPath, tempDirs: [tmpdir()], isPackaged: false });

    expect(verdict.ok).toBe(true);
  });

  it('allows launch from a normal extracted folder in packaged mode', () => {
    const execPath = join('C:', 'Users', 'test', 'Documents', '논문서포터', '논문서포터.exe');

    const verdict = checkRunLocation({ execPath, tempDirs: [tmpdir()], isPackaged: true });

    expect(verdict.ok).toBe(true);
  });
});

describe('S4 대비 — 키 제외 내보내기 경로 규약 (기능 미구현, 규약만 검증)', () => {
  let ws: TempWorkspace | undefined;

  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  it('keys.json sits directly under data/, separate from per-project content subdirectories', () => {
    ws = createReadyWorkspace('tsa-e2e-s4-');
    const keysFile = join(ws.paths.dataDir, 'keys.json');
    const memoryFile = join(ws.paths.dataDir, 'projects', 'default', 'memory.json');

    expect(dirname(keysFile)).toBe(ws.paths.dataDir);
    expect(memoryFile.startsWith(join(ws.paths.dataDir, 'projects') + sep)).toBe(true);

    // A naive "exclude by basename" export filter is sufficient to keep the
    // key file out of any exported bundle, since it never shares a directory
    // with project content — this is the convention a future export routine
    // (NFR-RISK-004) can rely on.
    const candidateFiles = [keysFile, memoryFile];
    const exportable = candidateFiles.filter((f) => basename(f) !== 'keys.json');
    expect(exportable).toEqual([memoryFile]);
  });
});

describe('손상된 settings.json 복구 (.bak) 여정 (NFR-CFG-003)', () => {
  let ws: TempWorkspace | undefined;

  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  it('backs up the corrupted file and starts fresh on invalid JSON', () => {
    ws = createReadyWorkspace('tsa-e2e-s9-');
    writeFileSync(ws.paths.settingsFile, '{not valid json at all', 'utf-8');

    const result = loadSettings(ws.paths.settingsFile);

    expect(result.recovered).toBe(true);
    expect(result.userMessage).toContain('손상');
    expect(result.settings).toEqual(createDefaultSettings());

    const backupPath = `${ws.paths.settingsFile}.bak`;
    expect(existsSync(backupPath)).toBe(true);
    expect(readFileSync(backupPath, 'utf-8')).toBe('{not valid json at all');

    const recovered = JSON.parse(readFileSync(ws.paths.settingsFile, 'utf-8'));
    expect(recovered).toEqual(createDefaultSettings());
  });

  it('recovers again without crashing when corruption happens twice in a row', () => {
    ws = createReadyWorkspace('tsa-e2e-s9b-');
    writeFileSync(ws.paths.settingsFile, '{{{broken}}}', 'utf-8');
    loadSettings(ws.paths.settingsFile);

    writeFileSync(ws.paths.settingsFile, '{{{broken again}}}', 'utf-8');
    const second = loadSettings(ws.paths.settingsFile);

    expect(second.recovered).toBe(true);
    expect(readFileSync(`${ws.paths.settingsFile}.bak`, 'utf-8')).toBe('{{{broken again}}}');
  });
});
