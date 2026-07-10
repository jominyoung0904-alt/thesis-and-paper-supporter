import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkRunLocation } from '../../src/main/startup/pathCheck';

describe('checkRunLocation', () => {
  it('always passes in dev mode, even from a temp-like path', () => {
    const execPath = join('C:', 'Users', 'test', 'AppData', 'Local', 'Temp', '논문서포터.exe');

    const verdict = checkRunLocation({
      execPath,
      tempDirs: [join('C:', 'Users', 'test', 'AppData', 'Local', 'Temp')],
      isPackaged: false,
    });

    expect(verdict.ok).toBe(true);
  });

  it('fails when the packaged exe runs from inside an injected temp directory', () => {
    const tempDir = join('C:', 'Users', 'test', 'AppData', 'Local', 'Temp');
    const execPath = join(tempDir, '논문서포터', '논문서포터.exe');

    const verdict = checkRunLocation({ execPath, tempDirs: [tempDir], isPackaged: true });

    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('temp-folder');
    expect(verdict.userMessage).toContain('임시 폴더에서 실행되고 있어요');
  });

  it('detects the Explorer zip-preview path pattern (Temp1_*.zip\\)', () => {
    const execPath = join(
      'C:',
      'Users',
      'test',
      'AppData',
      'Local',
      'Temp',
      'Temp1_논문서포터.zip',
      '논문서포터',
      '논문서포터.exe',
    );

    const verdict = checkRunLocation({
      execPath,
      tempDirs: [join('C:', 'Users', 'test', 'AppData', 'Local', 'Temp')],
      isPackaged: true,
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('zip-preview');
  });

  it('passes when the packaged exe runs from a normal extracted folder', () => {
    const execPath = join('C:', 'Users', 'test', 'Desktop', '논문서포터', '논문서포터.exe');

    const verdict = checkRunLocation({
      execPath,
      tempDirs: [join('C:', 'Users', 'test', 'AppData', 'Local', 'Temp')],
      isPackaged: true,
    });

    expect(verdict.ok).toBe(true);
    expect(verdict.reason).toBeUndefined();
  });

  it('detects temp-folder runs regardless of drive-letter/segment case', () => {
    const tempDir = join('C:', 'Users', 'test', 'AppData', 'Local', 'Temp');
    const execPath = join('c:', 'USERS', 'test', 'appdata', 'local', 'TEMP', '논문서포터.exe');

    const verdict = checkRunLocation({ execPath, tempDirs: [tempDir], isPackaged: true });

    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('temp-folder');
  });

  it('does not false-positive on a folder that merely starts with the temp dir name', () => {
    // e.g. "...\Temp\" vs a sibling "...\TempProjects\" — must not match as a prefix.
    const tempDir = join('C:', 'Users', 'test', 'AppData', 'Local', 'Temp');
    const execPath = join(
      'C:',
      'Users',
      'test',
      'AppData',
      'Local',
      'TempProjects',
      '논문서포터.exe',
    );

    const verdict = checkRunLocation({ execPath, tempDirs: [tempDir], isPackaged: true });

    expect(verdict.ok).toBe(true);
  });

  it('falls back to the OS temp dir when no tempDirs are provided', () => {
    const execPath = join('C:', 'Users', 'test', 'Desktop', '논문서포터', '논문서포터.exe');

    const verdict = checkRunLocation({ execPath, tempDirs: [], isPackaged: true });

    expect(verdict.ok).toBe(true);
  });
});
