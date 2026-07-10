/**
 * Floating vertical font-size control (실사용 피드백 #4b), fixed to the
 * right edge of the screen on every tab. Scales the html-root font-size
 * between 80%-150% in 10% steps; the choice persists across restarts via
 * `localStorage`. Paired with `window.ts`'s `autoHideMenuBar: true`
 * (피드백 #4a) — together these give users a way to resize UI text without
 * the default (English) Electron menu getting in the way.
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
    document.documentElement.style.fontSize = `${scale}%`;
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
