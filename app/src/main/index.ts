import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { app, dialog } from 'electron';

import { createElectronCryptoBackend, KeyStore } from './config/keyStore';
import { fetchRemoteConfig, mergeRemoteIntoSettings } from './config/remoteConfig';
import { loadSettings, saveSettings } from './config/settingsLoader';
import { ensureAppDirectories, resolveAppPaths } from './paths';
import { checkRunLocation } from './startup/pathCheck';
import { showRunLocationErrorAndQuit } from './startup/pathCheckDialog';
import { createMainWindow } from './window';

const REMOTE_CONFIG_TIMEOUT_MS = 5000;

/**
 * Entry point for the Electron main process.
 *
 * Startup order matters:
 * 1. Run-location check (zip preview / temp folder) — quit early with guidance.
 * 2. Path resolution and directory creation (data/, config/).
 * 3. Settings load (self-healing) and key store construction.
 * 4. Window creation — never blocked by the remote config fetch.
 * 5. Remote config fetch in the background; failures notify but never block
 *    (NFR-CFG-004: alert, then continue on local defaults).
 */
async function bootstrap(): Promise<void> {
  const verdict = checkRunLocation({
    execPath: process.execPath,
    tempDirs: [tmpdir()],
    isPackaged: app.isPackaged,
  });
  if (!verdict.ok) {
    showRunLocationErrorAndQuit(verdict);
    return;
  }

  const paths = resolveAppPaths({
    isPackaged: app.isPackaged,
    execPath: process.execPath,
    appPath: app.getAppPath(),
  });
  ensureAppDirectories(paths);

  const settingsResult = loadSettings(paths.settingsFile);
  const keyStore = new KeyStore(join(paths.dataDir, 'keys.json'), createElectronCryptoBackend());
  void keyStore; // Handed to IPC handlers in later tasks (T9 wizard, T6 adapters).

  createMainWindow();

  if (settingsResult.recovered && settingsResult.userMessage) {
    void dialog.showMessageBox({
      type: 'warning',
      title: '설정 파일 복구',
      message: settingsResult.userMessage,
      buttons: ['확인'],
    });
  }

  void refreshRemoteConfig(paths.settingsFile, settingsResult.settings.remoteConfigUrl, settingsResult.settings);
}

/**
 * Fetches the remote endpoints.json and merges endpoint overrides into local
 * settings. On failure, shows a non-blocking notice and keeps local values.
 */
async function refreshRemoteConfig(
  settingsFile: string,
  remoteConfigUrl: string,
  settings: ReturnType<typeof loadSettings>['settings'],
): Promise<void> {
  const result = await fetchRemoteConfig(remoteConfigUrl, REMOTE_CONFIG_TIMEOUT_MS);

  if (!result.ok) {
    void dialog.showMessageBox({
      type: 'info',
      title: '설정 서버 연결 안내',
      message: result.userMessage,
      buttons: ['확인'],
    });
    return;
  }

  const merged = mergeRemoteIntoSettings(settings, result.data);
  if (merged !== settings) {
    saveSettings(settingsFile, merged);
  }
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
