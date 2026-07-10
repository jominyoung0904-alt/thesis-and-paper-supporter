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
 * Google CSE (T32, NFR-ACAPI-002 조기 구현) covered RISS theses/dissertations,
 * which OpenAlex does not index, but Google Custom Search JSON API has since
 * been confirmed closed to new customers (403 for a freshly-registered key,
 * 2027 shutdown announced — see research.md "네이버 전문자료 전환 결정",
 * SPEC-TSA-001 후속 T33). It is therefore deliberately never assembled here
 * anymore, even if a user somehow still has a googlecse key registered from
 * before this change — `GoogleCseClient` itself is left in place (unused)
 * only so any lingering saved key/tests are not orphaned.
 *
 * Naver 전문자료(doc) search (T33) replaces it: it covers the same domestic
 * theses/dissertations/reports ground, requires a Client ID *and* a Client
 * Secret (see `keyStore.ts`'s `parseNaverCredential`), and is included only
 * when a stored credential parses successfully.
 */

import type { AppSettings } from '../config/defaultSettings';
import type { KeyReadResult, KeyStore } from '../config/keyStore';
import { parseNaverCredential } from '../config/keyStore';
import { BUNDLED_ACADEMIC_KEYS } from '../config/bundledKeys';
import type { AcademicClient } from '../../core/academic-api/types';
import { KciClient } from '../../core/academic-api/kciClient';
import { NaverDocClient } from '../../core/academic-api/naverDocClient';
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

  // Naver 전문자료(doc) search has no bundled-key fallback (see module doc):
  // a user-registered Client ID/Secret pair must parse successfully.
  const naverKeyResult = keyStore.readKey('naverdoc');
  const naverCredential = naverKeyResult.ok ? parseNaverCredential(naverKeyResult.key) : null;
  if (naverCredential !== null) {
    clients.push(
      new NaverDocClient({
        baseUrl: settings.endpoints.naver,
        clientId: naverCredential.clientId,
        clientSecret: naverCredential.clientSecret,
        mockMode: false,
      }),
    );
  }

  return clients;
}
