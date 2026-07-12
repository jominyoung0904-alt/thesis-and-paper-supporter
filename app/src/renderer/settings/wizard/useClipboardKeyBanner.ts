/**
 * Shared clipboard-detection banner state for API-key input UIs (wizard
 * `KeyInputStep` and settings `LlmProviderCard`) — 실사용 피드백: pasting a
 * freshly copied API key required manually re-focusing the input after
 * switching back from the browser, so both surfaces now offer a "복사하신
 * 키가 있는 것 같아요" banner the moment the app regains focus with a
 * plausible key already on the clipboard.
 *
 * A React hook (not a component) so `apiKeyDetect.ts`'s pure
 * `shouldShowClipboardBanner` exposure check stays independently
 * unit-testable — only this file's mount/focus-listener plumbing is
 * untested (no component-test harness in this project; see
 * `vitest.config.ts`).
 */
import { useEffect, useState } from 'react';

import { shouldShowClipboardBanner } from './apiKeyDetect';
import type { LlmProvider } from './wizardTypes';

export interface ClipboardKeyBanner {
  /** Whether the "복사하신 키가 있는 것 같아요" banner should currently render. */
  visible: boolean;
  /** Trimmed clipboard text to fill the key field with when the user accepts. */
  suggestedKey: string;
  /** Hides the banner for the rest of this mount without touching the key field. */
  dismiss(): void;
  /** Call once `suggestedKey` has been copied into the key field — hides the banner like `dismiss()`. */
  accept(): void;
}

/**
 * Reads the clipboard on mount and on every `window` `focus` event, and
 * reports whether a paste-suggestion banner should be shown for `provider`.
 * The clipboard contents are held in local state only to feed the pure
 * visibility check above — never logged (see
 * `main/ipc/clipboardHandlers.ts`'s security note for the read side).
 */
export function useClipboardKeyBanner(
  provider: LlmProvider,
  currentKey: string,
  readClipboardText: () => Promise<string>,
): ClipboardKeyBanner {
  const [clipboardText, setClipboardText] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function poll(): void {
      readClipboardText()
        .then((text) => {
          if (!cancelled) setClipboardText(text);
        })
        .catch(() => {
          // Non-critical: the banner simply stays hidden if the read fails.
        });
    }

    poll();
    window.addEventListener('focus', poll);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', poll);
    };
  }, [readClipboardText]);

  const visible = shouldShowClipboardBanner({ currentKey, clipboardText, provider, dismissed });

  return {
    visible,
    suggestedKey: clipboardText.trim(),
    dismiss: () => setDismissed(true),
    accept: () => setDismissed(true),
  };
}
