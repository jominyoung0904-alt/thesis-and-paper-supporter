#!/usr/bin/env node
/**
 * Assembles the distributable release zip after `electron-builder` has
 * produced its portable-exe output (NFR-DEP-004).
 *
 * This script does NOT run electron-builder itself (that step downloads
 * large Electron binaries and takes several minutes) — run `npm run dist`
 * inside app/ first, then run this script directly (or `npm run package`,
 * which chains both) to assemble the final release-zip/ folder + archive.
 *
 * Layout produced:
 *   release-zip/
 *     논문작성서포터/
 *       논문서포터.exe                  (electron-builder portable output)
 *       처음이라면_읽어주세요.html      (repo-root onboarding doc, SmartScreen guidance)
 *   release-zip/논문작성서포터.zip
 *
 * data/ and config/ are intentionally NOT copied here — the portable app
 * creates them itself next to the exe on first run (see
 * `src/main/paths.ts`), so shipping empty placeholders would just be dead
 * weight in the zip.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const APP_DIR = join(REPO_ROOT, 'app');
// Matches electron-builder.yml's `directories.output: release`.
const RELEASE_DIR = join(APP_DIR, 'release');
const ONBOARDING_HTML = join(REPO_ROOT, '처음이라면_읽어주세요.html');
const OUT_ROOT = join(REPO_ROOT, 'release-zip');
const OUT_FOLDER_NAME = '논문작성서포터';
const OUT_FOLDER = join(OUT_ROOT, OUT_FOLDER_NAME);
const ZIP_PATH = join(OUT_ROOT, `${OUT_FOLDER_NAME}.zip`);

/** Finds the built portable .exe inside app/release (electron-builder's `directories.output`). */
function findPortableExe() {
  if (!existsSync(RELEASE_DIR)) {
    return undefined;
  }
  return readdirSync(RELEASE_DIR).find((name) => name.endsWith('.exe'));
}

/** Node has no built-in directory-zip API, so shell out to PowerShell's Compress-Archive — acceptable since this app only ships a Windows build. */
function compressToZip() {
  if (existsSync(ZIP_PATH)) {
    rmSync(ZIP_PATH);
  }

  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', `Compress-Archive -Path '${OUT_FOLDER}' -DestinationPath '${ZIP_PATH}' -Force`],
    { stdio: 'inherit' },
  );

  if (result.status !== 0) {
    console.error(
      `[package-zip] Compress-Archive failed — the release folder is still available uncompressed at ${OUT_FOLDER}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`[package-zip] Zip created: ${ZIP_PATH}`);
}

function main() {
  const exeName = findPortableExe();
  if (!exeName) {
    console.error(
      `[package-zip] No .exe found in ${RELEASE_DIR}. Run "npm run dist" inside app/ first ` +
        '(electron-builder must finish before this script can assemble the release zip).',
    );
    process.exitCode = 1;
    return;
  }

  if (!existsSync(ONBOARDING_HTML)) {
    console.error(`[package-zip] Missing onboarding doc at ${ONBOARDING_HTML}.`);
    process.exitCode = 1;
    return;
  }

  rmSync(OUT_ROOT, { recursive: true, force: true });
  mkdirSync(OUT_FOLDER, { recursive: true });

  copyFileSync(join(RELEASE_DIR, exeName), join(OUT_FOLDER, exeName));
  // Placed at the zip root's app folder (not nested) so SmartScreen guidance
  // is the first thing a user sees on extraction (NFR-DEP-004).
  copyFileSync(ONBOARDING_HTML, join(OUT_FOLDER, '처음이라면_읽어주세요.html'));

  console.log(`[package-zip] Assembled release folder: ${OUT_FOLDER}`);
  console.log('[package-zip] data/ and config/ are not bundled — the app creates them on first run.');

  compressToZip();
}

main();
