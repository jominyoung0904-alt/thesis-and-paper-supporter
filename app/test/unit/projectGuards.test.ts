import { describe, expect, it } from 'vitest';

import {
  isValidOptionalProjectName,
  isValidProjectId,
  isValidProjectName,
  MAX_PROJECT_ID_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
} from '../../src/main/ipc/projectGuards';

describe('projectGuards', () => {
  describe('isValidOptionalProjectName', () => {
    it('accepts undefined (auto-named project)', () => {
      expect(isValidOptionalProjectName(undefined)).toBe(true);
    });

    it('accepts a non-empty bounded name', () => {
      expect(isValidOptionalProjectName('내 연구 1')).toBe(true);
    });

    it('accepts a name at exactly the length cap', () => {
      expect(isValidOptionalProjectName('a'.repeat(MAX_PROJECT_NAME_LENGTH))).toBe(true);
    });

    it('rejects a name over the length cap', () => {
      expect(isValidOptionalProjectName('a'.repeat(MAX_PROJECT_NAME_LENGTH + 1))).toBe(false);
    });

    it('rejects a whitespace-only name', () => {
      expect(isValidOptionalProjectName('   ')).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(isValidOptionalProjectName('')).toBe(false);
    });

    it('rejects null and non-string values', () => {
      expect(isValidOptionalProjectName(null)).toBe(false);
      expect(isValidOptionalProjectName(42)).toBe(false);
      expect(isValidOptionalProjectName({})).toBe(false);
    });
  });

  describe('isValidProjectName', () => {
    it('rejects undefined (name is required, unlike create)', () => {
      expect(isValidProjectName(undefined)).toBe(false);
    });

    it('accepts a non-empty bounded name', () => {
      expect(isValidProjectName('내 연구 2')).toBe(true);
    });

    it('rejects an empty or whitespace-only name', () => {
      expect(isValidProjectName('')).toBe(false);
      expect(isValidProjectName('   ')).toBe(false);
    });

    it('rejects a name over the length cap', () => {
      expect(isValidProjectName('a'.repeat(MAX_PROJECT_NAME_LENGTH + 1))).toBe(false);
    });
  });

  describe('isValidProjectId', () => {
    it('accepts a UUID-shaped id', () => {
      expect(isValidProjectId('11111111-1111-1111-1111-111111111111')).toBe(true);
    });

    it('accepts the literal "default" id', () => {
      expect(isValidProjectId('default')).toBe(true);
    });

    it('rejects an empty string', () => {
      expect(isValidProjectId('')).toBe(false);
    });

    it('rejects an id over the length cap', () => {
      expect(isValidProjectId('a'.repeat(MAX_PROJECT_ID_LENGTH + 1))).toBe(false);
    });

    it('rejects undefined and non-string values', () => {
      expect(isValidProjectId(undefined)).toBe(false);
      expect(isValidProjectId(123)).toBe(false);
    });
  });
});
