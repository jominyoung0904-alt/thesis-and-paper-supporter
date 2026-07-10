/**
 * Floating vertical font-size control (실사용 피드백 #4b), fixed to the
 * right edge of the screen on every tab. Scales the whole app between
 * 80%-150% in 10% steps; the choice persists across restarts via
 * `localStorage`. Paired with `window.ts`'s `autoHideMenuBar: true`
 * (피드백 #4a) — together these give users a way to resize UI text without
 * the default (English) Electron menu getting in the way.
 *
 * Task T35 fix#3: the app's CSS is written entirely in `px` (no `rem`/`em`
 * anywhere), so scaling `document.documentElement.style.fontSize` — the
 * previous approach — had zero visual effect: nothing was ever sized
 * relative to the root font-size. This control now applies the Chromium
 * `zoom` CSS property (Electron always runs on Chromium, so this is safe
 * here even though `zoom` isn't a standard property) to `#root`, which
 * rescales the entire rendered subtree — `px` values included. `#root` is
 * targeted (not `<html>`) so this component — mounted in a *separate* DOM
 * root outside `#root` (see `main.tsx`) — is never zoomed along with it.
 */
import { useEffect, useState } from 'react';

import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  decreaseFontScale,
  increaseFontScale,
  loadFontScale,
  saveFontScale,
} from './fontSizeLogic';
import './fontSizeControl.css';

export function FontSizeControl(): JSX.Element {
  const [scale, setScale] = useState<number>(() => loadFontScale(window.localStorage));

  useEffect(() => {
    const appRoot = document.getElementById('root');
    // `zoom` isn't in the standard `CSSStyleDeclaration` type, so it's set
    // via `setProperty` rather than `style.zoom = ...`.
    appRoot?.style.setProperty('zoom', `${scale}%`);
  }, [scale]);

  function apply(next: number): void {
    setScale(next);
    saveFontScale(window.localStorage, next);
  }

  return (
    <div className="font-size-control" role="group" aria-label="글자 크기 조절">
      <button
        type="button"
        className="font-size-btn"
        title="글자 크기 줄이기"
        disabled={scale <= FONT_SCALE_MIN}
        onClick={() => apply(decreaseFontScale(scale))}
      >
        가⁻
      </button>
      <span className="font-size-value">{scale}%</span>
      <button
        type="button"
        className="font-size-btn"
        title="글자 크기 키우기"
        disabled={scale >= FONT_SCALE_MAX}
        onClick={() => apply(increaseFontScale(scale))}
      >
        가⁺
      </button>
    </div>
  );
}
