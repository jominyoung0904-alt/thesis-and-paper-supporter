import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDefaultSettings } from '../../src/main/config/defaultSettings';
import { loadSettings, restoreDefaults, saveSettings } from '../../src/main/config/settingsLoader';

describe('settingsLoader', () => {
  let workDir: string;
  let settingsFile: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'tsa-settings-test-'));
    settingsFile = join(workDir, 'config', 'settings.json');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  describe('loadSettings', () => {
    it('creates the settings file with defaults when it does not exist', () => {
      expect(existsSync(settingsFile)).toBe(false);

      const result = loadSettings(settingsFile);

      expect(result.created).toBe(true);
      expect(result.recovered).toBe(false);
      expect(result.settings).toEqual(createDefaultSettings());
      expect(existsSync(settingsFile)).toBe(true);

      const onDisk = JSON.parse(readFileSync(settingsFile, 'utf-8'));
      expect(onDisk).toEqual(createDefaultSettings());
    });

    it('merges missing keys with defaults while preserving unknown keys', () => {
      const partial = {
        llm: { provider: 'claude' },
        customUserNote: 'do not delete this',
      };
      mkdirSync(join(workDir, 'config'), { recursive: true });
      writeFileSync(settingsFile, JSON.stringify(partial), 'utf-8');

      const result = loadSettings(settingsFile);

      expect(result.created).toBe(false);
      expect(result.recovered).toBe(false);
      expect(result.settings.llm.provider).toBe('claude');
      // Missing key falls back to default.
      expect(result.settings.llm.mode).toBe('free');
      expect(result.settings.endpoints).toEqual(createDefaultSettings().endpoints);
      // Unknown key is preserved, not dropped.
      expect((result.settings as unknown as Record<string, unknown>).customUserNote).toBe(
        'do not delete this',
      );
    });

    it('backs up and recovers from a corrupted (unparsable) settings file', () => {
      mkdirSync(join(workDir, 'config'), { recursive: true });
      writeFileSync(settingsFile, '{ not valid json ][', 'utf-8');

      const result = loadSettings(settingsFile);

      expect(result.created).toBe(false);
      expect(result.recovered).toBe(true);
      expect(result.userMessage).toMatch(/손상/);
      expect(result.settings).toEqual(createDefaultSettings());

      // Original corrupted content preserved in .bak, valid defaults now on disk.
      const backupContent = readFileSync(`${settingsFile}.bak`, 'utf-8');
      expect(backupContent).toBe('{ not valid json ][');

      const onDisk = JSON.parse(readFileSync(settingsFile, 'utf-8'));
      expect(onDisk).toEqual(createDefaultSettings());
    });
  });

  describe('saveSettings', () => {
    it('writes valid JSON atomically and creates the config directory if missing', () => {
      expect(existsSync(join(workDir, 'config'))).toBe(false);

      const settings = createDefaultSettings();
      settings.llm.provider = 'openai';
      saveSettings(settingsFile, settings);

      expect(existsSync(settingsFile)).toBe(true);
      const onDisk = JSON.parse(readFileSync(settingsFile, 'utf-8'));
      expect(onDisk.llm.provider).toBe('openai');
    });
  });

  describe('restoreDefaults', () => {
    it('overwrites custom settings with fresh defaults', () => {
      const custom = createDefaultSettings();
      custom.llm.provider = 'openai';
      custom.proxy.enabled = true;
      saveSettings(settingsFile, custom);

      const restored = restoreDefaults(settingsFile);

      expect(restored).toEqual(createDefaultSettings());
      const onDisk = JSON.parse(readFileSync(settingsFile, 'utf-8'));
      expect(onDisk).toEqual(createDefaultSettings());
    });
  });
});
