/**
 * Shared runtime-guard utilities and cross-handler collaboration types for
 * IPC handlers.
 *
 * Security (audit H1): TypeScript types on IPC payloads are compile-time
 * only. A compromised renderer can invoke handlers with arbitrary values, so
 * every handler re-validates its payload at runtime before use — the guard
 * below is the shared primitive for that check.
 *
 * Split out of `handlers.ts` (T40, SPEC-TSA-002) so per-domain handler files
 * (settingsHandlers.ts / chatHandlers.ts / researchGateHandlers.ts) can share
 * these without importing from each other.
 */

import type { ConversationManager } from '../../core/chat/conversation';

/** Shown whenever a payload fails runtime validation before a handler proceeds. */
export const INVALID_REQUEST_MESSAGE = '잘못된 요청이에요. 앱을 다시 시작한 뒤 시도해 주세요.';

/** Whether `value` is a non-empty, non-whitespace-only string within `maxLength`. */
export function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

/**
 * Shared mutable holder for the single, lazily-built `ConversationManager`.
 *
 * `settings:save-provider-and-key` (settingsHandlers.ts) rebuilds it when the
 * provider/model changes, and `chat:send` (chatHandlers.ts) lazily builds it
 * on first use — both need to observe/replace the same instance without the
 * two handler files importing from each other, so `handlers.ts` (the
 * composition root) owns the actual mutable variable and passes this
 * accessor interface into both.
 */
export interface ConversationManagerHolder {
  /** Current instance, or null if never built yet. */
  get(): ConversationManager | null;
  /** Builds a fresh instance from current settings/keys. Does not store it. */
  build(): ConversationManager;
  /** Replaces the current instance. */
  set(manager: ConversationManager): void;
}
