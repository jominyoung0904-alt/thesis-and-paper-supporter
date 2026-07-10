import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * External API providers whose keys the user may register locally.
 * NFR-LLM-002: keys are never sent anywhere except the provider's own API and
 * are never stored in plain text on disk.
 */
export type KeyProvider = 'claude' | 'gemini' | 'openai' | 'kci' | 'scienceon';

/**
 * Abstraction over the platform encryption primitive so {@link KeyStore}'s
 * business logic (file format, atomic writes, error classification) can be
 * unit-tested with a mock backend, without depending on a real Electron
 * runtime. The production implementation is {@link createElectronCryptoBackend}.
 */
export interface CryptoBackend {
  /** Whether the platform can currently encrypt/decrypt (e.g. DPAPI ready). */
  isAvailable(): boolean;
  /** Encrypts a plain-text secret into an opaque buffer. */
  encrypt(plainText: string): Buffer;
  /** Decrypts a buffer previously produced by {@link encrypt}. Throws on failure. */
  decrypt(encrypted: Buffer): string;
}

export type SaveKeyResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable'; userMessage: string };

export type KeyReadResult =
  | { ok: true; key: string }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'unavailable'; userMessage: string }
  | { ok: false; reason: 'decrypt-failed'; userMessage: string }
  | { ok: false; reason: 'corrupted-file'; userMessage: string };

/** On-disk shape of the key store file (e.g. `data/keys.json`). */
interface KeyStoreFileV1 {
  version: 1;
  keys: Partial<Record<KeyProvider, string>>;
}

const UNAVAILABLE_MESSAGE =
  '이 컴퓨터에서는 안전한 키 저장 기능을 사용할 수 없어요. 보안을 위해 API 키를 저장할 수 없습니다.';

const DECRYPT_FAILED_MESSAGE =
  '저장된 키를 열 수 없어요. 이 컴퓨터에서 API 키를 다시 등록해 주세요. ' +
  '(폴더를 다른 컴퓨터로 옮기면 보안을 위해 이전에 등록한 키를 사용할 수 없어요.)';

const CORRUPTED_FILE_MESSAGE = '저장된 키 파일이 손상되었어요. API 키를 다시 등록해 주세요.';

function isValidStoreShape(value: unknown): value is KeyStoreFileV1 {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (record.version !== 1) {
    return false;
  }
  if (typeof record.keys !== 'object' || record.keys === null) {
    return false;
  }

  return Object.values(record.keys as Record<string, unknown>).every(
    (entry) => typeof entry === 'string',
  );
}

type LoadResult =
  | { status: 'missing' }
  | { status: 'corrupted' }
  | { status: 'ok'; store: KeyStoreFileV1 };

function loadStore(filePath: string): LoadResult {
  if (!existsSync(filePath)) {
    return { status: 'missing' };
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return { status: 'corrupted' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'corrupted' };
  }

  if (!isValidStoreShape(parsed)) {
    return { status: 'corrupted' };
  }

  return { status: 'ok', store: parsed };
}

/** Writes the store via a temp-file-then-rename sequence to avoid partial writes. */
function writeStoreAtomic(filePath: string, store: KeyStoreFileV1): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  const tmpPath = join(dir, `.${basename(filePath)}.tmp-${randomBytes(6).toString('hex')}`);
  writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf-8');
  renameSync(tmpPath, filePath);
}

/** Reads the existing store, or a fresh empty one when missing/corrupted (self-healing). */
function loadOrEmptyStore(loaded: LoadResult): KeyStoreFileV1 {
  return loaded.status === 'ok' ? { version: 1, keys: { ...loaded.store.keys } } : { version: 1, keys: {} };
}

/**
 * Local, encrypted-at-rest storage for API keys (NFR-LLM-002). The file path
 * and {@link CryptoBackend} are injected — this class never computes the
 * `data/` directory itself (see src/main/paths.ts, the single source of
 * truth for portable path resolution).
 */
export class KeyStore {
  constructor(
    private readonly filePath: string,
    private readonly backend: CryptoBackend,
  ) {}

  /** Encrypts and persists `plainKey` for `provider`. Rejects plain-text storage. */
  saveKey(provider: KeyProvider, plainKey: string): SaveKeyResult {
    if (!this.backend.isAvailable()) {
      return { ok: false, reason: 'unavailable', userMessage: UNAVAILABLE_MESSAGE };
    }

    const store = loadOrEmptyStore(loadStore(this.filePath));
    const encrypted = this.backend.encrypt(plainKey);
    store.keys[provider] = encrypted.toString('base64');

    writeStoreAtomic(this.filePath, store);
    return { ok: true };
  }

  /** Reads and decrypts the key for `provider`, classifying every failure mode. */
  readKey(provider: KeyProvider): KeyReadResult {
    const loaded = loadStore(this.filePath);

    if (loaded.status === 'missing') {
      return { ok: false, reason: 'not-found' };
    }
    if (loaded.status === 'corrupted') {
      return { ok: false, reason: 'corrupted-file', userMessage: CORRUPTED_FILE_MESSAGE };
    }

    const base64 = loaded.store.keys[provider];
    if (base64 === undefined) {
      return { ok: false, reason: 'not-found' };
    }

    if (!this.backend.isAvailable()) {
      return { ok: false, reason: 'unavailable', userMessage: UNAVAILABLE_MESSAGE };
    }

    try {
      const key = this.backend.decrypt(Buffer.from(base64, 'base64'));
      return { ok: true, key };
    } catch {
      // Typically a DPAPI mismatch: the folder was copied to a different
      // Windows user/machine and the ciphertext can no longer be opened.
      return { ok: false, reason: 'decrypt-failed', userMessage: DECRYPT_FAILED_MESSAGE };
    }
  }

  /** Removes the stored key for `provider`, if any. Never throws; no-op when absent. */
  deleteKey(provider: KeyProvider): void {
    const loaded = loadStore(this.filePath);
    if (loaded.status === 'missing') {
      return;
    }

    const store = loadOrEmptyStore(loaded);
    delete store.keys[provider];
    writeStoreAtomic(this.filePath, store);
  }

  /** Lists providers that currently have a stored (encrypted) key. */
  listStoredProviders(): KeyProvider[] {
    const loaded = loadStore(this.filePath);
    if (loaded.status !== 'ok') {
      return [];
    }
    return Object.keys(loaded.store.keys) as KeyProvider[];
  }
}

/**
 * Production {@link CryptoBackend} backed by Electron's `safeStorage` API
 * (Windows DPAPI under the hood). `electron` is required lazily inside each
 * method body — never at module load time — so this module stays importable
 * (and {@link KeyStore} stays fully unit-testable with a mock backend) from a
 * plain Node test runner that has no Electron runtime.
 */
export function createElectronCryptoBackend(): CryptoBackend {
  return {
    isAvailable(): boolean {
      try {
        const { safeStorage } = require('electron') as typeof import('electron');
        return safeStorage.isEncryptionAvailable();
      } catch {
        return false;
      }
    },
    encrypt(plainText: string): Buffer {
      const { safeStorage } = require('electron') as typeof import('electron');
      return safeStorage.encryptString(plainText);
    },
    decrypt(encrypted: Buffer): string {
      const { safeStorage } = require('electron') as typeof import('electron');
      return safeStorage.decryptString(encrypted);
    },
  };
}
