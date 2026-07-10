import { describe, expect, it } from 'vitest';

import {
  isBoundedAcademicKey,
  isGoogleCseMissingCx,
  isValidAcademicKeyProvider,
  MAX_ACADEMIC_KEY_LENGTH,
} from '../../src/main/ipc/academicKeyGuards';

describe('isValidAcademicKeyProvider', () => {
  it('accepts kci/scienceon/googlecse', () => {
    expect(isValidAcademicKeyProvider('kci')).toBe(true);
    expect(isValidAcademicKeyProvider('scienceon')).toBe(true);
    expect(isValidAcademicKeyProvider('googlecse')).toBe(true);
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

describe('isGoogleCseMissingCx', () => {
  it('is true for googlecse when cx is empty or whitespace-only', () => {
    expect(isGoogleCseMissingCx('googlecse', '')).toBe(true);
    expect(isGoogleCseMissingCx('googlecse', '   ')).toBe(true);
  });

  it('is false for googlecse when cx is present', () => {
    expect(isGoogleCseMissingCx('googlecse', 'abc123:cx-id')).toBe(false);
  });

  it('is always false for non-googlecse providers, regardless of cx', () => {
    expect(isGoogleCseMissingCx('kci', '')).toBe(false);
    expect(isGoogleCseMissingCx('scienceon', '')).toBe(false);
  });
});
