/**
 * IPC handlers for saved quality-gate check history
 * (`gate-history:list/get/remove`, FR-WRT-008) plus `saveGateRecord()`, the
 * auto-save helper called right after a successful `quality-gate:run` (wired
 * centrally into `researchGateHandlers.ts` — see this task's "배선 명세"
 * report).
 *
 * Follows the same domain-handler-file split as `chatHandlers.ts` /
 * `researchGateHandlers.ts` / `researchHistoryHandlers.ts` (T40/T48,
 * SPEC-TSA-002) to stay under the project's 300-line file limit.
 * `GateHistoryChannels` is imported directly from `shared/ipc/gateHistory.ts`
 * rather than the central `ipc-channels.ts` barrel, so this module compiles
 * independently of the central wiring pass.
 */

import { ipcMain } from 'electron';

import { GateHistoryStore, type GateRecord } from '../../core/writing/gateHistoryStore';
import type { GateResult } from '../../core/writing/qualityGate';
import {
  GateHistoryChannels,
  type GateHistoryGetRequest,
  type GateHistoryGetResult,
  type GateHistoryListResult,
  type GateHistoryRecord,
  type GateHistoryRemoveRequest,
  type GateHistoryRemoveResult,
} from '../../shared/ipc/gateHistory';
import { INVALID_REQUEST_MESSAGE, isBoundedString } from './guards';

export interface GateHistoryHandlerDeps {
  /**
   * Returns the ACTIVE project's gate history directory. Re-invoked on every
   * call (rather than captured once) so a project switch is reflected on the
   * very next channel invocation — mirrors `getResearchDir` in
   * `researchHistoryHandlers.ts` (T39/T41/T48, FR-PRJ-002).
   */
  getGateDir: () => string;
}

/** UUIDs are 36 chars; generous bound keeps this a cheap sanity check, not a format validator. */
const MAX_ID_LENGTH = 200;

/** Registers `gate-history:list`, `gate-history:get`, `gate-history:remove`. */
export function registerGateHistoryHandlers(deps: GateHistoryHandlerDeps): void {
  const { getGateDir } = deps;

  ipcMain.handle(GateHistoryChannels.GATE_HISTORY_LIST, async (): Promise<GateHistoryListResult> => {
    const store = new GateHistoryStore(getGateDir());
    return { records: store.listSummaries() };
  });

  ipcMain.handle(
    GateHistoryChannels.GATE_HISTORY_GET,
    async (_event, payload: GateHistoryGetRequest): Promise<GateHistoryGetResult> => {
      if (!isBoundedString(payload?.id, MAX_ID_LENGTH)) {
        throw new Error(INVALID_REQUEST_MESSAGE);
      }

      const store = new GateHistoryStore(getGateDir());
      const record = store.get(payload.id);
      return record ? toIpcRecord(record) : null;
    },
  );

  ipcMain.handle(
    GateHistoryChannels.GATE_HISTORY_REMOVE,
    async (_event, payload: GateHistoryRemoveRequest): Promise<GateHistoryRemoveResult> => {
      if (!isBoundedString(payload?.id, MAX_ID_LENGTH)) {
        throw new Error(INVALID_REQUEST_MESSAGE);
      }

      const store = new GateHistoryStore(getGateDir());
      return { ok: store.remove(payload.id) };
    },
  );
}

/**
 * Persists one quality-gate run into `gateDir` (FR-WRT-008). Intended to be
 * called from `quality-gate:run`'s success path right after `runQualityGate`
 * resolves — see this task's wiring snippet for `researchGateHandlers.ts`.
 *
 * Save failures are logged and swallowed, never thrown: a broken history
 * write must never fail (or even delay) the gate result the user is already
 * waiting on — mirrors `saveResearchRecord()` in `researchHistoryHandlers.ts`.
 */
export function saveGateRecord(gateDir: string, sectionId: string, text: string, result: GateResult): void {
  try {
    new GateHistoryStore(gateDir).add(sectionId, text, result);
  } catch (err) {
    console.error('[gate-history] failed to save gate record:', err);
  }
}

function toIpcRecord(record: GateRecord): GateHistoryRecord {
  return {
    id: record.id,
    sectionId: record.sectionId,
    ranAt: record.ranAt,
    text: record.text,
    result: record.result,
  };
}
