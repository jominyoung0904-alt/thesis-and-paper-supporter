import { join } from 'node:path';

import { BrowserWindow } from 'electron';

/**
 * Creates the single main window for the app. The renderer's dev server URL
 * is used in development; the built static bundle is loaded in packaged mode.
 */
export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: '논문 작성 서포터',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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
