/**
 * Pure runtime-guard logic for `settings:save-academic-key` (NFR-ACAPI-002).
 *
 * Split out from `academicKeyHandlers.ts` so it can be unit-tested without an
 * Electron runtime or network mocking, following the same "Logic" module
 * split used elsewhere (e.g. `wizardLogic.ts`).
 *
 * Security (audit H1 precedent, see `handlers.ts`): TypeScript payload types
 * are compile-time only — a compromised renderer can invoke this channel
 * with arbitrary values, so the provider name and key length are
 * re-validated here at runtime.
 */

import { parseNaverCredential } from '../config/keyStore';

export const VALID_ACADEMIC_KEY_PROVIDERS = ['kci', 'scienceon', 'naverdoc'] as const;

export type AcademicKeyProviderGuard = (typeof VALID_ACADEMIC_KEY_PROVIDERS)[number];

export const MAX_ACADEMIC_KEY_LENGTH = 512;

/** Whether `value` is one of the three providers this channel accepts. */
export function isValidAcademicKeyProvider(value: unknown): value is AcademicKeyProviderGuard {
  return (VALID_ACADEMIC_KEY_PROVIDERS as readonly string[]).includes(value as string);
}

/** Whether `value` is a non-empty, non-whitespace-only string within the length cap. */
export function isBoundedAcademicKey(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_ACADEMIC_KEY_LENGTH;
}

/**
 * Whether `value` is a well-formed naverdoc credential: a
 * `${clientId}:${clientSecret}` string with a colon separator and a
 * non-empty, non-whitespace-only value on each side (SPEC-TSA-001 후속 T33).
 * Delegates to `keyStore.ts`'s `parseNaverCredential` so both modules agree
 * on exactly one definition of "well-formed".
 */
export function isValidNaverCredentialFormat(value: string): boolean {
  return parseNaverCredential(value) !== null;
}
