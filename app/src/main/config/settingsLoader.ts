import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { AppSettings } from './defaultSettings';
import { createDefaultSettings } from './defaultSettings';

/** Korean, plain-language message shown when a corrupted settings file was recovered. */
const CORRUPTED_SETTINGS_MESSAGE =
  '설정 파일이 손상되어 있어서 기본값으로 새로 만들었어요. 이전 파일은 settings.json.bak으로 보관했어요.';

export interface SettingsLoadResult {
  settings: AppSettings;
  /** `true` when `settingsFile` did not exist and was created with defaults. */
  created: boolean;
  /** `true` when an existing file was unreadable/corrupted and had to be recovered. */
  recovered: boolean;
  /** Korean message to show the user. Present only when `recovered` is `true`. */
  userMessage?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-merges `override` on top of `defaults`: missing keys fall back to the
 * default value, keys present in `override` (including ones unknown to the
 * schema) are preserved as-is, and nested plain objects are merged
 * recursively rather than replaced wholesale.
 */
function deepMergeDefaults(
  defaults: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...defaults };

  for (const key of Object.keys(override)) {
    const overrideValue = override[key];
    const defaultValue = result[key];

    if (isPlainObject(overrideValue) && isPlainObject(defaultValue)) {
      result[key] = deepMergeDefaults(defaultValue, overrideValue);
    } else {
      result[key] = overrideValue;
    }
  }

  return result;
}

/** Merges parsed JSON on top of the schema defaults. Non-object input yields plain defaults. */
function mergeWithDefaults(parsed: unknown): AppSettings {
  const defaults = createDefaultSettings();

  if (!isPlainObject(parsed)) {
    return defaults;
  }

  return deepMergeDefaults(defaults as unknown as Record<string, unknown>, parsed) as unknown as AppSettings;
}

/** Writes `settings` to `settingsFile` atomically (write to a temp file, then rename). */
export function saveSettings(settingsFile: string, settings: AppSettings): void {
  mkdirSync(dirname(settingsFile), { recursive: true });

  const tempFile = `${settingsFile}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tempFile, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8');
  renameSync(tempFile, settingsFile);
}

/**
 * Backs up an unreadable/corrupted settings file to `<file>.bak` (best
 * effort — a failed backup never blocks recovery), regenerates defaults, and
 * persists them so the app can keep starting up (NFR-CFG-002).
 */
function recoverFromCorruption(settingsFile: string): SettingsLoadResult {
  const backupFile = `${settingsFile}.bak`;

  try {
    if (existsSync(backupFile)) {
      rmSync(backupFile, { force: true });
    }
    renameSync(settingsFile, backupFile);
  } catch {
    // Best-effort backup only; proceed to regenerate defaults regardless.
  }

  const settings = createDefaultSettings();
  saveSettings(settingsFile, settings);

  return { settings, created: false, recovered: true, userMessage: CORRUPTED_SETTINGS_MESSAGE };
}

/**
 * Loads settings from `settingsFile`, creating it with defaults when
 * missing, merging missing keys with defaults when present, and recovering
 * to defaults (with a `.bak` backup) when the file cannot be read or parsed.
 */
export function loadSettings(settingsFile: string): SettingsLoadResult {
  if (!existsSync(settingsFile)) {
    const settings = createDefaultSettings();
    saveSettings(settingsFile, settings);
    return { settings, created: true, recovered: false };
  }

  let raw: string;
  try {
    raw = readFileSync(settingsFile, 'utf-8');
  } catch {
    return recoverFromCorruption(settingsFile);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return recoverFromCorruption(settingsFile);
  }

  const settings = mergeWithDefaults(parsed);
  return { settings, created: false, recovered: false };
}

/** Overwrites `settingsFile` with fresh defaults and returns them (NFR-CFG-003). */
export function restoreDefaults(settingsFile: string): AppSettings {
  const settings = createDefaultSettings();
  saveSettings(settingsFile, settings);
  return settings;
}
