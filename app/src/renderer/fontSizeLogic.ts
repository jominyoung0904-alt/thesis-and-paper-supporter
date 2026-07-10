/**
 * Pure logic for the floating font-size control (실사용 피드백 #4b):
 * clamping, stepping, and localStorage persistence of the app-wide zoom
 * scale (percent, applied to `#root` via the CSS `zoom` property — see
 * `FontSizeControl.tsx` for why `zoom` replaced the earlier html-root
 * font-size approach in Task T35 fix#3). Framework-free so it is
 * unit-testable without a DOM, following the same split used by
 * `settingsScreenLogic.ts`.
 */

export const FONT_SCALE_MIN = 80;
export const FONT_SCALE_MAX = 150;
export const FONT_SCALE_STEP = 10;
export const FONT_SCALE_DEFAULT = 100;

/** localStorage key the scale is persisted under. */
export const FONT_SCALE_STORAGE_KEY = 'fontScale';

/** Rounds to the nearest step and clamps into [FONT_SCALE_MIN, FONT_SCALE_MAX]. */
export function clampFontScale(value: number): number {
  if (!Number.isFinite(value)) return FONT_SCALE_DEFAULT;
  const stepped = Math.round(value / FONT_SCALE_STEP) * FONT_SCALE_STEP;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, stepped));
}

/** One step up ("가⁺"), clamped at {@link FONT_SCALE_MAX}. */
export function increaseFontScale(current: number): number {
  return clampFontScale(current + FONT_SCALE_STEP);
}

/** One step down ("가⁻"), clamped at {@link FONT_SCALE_MIN}. */
export function decreaseFontScale(current: number): number {
  return clampFontScale(current - FONT_SCALE_STEP);
}

/** Minimal `localStorage`-shaped surface, so tests can inject a plain object instead of a DOM global. */
export interface ScaleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Loads the persisted scale, falling back to {@link FONT_SCALE_DEFAULT} when absent/invalid. */
export function loadFontScale(storage: ScaleStorage): number {
  const raw = storage.getItem(FONT_SCALE_STORAGE_KEY);
  if (raw === null) return FONT_SCALE_DEFAULT;
  const parsed = Number.parseInt(raw, 10);
  return clampFontScale(parsed);
}

/** Persists `scale` verbatim (already expected to be a clamped step value). */
export function saveFontScale(storage: ScaleStorage, scale: number): void {
  storage.setItem(FONT_SCALE_STORAGE_KEY, String(scale));
}
