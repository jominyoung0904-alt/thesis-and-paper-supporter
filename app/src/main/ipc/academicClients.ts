/**
 * Assembles the academic clients passed into `runDeepResearch` (FR-RES-002).
 *
 * Semantic Scholar runs in real mode unconditionally — its unauthenticated
 * tier needs no key. KCI and ScienceON fall back to `mockMode: true` when the
 * user has not registered a key for them (real key approval for both is a
 * manual, slow process — see `core/academic-api/kciClient.ts`'s doc comment).
 */

import type { AppSettings } from '../config/defaultSettings';
import type { KeyStore } from '../config/keyStore';
import type { AcademicClient } from '../../core/academic-api/types';
import { KciClient } from '../../core/academic-api/kciClient';
import { ScienceOnClient } from '../../core/academic-api/scienceOnClient';
import { SemanticScholarClient } from '../../core/academic-api/semanticScholarClient';

export function buildAcademicClients(settings: AppSettings, keyStore: KeyStore): AcademicClient[] {
  const kciKey = keyStore.readKey('kci');
  const scienceonKey = keyStore.readKey('scienceon');

  return [
    new SemanticScholarClient({
      baseUrl: settings.endpoints.semanticScholar,
      mockMode: false,
    }),
    new KciClient({
      baseUrl: settings.endpoints.kci,
      apiKey: kciKey.ok ? kciKey.key : undefined,
      mockMode: !kciKey.ok,
    }),
    new ScienceOnClient({
      baseUrl: settings.endpoints.scienceon,
      apiKey: scienceonKey.ok ? scienceonKey.key : undefined,
      mockMode: !scienceonKey.ok,
    }),
  ];
}
