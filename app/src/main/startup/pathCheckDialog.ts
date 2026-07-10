import { app, dialog } from 'electron';

import type { RunLocationVerdict } from './pathCheck';

/**
 * Shows a blocking native dialog with the verdict's Korean message, then
 * quits the app. Intended to be called right after `checkRunLocation`
 * returns `ok: false`, before any window is created.
 *
 * This is the only file in startup/ that imports `electron` — keeping
 * `pathCheck.ts` free of the dependency so its logic stays unit-testable
 * without an Electron runtime.
 */
export function showRunLocationErrorAndQuit(verdict: RunLocationVerdict): void {
  dialog.showMessageBoxSync({
    type: 'warning',
    title: '논문 작성 서포터',
    message: verdict.userMessage ?? '실행 위치를 확인해 주세요.',
    buttons: ['확인'],
  });

  app.quit();
}
