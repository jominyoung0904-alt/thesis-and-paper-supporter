import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CryptoBackend } from '../../src/main/config/keyStore';
import { KeyStore, parseNaverCredential } from '../../src/main/config/keyStore';

/**
 * Deterministic, reversible mock of the platform encryption backend so the
 * store's file-format and error-classification logic can be exercised
 * without an Electron runtime. `failDecrypt` simulates the real-world DPAPI
 * failure mode: ciphertext that was encrypted on a different Windows user
 * account/machine and can no longer be opened.
 */
class MockCryptoBackend implements CryptoBackend {
  available = true;
  failDecrypt = false;

  isAvailable(): boolean {
    return this.available;
  }

  encrypt(plainText: string): Buffer {
    return Buffer.from(`enc:${plainText}`, 'utf-8');
  }

  decrypt(encrypted: Buffer): string {
    if (this.failDecrypt) {
      throw new Error('mock decrypt failure (simulated DPAPI mismatch)');
    }
    const text = encrypted.toString('utf-8');
    if (!text.startsWith('enc:')) {
      throw new Error('mock decrypt failure (bad ciphertext)');
    }
    return text.slice('enc:'.length);
  }
}

describe('KeyStore', () => {
  let workDir: string;
  let filePath: string;
  let backend: MockCryptoBackend;
  let store: KeyStore;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'tsa-keystore-test-'));
    filePath = join(workDir, 'keys.json');
    backend = new MockCryptoBackend();
    store = new KeyStore(filePath, backend);
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('saves and reads back a key round-trip', () => {
    const saveResult = store.saveKey('claude', 'sk-test-12345');
    expect(saveResult).toEqual({ ok: true });

    const readResult = store.readKey('claude');
    expect(readResult).toEqual({ ok: true, key: 'sk-test-12345' });
  });

  it('stores multiple providers independently', () => {
    store.saveKey('claude', 'claude-key');
    store.saveKey('openai', 'openai-key');

    expect(store.readKey('claude')).toEqual({ ok: true, key: 'claude-key' });
    expect(store.readKey('openai')).toEqual({ ok: true, key: 'openai-key' });
    expect(store.listStoredProviders().sort()).toEqual(['claude', 'openai']);
  });

  it('returns not-found when reading a key that was never stored', () => {
    expect(store.readKey('gemini')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('returns not-found when the store file does not exist yet', () => {
    expect(existsSync(filePath)).toBe(false);
    expect(store.readKey('kci')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('deletes a stored key so it is no longer readable', () => {
    store.saveKey('scienceon', 'sci-key');
    store.deleteKey('scienceon');

    expect(store.readKey('scienceon')).toEqual({ ok: false, reason: 'not-found' });
    expect(store.listStoredProviders()).toEqual([]);
  });

  it('does not throw when deleting a key that was never stored', () => {
    expect(() => store.deleteKey('openai')).not.toThrow();
    expect(store.listStoredProviders()).toEqual([]);
  });

  it('rejects saving an empty or whitespace-only key with a Korean message, without touching the backend', () => {
    const emptyResult = store.saveKey('claude', '');
    if (emptyResult.ok || emptyResult.reason !== 'invalid') {
      throw new Error('expected an "invalid" failure result for an empty key');
    }
    expect(emptyResult.userMessage).toMatch(/공백/);

    const whitespaceResult = store.saveKey('claude', '   \n\t  ');
    if (whitespaceResult.ok || whitespaceResult.reason !== 'invalid') {
      throw new Error('expected an "invalid" failure result for a whitespace-only key');
    }

    expect(existsSync(filePath)).toBe(false);
    expect(store.listStoredProviders()).toEqual([]);
  });

  it('rejects saving with a Korean message when the backend is unavailable', () => {
    backend.available = false;

    const result = store.saveKey('claude', 'sk-test-should-not-be-written');
    if (result.ok || result.reason !== 'unavailable') {
      throw new Error('expected an "unavailable" failure result');
    }
    expect(result.userMessage).toMatch(/컴퓨터/);
    expect(existsSync(filePath)).toBe(false);
  });

  it('never writes the plain-text key to disk', () => {
    store.saveKey('claude', 'super-secret-plaintext');

    const raw = readFileSync(filePath, 'utf-8');
    expect(raw).not.toContain('super-secret-plaintext');
  });

  it('returns decrypt-failed with a Korean re-registration message on decrypt failure', () => {
    store.saveKey('claude', 'sk-test-12345');
    backend.failDecrypt = true;

    const result = store.readKey('claude');
    if (result.ok || result.reason !== 'decrypt-failed') {
      throw new Error('expected a "decrypt-failed" result');
    }
    expect(result.userMessage).toMatch(/다시 등록/);
  });

  it('returns corrupted-file with a Korean message for an unparsable store file', () => {
    writeFileSync(filePath, '{not valid json', 'utf-8');

    const result = store.readKey('claude');
    if (result.ok || result.reason !== 'corrupted-file') {
      throw new Error('expected a "corrupted-file" result');
    }
    expect(result.userMessage).toMatch(/손상/);
    expect(store.listStoredProviders()).toEqual([]);
  });

  it('self-heals a corrupted file: saving after corruption produces a valid store', () => {
    writeFileSync(filePath, '{"version": 1, "keys": "not-an-object"}', 'utf-8');

    const result = store.saveKey('claude', 'sk-fresh-key');
    expect(result).toEqual({ ok: true });
    expect(store.readKey('claude')).toEqual({ ok: true, key: 'sk-fresh-key' });
  });

  it('writes atomically, leaving no leftover temp files', () => {
    store.saveKey('claude', 'sk-test-12345');

    const entries = readdirSync(workDir);
    expect(entries).toEqual(['keys.json']);

    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as { version: number; keys: Record<string, string> };
    expect(parsed.version).toBe(1);
    expect(typeof parsed.keys.claude).toBe('string');
  });

  it('stores and reads back a naverdoc credential pair as a single colon-joined string', () => {
    store.saveKey('naverdoc', 'my-client-id:my-client-secret');

    expect(store.readKey('naverdoc')).toEqual({ ok: true, key: 'my-client-id:my-client-secret' });
  });
});

describe('parseNaverCredential', () => {
  it('splits a well-formed `clientId:clientSecret` string', () => {
    expect(parseNaverCredential('abc123:xyz789')).toEqual({ clientId: 'abc123', clientSecret: 'xyz789' });
  });

  it('trims whitespace around each side', () => {
    expect(parseNaverCredential('  abc123  :  xyz789  ')).toEqual({ clientId: 'abc123', clientSecret: 'xyz789' });
  });

  it('returns null when there is no colon separator', () => {
    expect(parseNaverCredential('no-colon-here')).toBeNull();
  });

  it('returns null when the client id side is empty', () => {
    expect(parseNaverCredential(':xyz789')).toBeNull();
  });

  it('returns null when the client secret side is empty', () => {
    expect(parseNaverCredential('abc123:')).toBeNull();
  });

  it('returns null when the client secret side is whitespace-only', () => {
    expect(parseNaverCredential('abc123:   ')).toBeNull();
  });

  it('uses only the first colon as the separator, allowing a colon inside the secret', () => {
    expect(parseNaverCredential('abc123:xyz:789')).toEqual({ clientId: 'abc123', clientSecret: 'xyz:789' });
  });
});
