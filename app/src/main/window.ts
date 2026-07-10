import { join } from 'node:path';

import { BrowserWindow } from 'electron';

/**
 * Creates the single main window for the app. The renderer's dev server URL
 * is used in development; the built static bundle is loaded in packaged mode.
 *
 * `preload.js` is the compiled output of `src/main/preload.ts` (same output
 * directory as this file — see `tsconfig.main.json`'s `rootDir`/`outDir`) and
 * exposes `window.thesisApi` to the renderer via `contextBridge`.
 */
export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: '논문 작성 서포터',
    // Hides the default English menu bar (File/Edit/View/...) by default —
    // non-technical users found it confusing; Alt still reveals it on demand.
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, 'preload.js'),
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(join(__dirname, '..', '..', 'renderer', 'index.html'));
  }

  return win;
}
