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
  /** Google Custom Search JSON API base URL (T32, NFR-ACAPI-002 조기 구현). */
  googleCse: string;
}

/** Academic-search configuration not tied to a single provider's base URL. */
export interface AcademicSearchConfig {
  /**
   * Google Programmable Search Engine id (cx) restricting results to
   * riss.kr. Not a secret — safe to ship in the settings file or a remote
   * config override. Empty string means "not configured yet"; the Google
   * CSE client is then omitted entirely regardless of whether the user has
   * registered their own API key (see `academicClients.ts`).
   */
  googleCseCx: string;
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
  /** Academic-search settings not owned by a single provider's endpoint (T32). */
  academicSearch: AcademicSearchConfig;
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
    googleCse: 'https://www.googleapis.com',
  },
  // Live remote-config file (GitHub Pages, provisioned 2026-07-11). Editing
  // that file updates endpoint overrides / notices for every install without
  // shipping a new zip. See NFR-CFG-002.
  remoteConfigUrl: 'https://jominyoung0904-alt.github.io/thesis-and-paper-supporter/endpoints.json',
  proxy: {
    enabled: false,
    url: '',
  },
  academicSearch: {
    // riss.kr-restricted Programmable Search Engine created for this app
    // (2026-07-11). A cx is a public engine identifier, not a secret —
    // quota is billed to each user's own API key. Editable via
    // config/settings.json if the engine definition ever changes.
    googleCseCx: 'e1e179dafec704d39',
  },
};

/** Returns a fresh, deep-cloned copy of the default settings. */
export function createDefaultSettings(): AppSettings {
  return structuredClone(DEFAULT_SETTINGS_TEMPLATE);
}
