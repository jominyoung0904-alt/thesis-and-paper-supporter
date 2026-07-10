import { describe, expect, it } from 'vitest';

import {
  isBoundedAcademicKey,
  isValidAcademicKeyProvider,
  isValidNaverCredentialFormat,
  MAX_ACADEMIC_KEY_LENGTH,
} from '../../src/main/ipc/academicKeyGuards';

describe('isValidAcademicKeyProvider', () => {
  it('accepts kci/scienceon/naverdoc', () => {
    expect(isValidAcademicKeyProvider('kci')).toBe(true);
    expect(isValidAcademicKeyProvider('scienceon')).toBe(true);
    expect(isValidAcademicKeyProvider('naverdoc')).toBe(true);
  });

  it('rejects the retired googlecse provider', () => {
    expect(isValidAcademicKeyProvider('googlecse')).toBe(false);
  });

  it('rejects an LLM provider or an arbitrary string', () => {
    expect(isValidAcademicKeyProvider('claude')).toBe(false);
    expect(isValidAcademicKeyProvider('not-a-provider')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isValidAcademicKeyProvider(undefined)).toBe(false);
    expect(isValidAcademicKeyProvider(null)).toBe(false);
    expect(isValidAcademicKeyProvider(123)).toBe(false);
  });
});

describe('isBoundedAcademicKey', () => {
  it('accepts a plausible key string', () => {
    expect(isBoundedAcademicKey('AIzaSy-example-key-1234567890')).toBe(true);
  });

  it('rejects an empty or whitespace-only string', () => {
    expect(isBoundedAcademicKey('')).toBe(false);
    expect(isBoundedAcademicKey('   ')).toBe(false);
  });

  it('rejects a string longer than the max length', () => {
    expect(isBoundedAcademicKey('a'.repeat(MAX_ACADEMIC_KEY_LENGTH + 1))).toBe(false);
  });

  it('accepts a string exactly at the max length', () => {
    expect(isBoundedAcademicKey('a'.repeat(MAX_ACADEMIC_KEY_LENGTH))).toBe(true);
  });

  it('rejects non-string values', () => {
    expect(isBoundedAcademicKey(12345)).toBe(false);
    expect(isBoundedAcademicKey(undefined)).toBe(false);
  });
});

describe('isValidNaverCredentialFormat', () => {
  it('is true for a well-formed `clientId:clientSecret` pair', () => {
    expect(isValidNaverCredentialFormat('my-client-id:my-client-secret')).toBe(true);
  });

  it('is false when there is no colon separator', () => {
    expect(isValidNaverCredentialFormat('no-colon-here')).toBe(false);
  });

  it('is false when either side is empty or whitespace-only', () => {
    expect(isValidNaverCredentialFormat(':my-secret')).toBe(false);
    expect(isValidNaverCredentialFormat('my-id:')).toBe(false);
    expect(isValidNaverCredentialFormat('   :   ')).toBe(false);
  });
});
