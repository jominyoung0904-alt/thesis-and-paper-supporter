/**
 * Assembles the academic clients passed into `runDeepResearch` (FR-RES-002).
 *
 * Semantic Scholar runs in real mode unconditionally — its unauthenticated
 * tier needs no key. KCI and ScienceON resolve their key/mock-mode via
 * {@link resolveAcademicKey} (NFR-ACAPI-001): a user-registered key always
 * wins; otherwise the app falls back to the build's bundled shared key
 * (`bundledKeys.ts`); only when neither exists does the client run in mock
 * mode (real key approval for both sources is a manual, slow process — see
 * `core/academic-api/kciClient.ts`'s doc comment).
 */

import type { AppSettings } from '../config/defaultSettings';
import type { KeyReadResult, KeyStore } from '../config/keyStore';
import { BUNDLED_ACADEMIC_KEYS } from '../config/bundledKeys';
import type { AcademicClient } from '../../core/academic-api/types';
import { KciClient } from '../../core/academic-api/kciClient';
import { ScienceOnClient } from '../../core/academic-api/scienceOnClient';
import { SemanticScholarClient } from '../../core/academic-api/semanticScholarClient';

interface ResolvedAcademicKey {
  apiKey: string | undefined;
  mockMode: boolean;
}

/**
 * Key priority for one academic source (NFR-ACAPI-001):
 * 1. The user's own registered key (`KeyStore`) — always preferred.
 * 2. The build's bundled shared key (`bundledKeys.ts`) — ships real access
 *    out of the box, once a key has been injected at deployment time.
 * 3. Mock mode — no user key and no bundled key available for this source.
 */
export function resolveAcademicKey(userKeyResult: KeyReadResult, bundledKey: string): ResolvedAcademicKey {
  if (userKeyResult.ok) {
    return { apiKey: userKeyResult.key, mockMode: false };
  }
  if (bundledKey.trim().length > 0) {
    return { apiKey: bundledKey, mockMode: false };
  }
  return { apiKey: undefined, mockMode: true };
}

export function buildAcademicClients(settings: AppSettings, keyStore: KeyStore): AcademicClient[] {
  const kciResolved = resolveAcademicKey(keyStore.readKey('kci'), BUNDLED_ACADEMIC_KEYS.kci);
  const scienceonResolved = resolveAcademicKey(keyStore.readKey('scienceon'), BUNDLED_ACADEMIC_KEYS.scienceon);

  return [
    new SemanticScholarClient({
      baseUrl: settings.endpoints.semanticScholar,
      mockMode: false,
    }),
    new KciClient({
      baseUrl: settings.endpoints.kci,
      apiKey: kciResolved.apiKey,
      mockMode: kciResolved.mockMode,
    }),
    new ScienceOnClient({
      baseUrl: settings.endpoints.scienceon,
      apiKey: scienceonResolved.apiKey,
      mockMode: scienceonResolved.mockMode,
    }),
  ];
}
