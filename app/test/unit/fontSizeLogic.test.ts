import { describe, expect, it } from 'vitest';

import {
  FONT_SCALE_DEFAULT,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STORAGE_KEY,
  clampFontScale,
  decreaseFontScale,
  increaseFontScale,
  loadFontScale,
  saveFontScale,
  type ScaleStorage,
} from '../../src/renderer/fontSizeLogic';

/** In-memory stand-in for `localStorage` (Node has no DOM globals). */
function createMemoryStorage(initial: Record<string, string> = {}): ScaleStorage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

describe('clampFontScale', () => {
  it('keeps an in-range, already-stepped value unchanged', () => {
    expect(clampFontScale(110)).toBe(110);
  });

  it('rounds to the nearest 10% step', () => {
    expect(clampFontScale(104)).toBe(100);
    expect(clampFontScale(106)).toBe(110);
  });

  it('clamps below FONT_SCALE_MIN up to the minimum', () => {
    expect(clampFontScale(10)).toBe(FONT_SCALE_MIN);
    expect(clampFontScale(-50)).toBe(FONT_SCALE_MIN);
  });

  it('clamps above FONT_SCALE_MAX down to the maximum', () => {
    expect(clampFontScale(500)).toBe(FONT_SCALE_MAX);
  });

  it('falls back to the default for non-finite input', () => {
    expect(clampFontScale(Number.NaN)).toBe(FONT_SCALE_DEFAULT);
    expect(clampFontScale(Number.POSITIVE_INFINITY)).toBe(FONT_SCALE_DEFAULT);
  });
});

describe('increaseFontScale / decreaseFontScale', () => {
  it('steps up by FONT_SCALE_STEP', () => {
    expect(increaseFontScale(100)).toBe(110);
  });

  it('does not exceed FONT_SCALE_MAX', () => {
    expect(increaseFontScale(FONT_SCALE_MAX)).toBe(FONT_SCALE_MAX);
  });

  it('steps down by FONT_SCALE_STEP', () => {
    expect(decreaseFontScale(100)).toBe(90);
  });

  it('does not go below FONT_SCALE_MIN', () => {
    expect(decreaseFontScale(FONT_SCALE_MIN)).toBe(FONT_SCALE_MIN);
  });
});

describe('loadFontScale', () => {
  it('returns FONT_SCALE_DEFAULT when nothing is persisted', () => {
    const storage = createMemoryStorage();
    expect(loadFontScale(storage)).toBe(FONT_SCALE_DEFAULT);
  });

  it('returns the persisted, clamped scale', () => {
    const storage = createMemoryStorage({ [FONT_SCALE_STORAGE_KEY]: '130' });
    expect(loadFontScale(storage)).toBe(130);
  });

  it('falls back to FONT_SCALE_DEFAULT for a corrupted value', () => {
    const storage = createMemoryStorage({ [FONT_SCALE_STORAGE_KEY]: 'not-a-number' });
    expect(loadFontScale(storage)).toBe(FONT_SCALE_DEFAULT);
  });

  it('clamps an out-of-range persisted value', () => {
    const storage = createMemoryStorage({ [FONT_SCALE_STORAGE_KEY]: '999' });
    expect(loadFontScale(storage)).toBe(FONT_SCALE_MAX);
  });
});

describe('saveFontScale', () => {
  it('persists the scale so a later loadFontScale call round-trips it', () => {
    const storage = createMemoryStorage();
    saveFontScale(storage, 140);
    expect(loadFontScale(storage)).toBe(140);
  });
});
