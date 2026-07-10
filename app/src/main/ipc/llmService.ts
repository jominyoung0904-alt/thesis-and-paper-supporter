/**
 * Composes a single live {@link LlmAdapter} for the chat/research IPC
 * handlers from current settings + the key store, without ever changing the
 * core adapter contracts (NFR-LLM-001) — this module only consumes
 * `createAdapter`/`withRateLimit`/`withRetry` from `src/core/llm`.
 *
 * The composed adapter is cached and only rebuilt when `invalidate()` is
 * called (after the setup wizard/settings save a new provider or key) — a
 * fresh sliding-window rate limiter on every call would defeat its purpose.
 */

import type { AppSettings } from '../config/defaultSettings';
import type { KeyStore } from '../config/keyStore';
import { DEFAULT_MODELS } from '../config/defaultModels';
import { createAdapter } from '../../core/llm';
import type { LlmAdapter, LlmRequest, LlmResponse } from '../../core/llm';
// `withRateLimit`/`withRetry`/`FREE_TIER_RPM` are cross-cutting adapter
// decorators, not re-exported by `core/llm`'s public entry point (which only
// covers provider adapters + shared types) — imported directly from their
// own modules per this task's assigned file list.
import { FREE_TIER_RPM, withRateLimit } from '../../core/llm/rateLimiter';
import { withRetry } from '../../core/llm/retry';

/** Korean message shown when chat/research is attempted with no registered key. */
export const NO_KEY_MESSAGE = 'AI 기능을 사용하려면 먼저 설정에서 API 키를 등록해 주세요.';

export interface LlmService {
  /** Whether the currently selected provider has a usable stored key. */
  hasKey(): boolean;
  /** Model id for the currently selected provider (settings override, falling back to the default). */
  getModel(): string;
  /** Returns the cached (or freshly built) adapter for the current settings. Throws if no key is stored. */
  getAdapter(): LlmAdapter;
  /** Drops the cached adapter so the next `getAdapter()` call rebuilds it from current settings/keys. */
  invalidate(): void;
}

/** Wraps `adapter.chat` with automatic retry on transient failures (NFR-LLM-004). */
function withRetryAdapter(adapter: LlmAdapter): LlmAdapter {
  return {
    provider: adapter.provider,
    chat(req: LlmRequest): Promise<LlmResponse> {
      return withRetry(() => adapter.chat(req));
    },
  };
}

export function createLlmService(getSettings: () => AppSettings, keyStore: KeyStore): LlmService {
  let cached: LlmAdapter | null = null;

  function build(): LlmAdapter {
    const settings = getSettings();
    const { provider, mode } = settings.llm;

    const keyResult = keyStore.readKey(provider);
    if (!keyResult.ok) {
      throw new Error(NO_KEY_MESSAGE);
    }

    let adapter = createAdapter(provider, { baseUrl: settings.endpoints[provider], apiKey: keyResult.key });
    if (mode === 'free') {
      adapter = withRateLimit(adapter, { requestsPerMinute: FREE_TIER_RPM });
    }
    return withRetryAdapter(adapter);
  }

  return {
    hasKey(): boolean {
      return keyStore.readKey(getSettings().llm.provider).ok;
    },
    getModel(): string {
      const settings = getSettings();
      return settings.models[settings.llm.provider] ?? DEFAULT_MODELS[settings.llm.provider];
    },
    getAdapter(): LlmAdapter {
      if (!cached) {
        cached = build();
      }
      return cached;
    },
    invalidate(): void {
      cached = null;
    },
  };
}
