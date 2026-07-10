/**
 * Shared record-id validation for per-record JSON file stores
 * (`ResearchHistoryStore`, `ChatSessionStore`, `GateHistoryStore`,
 * `MockReviewStore` — audit H1, SPEC-TSA-002 Phase 4).
 *
 * Threat model: every IPC handler already rejects a non-UUID-shaped `id`
 * before it ever reaches one of these stores (see
 * `main/ipc/guards.ts`'s `isSafeRecordId`). But a store must not simply
 * trust its caller — this is the SECOND, independent layer, re-validated
 * right at the point where `id` is concatenated into a filesystem path
 * (`join(this.dir, \`${id}.json\`)`). Without it, a compromised renderer
 * that reached this deep (e.g. bypassing/patching the IPC-layer guard, or a
 * future caller added without going through the handler) could pass
 * something like `../../index` and escape the record directory entirely,
 * reading or deleting an arbitrary `.json` file elsewhere on disk.
 *
 * Every id these stores ever generate is `randomUUID()` output, so the
 * pattern below is deliberately narrow — hex digits and hyphens only.
 *
 * Lives in `core/` (not `main/`) so these stores — which must stay free of
 * any `electron`/`main` dependency — can import it directly.
 */

/** Matches every id these stores ever generate (`randomUUID()`); rejects any path-escape attempt. */
export const RECORD_ID_PATTERN = /^[0-9a-fA-F-]+$/;

/** Generous upper bound (a canonical UUID is 36 chars) — a cheap sanity check, not a format validator. */
export const MAX_RECORD_ID_LENGTH = 200;

/** Whether `id` is safe to interpolate into a `{id}.json` record file path. */
export function isSafeRecordId(id: string): boolean {
  return id.length > 0 && id.length <= MAX_RECORD_ID_LENGTH && RECORD_ID_PATTERN.test(id);
}
