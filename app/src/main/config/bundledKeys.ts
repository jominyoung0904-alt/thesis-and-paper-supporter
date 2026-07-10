/**
 * Bundled (shared) academic API keys, embedded at build time (NFR-ACAPI-001:
 * "압축 해제 직후 별도 설정 없이 학술 검색이 가능하도록 한다").
 *
 * SPEC-TSA-001 후속 (2026-07-11): this path is now a personal/advanced-build
 * option only. KCI is IP-restricted and ScienceON is MAC-restricted, so
 * neither works from a distributed release build regardless of what key is
 * bundled here — that is why domestic search moved to OpenAlex (keyless, no
 * IP/MAC restriction; see `openAlexClient.ts` and research.md "국내 API 전환
 * 결정"). This mechanism remains for a user who builds the app themselves on
 * a machine/network that KCI or ScienceON already allow-lists.
 *
 * An empty string means "no bundled key available for this source" —
 * `academicClients.ts` then omits that source entirely instead of falling
 * back to mock mode (mock data has no remaining purpose now that OpenAlex
 * covers the same ground for every user).
 */
export interface BundledAcademicKeys {
  kci: string;
  scienceon: string;
}

export const BUNDLED_ACADEMIC_KEYS: BundledAcademicKeys = {
  kci: '',
  scienceon: '',
};
