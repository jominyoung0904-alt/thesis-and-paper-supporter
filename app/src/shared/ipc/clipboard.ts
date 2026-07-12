/**
 * `clipboard:read-text` result shape.
 *
 * Kept in its own domain file for consistency with the other domains under
 * `shared/ipc/`, even though the payload is a bare string — this channel
 * exists solely so the API-key input screens (wizard `KeyInputStep`,
 * settings `LlmProviderCard`) can offer a "붙여넣기" convenience banner when
 * a plausible key is already on the clipboard. The clipboard contents are
 * NEVER logged or persisted anywhere (see `main/ipc/clipboardHandlers.ts`'s
 * security note).
 */

// --- clipboard:read-text ---

/** Plain-text clipboard contents at read time. `''` when empty or non-text. */
export type ClipboardReadTextResult = string;
