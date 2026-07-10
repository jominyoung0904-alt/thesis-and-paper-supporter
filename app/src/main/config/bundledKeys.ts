/**
 * Bundled (shared) academic API keys, embedded at build time (NFR-ACAPI-001:
 * "압축 해제 직후 별도 설정 없이 학술 검색이 가능하도록 한다").
 *
 * Deployment mechanism: before shipping a release build, inject the real
 * KCI/ScienceON keys obtained for this app's own registration into the
 * values below — or, per NFR-ACAPI-005, replace/revoke them post-release via
 * a remote-config `academicKeys` override (see `remoteConfig.ts`'s
 * `RemoteConfigOverride`; wiring that override through is a follow-up, not
 * part of this change). An empty string means "no bundled key available for
 * this source yet" — `academicClients.ts` then falls back to mock mode for
 * that source instead of failing.
 *
 * Obtaining and injecting real keys is a deployment-time operational step
 * (owned by whoever ships the build, not by this code) — this module only
 * provides the mechanism, so activating a bundled key is a single-line edit
 * once one is issued.
 */
export interface BundledAcademicKeys {
  kci: string;
  scienceon: string;
}

export const BUNDLED_ACADEMIC_KEYS: BundledAcademicKeys = {
  kci: '',
  scienceon: '',
};
