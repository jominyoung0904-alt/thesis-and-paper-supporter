import { describe, expect, it } from 'vitest';

import { resolveAcademicKey } from '../../src/main/ipc/academicClients';

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
