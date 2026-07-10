import type { AppSettings, EndpointsConfig } from './defaultSettings';

/**
 * Optional overrides published in the remote `endpoints.json`. Every field
 * is optional so the remote file can ship a partial update (e.g. only a
 * rotated endpoint) without invalidating the rest.
 */
export interface RemoteConfigOverride {
  endpoints?: Partial<EndpointsConfig>;
  /** Free-form model-name/version hints, not part of the persisted schema. */
  models?: Record<string, unknown>;
  /** Optional Korean notice about pricing changes, shown as-is to the user. */
  pricingNotice?: string;
  /** Optional Korean announcement banner text. */
  announcement?: string;
  /** Free-form academic-API key hints (e.g. rotated public data portal keys). */
  academicKeys?: Record<string, unknown>;
}

export type RemoteConfigFailureReason = 'network' | 'timeout' | 'http-error' | 'parse-error';

export interface RemoteConfigSuccess {
  ok: true;
  data: RemoteConfigOverride;
}

export interface RemoteConfigFailure {
  ok: false;
  reason: RemoteConfigFailureReason;
  /** Korean, plain-language message ready to show the user. */
  userMessage: string;
}

export type RemoteConfigResult = RemoteConfigSuccess | RemoteConfigFailure;

/**
 * Shown for every failure branch per NFR-CFG-004's confirmed policy: remote
 * config failures never block startup, the caller just surfaces this
 * message (e.g. in a dialog) and continues with local defaults.
 */
const CONNECTION_FAILURE_MESSAGE = '설정 서버에 연결하지 못했어요. 로컬 기본값으로 동작합니다.';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failure(reason: RemoteConfigFailureReason): RemoteConfigFailure {
  return { ok: false, reason, userMessage: CONNECTION_FAILURE_MESSAGE };
}

/**
 * Fetches the remote `endpoints.json` config. Never throws — every failure
 * mode (network error, timeout, non-2xx HTTP status, malformed JSON) is
 * captured and returned as a `RemoteConfigFailure` so callers can fall back
 * to local defaults without special-casing exceptions (NFR-CFG-004).
 */
export async function fetchRemoteConfig(url: string, timeoutMs: number): Promise<RemoteConfigResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      return failure('http-error');
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return failure('parse-error');
    }

    if (!isPlainObject(data)) {
      return failure('parse-error');
    }

    return { ok: true, data: data as RemoteConfigOverride };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    return failure(isAbort ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Merges a successful remote config payload into local settings.
 *
 * Merge policy — remote wins, except for keys the user owns locally:
 * - `endpoints.*`: remote values override local values per-key when present
 *   in `remote.endpoints`; endpoints missing from the remote payload keep
 *   their local value.
 * - `llm.provider`, `llm.mode`, `proxy.*`, `remoteConfigUrl`: always kept as
 *   the user's local value — the remote config must never silently change a
 *   user preference.
 * - `models`, `pricingNotice`, `announcement`, `academicKeys`: informational
 *   fields that are not part of the settings schema; callers read them
 *   directly off the fetch result instead of persisting them into
 *   `settings.json`.
 */
export function mergeRemoteIntoSettings(settings: AppSettings, remote: RemoteConfigOverride): AppSettings {
  if (!remote.endpoints) {
    return settings;
  }

  return {
    ...settings,
    endpoints: {
      ...settings.endpoints,
      ...remote.endpoints,
    },
  };
}
