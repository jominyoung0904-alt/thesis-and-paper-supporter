/**
 * `gate-history:*` IPC channel names + request/result shapes (FR-WRT-008).
 *
 * Kept as its own file — not appended to `channels.ts` / `gate.ts` —
 * because `main/ipc/gateHistoryHandlers.ts` imports the channel constant
 * directly from here rather than through the central `shared/ipc/index.ts`
 * barrel. That keeps this domain's handler module compilable in isolation
 * before the central wiring (channels.ts, index.ts, handlers.ts, preload.ts)
 * is updated by the integration pass; see the T56 task's "배선 명세" report
 * for the exact snippets that fold this into the central files. Mirrors the
 * same split used by `shared/ipc/researchHistory.ts` (T48, SPEC-TSA-002).
 *
 * Mirrors (rather than imports) `core/writing/gateHistoryStore.ts`'s
 * `GateRecord`/`GateRecordSummary` — the same shared/core decoupling
 * pattern used across this codebase (see `shared/ipc/project.ts`'s doc
 * comment). The per-run gate outcome reuses the existing
 * `QualityGateRunResult` from `./gate.ts` (already the renderer-facing
 * projection of `GateResult`).
 */

import type { QualityGateRunResult } from './gate';

export const GateHistoryChannels = {
  /** Lists every saved quality-gate record (summary view) for the active project. */
  GATE_HISTORY_LIST: 'gate-history:list',
  /** Loads a single full gate record (checked text + full result) by id. */
  GATE_HISTORY_GET: 'gate-history:get',
  /** Deletes a single gate record by id. */
  GATE_HISTORY_REMOVE: 'gate-history:remove',
} as const;

export type GateHistoryChannelName = (typeof GateHistoryChannels)[keyof typeof GateHistoryChannels];

// --- gate-history:list ---

/** Lightweight list-view projection of a saved gate record. */
export interface GateHistorySummary {
  id: string;
  sectionId: string;
  /** ISO-8601 timestamp of when the gate was run. */
  ranAt: string;
  passed: boolean;
  /** First ~60 characters of the checked text. */
  textPreview: string;
}

export interface GateHistoryListResult {
  records: GateHistorySummary[];
}

// --- gate-history:get ---

export interface GateHistoryGetRequest {
  id: string;
}

/** Full saved gate record: the exact text checked, plus its full result. */
export interface GateHistoryRecord {
  id: string;
  sectionId: string;
  ranAt: string;
  text: string;
  result: QualityGateRunResult;
}

/** `null` when the id is unknown or the stored record is corrupted. */
export type GateHistoryGetResult = GateHistoryRecord | null;

// --- gate-history:remove ---

export interface GateHistoryRemoveRequest {
  id: string;
}

export interface GateHistoryRemoveResult {
  ok: boolean;
}
