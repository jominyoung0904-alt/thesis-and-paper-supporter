/**
 * Pure runtime-guard logic for `project:*` IPC handlers (FR-PRJ-001~006).
 *
 * Split out from `projectHandlers.ts` so it can be unit-tested without an
 * Electron runtime, following the same "Logic"/"Guards" module split used
 * elsewhere (e.g. `academicKeyGuards.ts`).
 *
 * Security (audit H1 precedent, see `guards.ts`): TypeScript payload types
 * are compile-time only — a compromised renderer can invoke these channels
 * with arbitrary values, so `id`/`name` shape is re-validated here at
 * runtime.
 */

import { isBoundedString } from './guards';

/** Project names are capped at 100 chars (task spec: "이름 1~100자"). */
export const MAX_PROJECT_NAME_LENGTH = 100;

/** Project ids are UUIDs or the literal `'default'` — both comfortably under 100 chars. */
export const MAX_PROJECT_ID_LENGTH = 100;

/** `project:create`'s `name` is optional — `undefined` is valid (auto-named); a present value must be bounded. */
export function isValidOptionalProjectName(value: unknown): value is string | undefined {
  return value === undefined || isBoundedString(value, MAX_PROJECT_NAME_LENGTH);
}

/** `project:rename`'s `name` is required and bounded (1~100 chars). */
export function isValidProjectName(value: unknown): value is string {
  return isBoundedString(value, MAX_PROJECT_NAME_LENGTH);
}

/** `id` fields across every `project:*` channel — a bounded, non-empty string. */
export function isValidProjectId(value: unknown): value is string {
  return isBoundedString(value, MAX_PROJECT_ID_LENGTH);
}
