/**
 * Common contract for the multi-provider LLM adapter layer (NFR-LLM-001).
 *
 * Every provider (Claude, Gemini, OpenAI) is reduced to this single, small
 * surface so downstream consumers — rate limiter (T7), error translation (T8),
 * deep research (T15), chat (T30), writing (T20/T21) — depend only on this
 * shape and never on a vendor SDK or wire format.
 *
 * Sampling parameters (temperature, top_p, ...) are deliberately omitted:
 * recent frontier models increasingly reject them, and they can be added as a
 * backward-compatible extension when a concrete need appears.
 */

/** Providers supported by the adapter layer. Mirrors `LlmProvider` in config. */
export type LlmProvider = 'claude' | 'gemini' | 'openai';

/** A single turn in a conversation. `system` is passed separately on the request. */
export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** A provider-agnostic chat request. */
export interface LlmRequest {
  /** Concrete model id, resolved by the caller (loaded from remote config). */
  model: string;
  /** Optional system / developer instruction, hoisted out of `messages`. */
  system?: string;
  /** Ordered conversation turns; the last one is normally the user prompt. */
  messages: LlmMessage[];
  /** Upper bound on generated tokens. Defaults to {@link DEFAULT_MAX_TOKENS}. */
  maxTokens?: number;
}

/** Token accounting, normalized across providers' differing field names. */
export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

/** A provider-agnostic chat response. */
export interface LlmResponse {
  /** Concatenated assistant text extracted from the provider payload. */
  text: string;
  usage: LlmUsage;
  /** Model id echoed by the provider (falls back to the requested model). */
  model: string;
}

/** The uniform capability every provider adapter exposes. */
export interface LlmAdapter {
  readonly provider: LlmProvider;
  chat(req: LlmRequest): Promise<LlmResponse>;
}

/**
 * Construction options for an adapter. `fetchFn` is injectable so tests can
 * mock the network with zero real HTTP; production omits it and the global
 * `fetch` (Electron/Node built-in) is used — no third-party SDK is installed.
 */
export interface AdapterOptions {
  /** Provider base URL (from settings/endpoints), without a trailing slash. */
  baseUrl: string;
  /** Plain API key; the adapter only ever sends it to the provider's own host. */
  apiKey: string;
  /** Injectable fetch implementation. Defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
  /** Per-request timeout in milliseconds. Defaults to {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
}

/** Default per-request timeout: 120 seconds. */
export const DEFAULT_TIMEOUT_MS = 120_000;

/** Default output-token cap. Claude requires `max_tokens`, so a default exists. */
export const DEFAULT_MAX_TOKENS = 4096;
