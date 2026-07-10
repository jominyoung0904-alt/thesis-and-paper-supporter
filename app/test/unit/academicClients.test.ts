import { describe, expect, it } from 'vitest';

import { createDefaultSettings } from '../../src/main/config/defaultSettings';
import type { KeyReadResult, KeyStore } from '../../src/main/config/keyStore';
import { buildAcademicClients, resolveAcademicKey } from '../../src/main/ipc/academicClients';

describe('resolveAcademicKey (NFR-ACAPI-001 key priority)', () => {
  it('prefers the user-registered key over a bundled key', () => {
    const resolved = resolveAcademicKey({ ok: true, key: 'user-key' }, 'bundled-key');
    expect(resolved).toEqual({ apiKey: 'user-key', mockMode: false });
  });

  it('falls back to the bundled key when no user key is registered', () => {
    const resolved = resolveAcademicKey({ ok: false, reason: 'not-found' }, 'bundled-key');
    expect(resolved).toEqual({ apiKey: 'bundled-key', mockMode: false });
  });

  it('falls back to mock mode when neither a user key nor a bundled key is available', () => {
    const resolved = resolveAcademicKey({ ok: false, reason: 'not-found' }, '');
    expect(resolved).toEqual({ apiKey: undefined, mockMode: true });
  });

  it('treats a whitespace-only bundled key as absent', () => {
    const resolved = resolveAcademicKey({ ok: false, reason: 'not-found' }, '   ');
    expect(resolved.mockMode).toBe(true);
    expect(resolved.apiKey).toBeUndefined();
  });

  it('prefers the user key even when a key-read error occurred (e.g. decrypt-failed)', () => {
    const resolved = resolveAcademicKey(
      { ok: false, reason: 'decrypt-failed', userMessage: '저장된 키를 열 수 없어요.' },
      'bundled-key',
    );
    expect(resolved).toEqual({ apiKey: 'bundled-key', mockMode: false });
  });
});

type StubProvider = 'kci' | 'scienceon' | 'naverdoc';

/** Minimal `KeyStore`-shaped stub — `buildAcademicClients` only ever calls `readKey`. */
function fakeKeyStore(results: Partial<Record<StubProvider, KeyReadResult>>): KeyStore {
  return {
    readKey: (provider: StubProvider) => results[provider] ?? { ok: false, reason: 'not-found' },
  } as unknown as KeyStore;
}

describe('buildAcademicClients (SPEC-TSA-001 후속: OpenAlex 전환 우선순위)', () => {
  it('always includes openalex and semanticscholar, and omits kci/scienceon entirely when no key is registered', () => {
    const settings = createDefaultSettings();
    const clients = buildAcademicClients(settings, fakeKeyStore({}));

    expect(clients.map((client) => client.source)).toEqual(['openalex', 'semanticscholar']);
  });

  it('includes kci only when a user key is registered for it', () => {
    const settings = createDefaultSettings();
    const clients = buildAcademicClients(settings, fakeKeyStore({ kci: { ok: true, key: 'user-kci-key' } }));

    expect(clients.map((client) => client.source)).toEqual(['openalex', 'semanticscholar', 'kci']);
  });

  it('includes scienceon only when a user key is registered for it', () => {
    const settings = createDefaultSettings();
    const clients = buildAcademicClients(
      settings,
      fakeKeyStore({ scienceon: { ok: true, key: 'user-scienceon-key' } }),
    );

    expect(clients.map((client) => client.source)).toEqual(['openalex', 'semanticscholar', 'scienceon']);
  });

  it('includes both kci and scienceon when both have a registered key', () => {
    const settings = createDefaultSettings();
    const clients = buildAcademicClients(
      settings,
      fakeKeyStore({
        kci: { ok: true, key: 'user-kci-key' },
        scienceon: { ok: true, key: 'user-scienceon-key' },
      }),
    );

    expect(clients.map((client) => client.source)).toEqual(['openalex', 'semanticscholar', 'kci', 'scienceon']);
  });

  it('includes naverdoc when a well-formed clientId:clientSecret credential is registered', () => {
    const settings = createDefaultSettings();
    const clients = buildAcademicClients(
      settings,
      fakeKeyStore({ naverdoc: { ok: true, key: 'my-client-id:my-client-secret' } }),
    );

    expect(clients.map((client) => client.source)).toEqual(['openalex', 'semanticscholar', 'naverdoc']);
  });

  it('omits naverdoc when the stored credential has no colon separator (malformed)', () => {
    const settings = createDefaultSettings();
    const clients = buildAcademicClients(settings, fakeKeyStore({ naverdoc: { ok: true, key: 'no-colon-here' } }));

    expect(clients.map((client) => client.source)).toEqual(['openalex', 'semanticscholar']);
  });

  it('omits naverdoc when no credential is registered', () => {
    const settings = createDefaultSettings();
    const clients = buildAcademicClients(settings, fakeKeyStore({}));

    expect(clients.map((client) => client.source)).toEqual(['openalex', 'semanticscholar']);
  });

  it('never assembles a googlecse client, even though the client module is retained', () => {
    const settings = createDefaultSettings();
    const clients = buildAcademicClients(settings, fakeKeyStore({}));

    expect(clients.map((client) => client.source)).not.toContain('googlecse');
  });
});
