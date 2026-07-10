/**
 * `settings:save-academic-key` / `settings:get-academic-key-status` request/
 * result shapes for personal academic-search API key management
 * (NFR-ACAPI-002).
 */

// --- settings:save-academic-key / settings:get-academic-key-status ---

/** Academic-search API key providers manageable from the Settings tab (NFR-ACAPI-002). */
export type IpcAcademicKeyProvider = 'kci' | 'scienceon' | 'naverdoc';

export interface SaveAcademicKeyRequest {
  provider: IpcAcademicKeyProvider;
  /** For `naverdoc`, this is the colon-joined `${clientId}:${clientSecret}` pair. */
  key: string;
}

export interface SaveAcademicKeyResult {
  ok: boolean;
  /**
   * Korean-language message. Required on failure. Also set on a *successful*
   * kci/scienceon save, as a usage caveat — those keys are only verified
   * against the IP/MAC allow-listed at issuance, never against a live call.
   * naverdoc, by contrast, is verified with a live call before saving.
   */
  message?: string;
}

export interface AcademicKeyStatus {
  kci: boolean;
  scienceon: boolean;
  naverdoc: boolean;
}
