import type { AppSettings, EndpointsConfig, LlmProvider, ModelOverrides } from './defaultSettings';

/**
 * Optional overrides published in the remote `endpoints.json`. Every field
 * is optional so the remote file can ship a partial update (e.g. only a
 * rotated endpoint) without invalidating the rest.
 */
export interface RemoteConfigOverride {
  endpoints?: Partial<EndpointsConfig>;
  /**
   * Optional per-provider model id overrides, merged into
   * `settings.models` after validation (see `isAllowedModelOverride`).
   * Unknown/invalid values are dropped rather than rejecting the whole
   * payload.
   */
  models?: Partial<Record<LlmProvider, unknown>>;
  /** Optional Korean notice about pricing changes, shown as-is to the user. */
  pricingNotice?: string;
  /** Optional Korean announcement banner text. */
  announcement?: string;
  /** Free-form academic-API key hints (e.g. rotated public data portal keys). */
  academicKeys?: Record<string, unknown>;
}

export type RemoteConfigFailureReason = 'network' | 'timeout' | 'http-error' | 'parse-error' | 'invalid-url';

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
  // Security (audit H2): the remote config URL must be https — a plain-http
  // URL (typo or tampered settings) would let an on-path attacker inject
  // endpoint overrides, which C1 mitigation below would then have to catch.
  try {
    if (new URL(url).protocol !== 'https:') {
      return failure('invalid-url');
    }
  } catch {
    return failure('invalid-url');
  }

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
 * - `models.*`: remote values override local values per-provider when
 *   present in `remote.models` AND pass validation (see
 *   `isAllowedModelOverride`); invalid entries are dropped and logged rather
 *   than blocking the rest of the payload.
 * - `pricingNotice`, `announcement`, `academicKeys`: informational fields
 *   that are not part of the settings schema; callers read them directly off
 *   the fetch result instead of persisting them into `settings.json`.
 */
/**
 * Security (audit C1): API keys are sent as plain headers to whatever base
 * URL is configured per provider, so a remote override pointing an endpoint
 * at an attacker host would silently exfiltrate the user's keys. Every
 * remote endpoint override must therefore be https AND match the service's
 * known host allowlist; anything else is dropped.
 */
const ALLOWED_ENDPOINT_HOST_SUFFIXES: Record<keyof EndpointsConfig, string[]> = {
  claude: ['anthropic.com'],
  gemini: ['googleapis.com'],
  openai: ['openai.com'],
  kci: ['data.go.kr', 'kci.go.kr'],
  scienceon: ['kisti.re.kr'],
  semanticScholar: ['semanticscholar.org'],
  openalex: ['openalex.org'],
  googleCse: ['googleapis.com'],
  naver: ['naver.com'],
};

function isAllowedEndpointOverride(key: keyof EndpointsConfig, value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_ENDPOINT_HOST_SUFFIXES[key].some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

const VALID_LLM_PROVIDERS: readonly LlmProvider[] = ['gemini', 'claude', 'openai'];

/**
 * Security: a remote model-id override is passed straight into API request
 * bodies (`llmService.getModel()`), never used as a host/URL, so the only
 * risk is an attacker steering requests to an unexpected/expensive model or
 * injecting control characters. Restricted to a short, allowlisted charset
 * covering every real provider model id (letters, digits, `.`, `_`, `:`, `-`).
 */
const MODEL_ID_PATTERN = /^[a-zA-Z0-9._:-]+$/;
const MAX_MODEL_ID_LENGTH = 100;

function isAllowedModelOverride(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= MAX_MODEL_ID_LENGTH &&
    MODEL_ID_PATTERN.test(value)
  );
}

/**
 * Validates the remote `models` section, dropping (and logging) any entry
 * that is not a recognized provider key or fails {@link isAllowedModelOverride}.
 */
function sanitizeModelOverrides(remoteModels: RemoteConfigOverride['models']): Partial<ModelOverrides> {
  const sanitized: Partial<ModelOverrides> = {};
  if (!remoteModels) {
    return sanitized;
  }

  for (const key of Object.keys(remoteModels)) {
    if (!(VALID_LLM_PROVIDERS as readonly string[]).includes(key)) {
      console.warn(`[remoteConfig] ignoring unknown models.${key} override`);
      continue;
    }
    const provider = key as LlmProvider;
    const candidate = remoteModels[provider];
    if (isAllowedModelOverride(candidate)) {
      sanitized[provider] = candidate;
    } else {
      console.warn(`[remoteConfig] ignoring invalid models.${provider} override:`, candidate);
    }
  }

  return sanitized;
}

export function mergeRemoteIntoSettings(settings: AppSettings, remote: RemoteConfigOverride): AppSettings {
  const sanitizedEndpoints: Partial<EndpointsConfig> = {};
  if (remote.endpoints) {
    for (const key of Object.keys(ALLOWED_ENDPOINT_HOST_SUFFIXES) as (keyof EndpointsConfig)[]) {
      const candidate = remote.endpoints[key];
      if (candidate !== undefined && isAllowedEndpointOverride(key, candidate)) {
        sanitizedEndpoints[key] = candidate;
      }
    }
  }

  const sanitizedModels = sanitizeModelOverrides(remote.models);

  const hasEndpointChanges = Object.keys(sanitizedEndpoints).length > 0;
  const hasModelChanges = Object.keys(sanitizedModels).length > 0;

  if (!hasEndpointChanges && !hasModelChanges) {
    return settings;
  }

  return {
    ...settings,
    endpoints: hasEndpointChanges ? { ...settings.endpoints, ...sanitizedEndpoints } : settings.endpoints,
    models: hasModelChanges ? { ...settings.models, ...sanitizedModels } : settings.models,
  };
}
