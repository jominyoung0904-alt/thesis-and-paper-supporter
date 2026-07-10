/**
 * Assembles the academic clients passed into `runDeepResearch` (FR-RES-002).
 *
 * SPEC-TSA-001 후속 (2026-07-11): KCI (IP-restricted) and ScienceON
 * (MAC-restricted) turned out to be unreachable from a distributed desktop
 * app in real-world testing — see research.md "국내 API 전환 결정". OpenAlex
 * requires no key and has no IP/MAC restriction, and its Korean-language
 * search also surfaces KCI DOI-registered journal articles, so it now runs
 * in real mode unconditionally alongside Semantic Scholar.
 *
 * KCI/ScienceON are included only when a real key resolves for them (a
 * user-registered key, or — as a personal/advanced-build option only, since
 * the bundled-key path can never work in a deployed build given the
 * IP/MAC restriction above — the build's bundled key via `bundledKeys.ts`).
 * When neither is available, that source is left out of the list entirely:
 * with OpenAlex already covering domestic search, showing the user mock
 * data for KCI/ScienceON no longer serves any purpose.
 *
 * Google CSE (T32, NFR-ACAPI-002 조기 구현) covers RISS theses/dissertations,
 * which OpenAlex does not index. It has no bundled-key fallback: it is
 * included only when BOTH a user-registered key AND a non-empty `cx`
 * (search-engine id) are available. `cx` is not a per-user secret, but it is
 * still a required build/remote-config input — see `defaultSettings.ts`.
 */

import type { AppSettings } from '../config/defaultSettings';
import type { KeyReadResult, KeyStore } from '../config/keyStore';
import { BUNDLED_ACADEMIC_KEYS } from '../config/bundledKeys';
import type { AcademicClient } from '../../core/academic-api/types';
import { GoogleCseClient } from '../../core/academic-api/googleCseClient';
import { KciClient } from '../../core/academic-api/kciClient';
import { OpenAlexClient } from '../../core/academic-api/openAlexClient';
import { ScienceOnClient } from '../../core/academic-api/scienceOnClient';
import { SemanticScholarClient } from '../../core/academic-api/semanticScholarClient';

interface ResolvedAcademicKey {
  apiKey: string | undefined;
  mockMode: boolean;
}

/**
 * Key priority for one academic source (NFR-ACAPI-001):
 * 1. The user's own registered key (`KeyStore`) — always preferred.
 * 2. The build's bundled shared key (`bundledKeys.ts`) — a personal/advanced
 *    build option only; it does NOT work in a deployed release build,
 *    because both KCI and ScienceON reject requests from outside their
 *    allow-listed IP/MAC (see research.md "국내 API 전환 결정").
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

  const clients: AcademicClient[] = [
    new OpenAlexClient({
      baseUrl: settings.endpoints.openalex,
      mockMode: false,
    }),
    new SemanticScholarClient({
      baseUrl: settings.endpoints.semanticScholar,
      mockMode: false,
    }),
  ];

  // KCI/ScienceON are omitted entirely (not even in mock mode) when no real
  // key resolved — see module doc comment above.
  if (!kciResolved.mockMode) {
    clients.push(
      new KciClient({
        baseUrl: settings.endpoints.kci,
        apiKey: kciResolved.apiKey,
        mockMode: false,
      }),
    );
  }

  if (!scienceonResolved.mockMode) {
    clients.push(
      new ScienceOnClient({
        baseUrl: settings.endpoints.scienceon,
        apiKey: scienceonResolved.apiKey,
        mockMode: false,
      }),
    );
  }

  // Google CSE has no bundled-key fallback (see module doc): both a
  // user-registered key and a non-empty cx must be present.
  const googleCseKeyResult = keyStore.readKey('googlecse');
  const googleCseCx = settings.academicSearch.googleCseCx.trim();
  if (googleCseKeyResult.ok && googleCseCx.length > 0) {
    clients.push(
      new GoogleCseClient({
        baseUrl: settings.endpoints.googleCse,
        apiKey: googleCseKeyResult.key,
        cx: googleCseCx,
        mockMode: false,
      }),
    );
  }

  return clients;
}
