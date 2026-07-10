/**
 * Settings schema and default values for `config/settings.json`.
 *
 * This file is the single source of truth for the on-disk settings shape.
 * Keys are kept flat and self-explanatory so a non-technical user can open
 * the file in Notepad and edit it safely (NFR-CFG-001).
 */

/** Supported LLM providers the user can pick as their default. */
export type LlmProvider = 'gemini' | 'claude' | 'openai';

/** Free-tier vs paid-tier usage mode for the selected provider. */
export type LlmMode = 'free' | 'paid';

/** Base URLs for every external service the app talks to. */
export interface EndpointsConfig {
  /** Anthropic Claude API base URL. */
  claude: string;
  /** Google Gemini (Generative Language API) base URL. */
  gemini: string;
  /** OpenAI API base URL. */
  openai: string;
  /** KCI (Korea Citation Index) via the public data portal base URL. */
  kci: string;
  /** ScienceON (KISTI) API gateway base URL. */
  scienceon: string;
  /** Semantic Scholar API base URL. */
  semanticScholar: string;
  /** OpenAlex API base URL — keyless, no IP/MAC restriction (SPEC-TSA-001 후속). */
  openalex: string;
}

/** Optional outbound HTTP proxy configuration, e.g. for restricted networks. */
export interface ProxyConfig {
  enabled: boolean;
  url: string;
}

/** Full shape of `config/settings.json`. */
export interface AppSettings {
  /** Schema version, bumped whenever the shape of this interface changes. */
  version: number;
  llm: {
    provider: LlmProvider;
    mode: LlmMode;
  };
  endpoints: EndpointsConfig;
  /** URL of the remote endpoints.json used to refresh `endpoints` at startup. */
  remoteConfigUrl: string;
  proxy: ProxyConfig;
}

/** Current settings schema version. Bump when adding/removing/renaming keys. */
export const SETTINGS_SCHEMA_VERSION = 1;

/**
 * Immutable template for default settings. Never hand this object out
 * directly — always go through {@link createDefaultSettings} so callers
 * cannot accidentally mutate the shared template.
 */
const DEFAULT_SETTINGS_TEMPLATE: AppSettings = {
  version: SETTINGS_SCHEMA_VERSION,
  llm: {
    provider: 'gemini',
    mode: 'free',
  },
  endpoints: {
    claude: 'https://api.anthropic.com',
    gemini: 'https://generativelanguage.googleapis.com',
    openai: 'https://api.openai.com',
    kci: 'https://www.data.go.kr',
    scienceon: 'https://apigateway.kisti.re.kr',
    semanticScholar: 'https://api.semanticscholar.org',
    openalex: 'https://api.openalex.org',
  },
  // Placeholder — replace OWNER with the actual GitHub Pages owner/repo once published.
  remoteConfigUrl: 'https://OWNER.github.io/thesis-supporter/endpoints.json',
  proxy: {
    enabled: false,
    url: '',
  },
};

/** Returns a fresh, deep-cloned copy of the default settings. */
export function createDefaultSettings(): AppSettings {
  return structuredClone(DEFAULT_SETTINGS_TEMPLATE);
}
