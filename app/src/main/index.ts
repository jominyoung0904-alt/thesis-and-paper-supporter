import { app } from 'electron';

import { ensureAppDirectories, resolveAppPaths } from './paths';
import { createMainWindow } from './window';

/**
 * Entry point for the Electron main process.
 *
 * Path resolution (app/data/config) always happens first, before any window
 * is created, so downstream modules (config loader, memory store, etc. in
 * later tasks) can rely on `data/` and `config/` already existing.
 */
function bootstrap(): void {
  const paths = resolveAppPaths({
    isPackaged: app.isPackaged,
    execPath: process.execPath,
    appPath: app.getAppPath(),
  });

  ensureAppDirectories(paths);

  createMainWindow();
}

app.whenReady().then(bootstrap).catch((error: unknown) => {
  console.error('Failed to bootstrap the app:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
