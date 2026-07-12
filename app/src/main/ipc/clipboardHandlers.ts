/**
 * IPC handler for `clipboard:read-text`.
 *
 * Split out as its own tiny domain module (same one-domain-per-file pattern
 * as `settingsHandlers.ts` etc.) since it has nothing to do with app
 * settings, projects, or research — it exists purely to power the
 * API-key input screens' "붙여넣기" convenience banner (wizard
 * `KeyInputStep`, settings `LlmProviderCard`).
 *
 * Security note: the clipboard may contain arbitrary sensitive user data
 * (not just API keys). This handler reads it and hands the raw text back to
 * the renderer as-is — it is NEVER logged, written to disk, or forwarded to
 * any other channel/service in this process. Callers on the renderer side
 * must not log the returned text either (see `useClipboardKeyBanner.ts`).
 */

import { clipboard, ipcMain } from 'electron';

import { IpcChannels } from '../../shared/ipc-channels';
import type { ClipboardReadTextResult } from '../../shared/ipc-channels';

/** Registers `clipboard:read-text`. */
export function registerClipboardHandlers(): void {
  ipcMain.handle(IpcChannels.CLIPBOARD_READ_TEXT, async (): Promise<ClipboardReadTextResult> => {
    return clipboard.readText();
  });
}
