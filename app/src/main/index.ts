import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { app, dialog } from 'electron';

import { createElectronCryptoBackend, KeyStore } from './config/keyStore';
import { fetchRemoteConfig, mergeRemoteIntoSettings } from './config/remoteConfig';
import { loadSettings, saveSettings } from './config/settingsLoader';
import { registerIpcHandlers } from './ipc/handlers';
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
  // electron-builder portable builds self-extract to %TEMP% and run from
  // there; this env var carries the directory the user actually launched.
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;

  const verdict = checkRunLocation({
    execPath: process.execPath,
    portableDir,
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
    portableDir,
    appPath: app.getAppPath(),
  });
  ensureAppDirectories(paths);

  const settingsResult = loadSettings(paths.settingsFile);
  const keyStore = new KeyStore(join(paths.dataDir, 'keys.json'), createElectronCryptoBackend());

  // Mutable settings holder shared with the IPC handlers: the setup wizard /
  // settings screen may persist a new provider/mode via `setSettings`, and
  // every handler thereafter must see the updated value via `getSettings`.
  let currentSettings = settingsResult.settings;

  registerIpcHandlers({
    keyStore,
    settingsFile: paths.settingsFile,
    getSettings: () => currentSettings,
    setSettings: (settings) => {
      currentSettings = settings;
    },
    // MVP: a single project's memory lives at a fixed path (see MemoryStore's
    // doc comment; multi-project support is out of scope for this sprint).
    memoryFilePath: join(paths.dataDir, 'projects', 'default', 'memory.json'),
  });

  createMainWindow();

  if (settingsResult.recovered && settingsResult.userMessage) {
    void dialog.showMessageBox({
      type: 'warning',
      title: '설정 파일 복구',
      message: settingsResult.userMessage,
      buttons: ['확인'],
    });
  }

  void refreshRemoteConfig(paths.settingsFile, currentSettings.remoteConfigUrl, currentSettings, (updated) => {
    currentSettings = updated;
  });
}

/**
 * Fetches the remote endpoints.json and merges endpoint overrides into local
 * settings. On failure, shows a non-blocking notice and keeps local values.
 * On success, `onMerged` propagates the updated settings into the shared
 * `currentSettings` holder so IPC handlers (LLM base URLs, academic client
 * endpoints) see the refreshed endpoints without an app restart.
 */
/**
 * The default settings ship with a placeholder remote-config URL until the
 * real hosting domain is decided. Fetching it would fail on every launch and
 * show the failure dialog each time — skip silently instead.
 */
function isPlaceholderRemoteConfigUrl(url: string): boolean {
  return url.includes('OWNER.github.io');
}

async function refreshRemoteConfig(
  settingsFile: string,
  remoteConfigUrl: string,
  settings: ReturnType<typeof loadSettings>['settings'],
  onMerged: (settings: ReturnType<typeof loadSettings>['settings']) => void,
): Promise<void> {
  if (isPlaceholderRemoteConfigUrl(remoteConfigUrl)) {
    return;
  }

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
    onMerged(merged);
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
