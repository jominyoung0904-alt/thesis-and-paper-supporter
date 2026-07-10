/**
 * IPC handlers for deep research runs and section quality gates
 * (`research:run`, `quality-gate:run`).
 *
 * Split out of `handlers.ts` (T40, SPEC-TSA-002) to keep each domain's
 * handler registration under the project's per-file line limit. Still
 * registered from `registerIpcHandlers`, the single composition root for all
 * channels.
 */

import { ipcMain, type IpcMainInvokeEvent } from 'electron';

import type { AppSettings } from '../config/defaultSettings';
import type { KeyStore } from '../config/keyStore';
import { translateLlmError } from '../../core/llm/errorTranslator';
import type { MemoryStore } from '../../core/memory/store';
import { serializeMemoryForPrompt } from '../../core/memory/serializer';
import { clearCheckpoint, loadCheckpoint, saveCheckpoint } from '../../core/research-pipeline/checkpoint';
import { runDeepResearch } from '../../core/research-pipeline/pipeline';
import { runQualityGate } from '../../core/writing/qualityGate';
import { introductionGateDefinition } from '../../core/writing/gateDefinitions';
import type { SectionGateDefinition } from '../../core/writing/gateDefinitions';
import { IpcChannels } from '../../shared/ipc-channels';
import type {
  QualityGateRunRequest,
  QualityGateRunResult,
  ResearchProgressPayload,
  ResearchRunRequest,
  ResearchRunResult,
} from '../../shared/ipc-channels';
import { buildAcademicClients } from './academicClients';
import { saveGateRecord } from './gateHistoryHandlers';
import { INVALID_REQUEST_MESSAGE, isBoundedString } from './guards';
import { NO_KEY_MESSAGE } from './llmService';
import type { LlmService } from './llmService';
import { saveResearchRecord } from './researchHistoryHandlers';
import { mapDeepResearchResult } from './researchMapper';

export interface ResearchGateHandlerDeps {
  llmService: LlmService;
  /**
   * Returns the ACTIVE project's memory store. Re-invoked on every call
   * (rather than captured once) so a project switch is reflected on the very
   * next channel invocation — see `projectContext.ts` (T39/T41, FR-PRJ-002).
   */
  getMemoryStore: () => MemoryStore;
  keyStore: KeyStore;
  getSettings: () => AppSettings;
  /**
   * Returns the ACTIVE project's research history directory. Passed to
   * `saveResearchRecord()` right after a successful research:run
   * (FR-RSH-001) — re-invoked per call for the same project-switch reason
   * as `getMemoryStore`.
   */
  getResearchDir: () => string;
  /**
   * Returns the ACTIVE project's gate history directory (FR-WRT-008).
   * Re-invoked on every call — same pattern as `getMemoryStore`.
   */
  getGateDir: () => string;
  /**
   * Returns the ACTIVE project's deep-research checkpoint file path
   * (FR-RES-007/008). Like `getMemoryStore`, this accessor returns whichever
   * project is active AT CALL TIME — it does not itself guarantee anything
   * about a single `research:run` execution staying pinned to one project.
   * That atomicity guarantee is the handler's responsibility: it snapshots
   * this (and `getResearchDir`) exactly once at handler entry, before the
   * `await runDeepResearch(...)` below, so a project switch that happens
   * while a run is still in flight can never make that single execution's
   * checkpoint/history writes straddle two different projects' directories
   * (H2, SPEC-TSA-002 Phase 4 review).
   */
  getCheckpointFile: () => string;
}

const MAX_QUESTION_LENGTH = 2_000;
const MAX_GATE_TEXT_LENGTH = 50_000;

// Only 'introduction' ships in phase 1 (FR-WRT-001) — extend this map, not
// the handler below, when future sections (body, conclusion) are added.
const GATE_DEFINITIONS: Record<string, SectionGateDefinition> = {
  introduction: introductionGateDefinition,
};
const VALID_GATE_SECTIONS = Object.keys(GATE_DEFINITIONS);

/** Registers `research:run` and `quality-gate:run`. */
export function registerResearchGateHandlers(deps: ResearchGateHandlerDeps): void {
  const { llmService, getMemoryStore, keyStore, getSettings, getResearchDir, getGateDir, getCheckpointFile } = deps;

  ipcMain.handle(
    IpcChannels.RESEARCH_RUN,
    async (event: IpcMainInvokeEvent, payload: ResearchRunRequest): Promise<ResearchRunResult> => {
      if (!isBoundedString(payload?.question, MAX_QUESTION_LENGTH)) {
        throw new Error(INVALID_REQUEST_MESSAGE);
      }
      if (!llmService.hasKey()) {
        throw new Error(NO_KEY_MESSAGE);
      }

      // H2 fix (SPEC-TSA-002 Phase 4 review): snapshot the active project's
      // paths ONCE here, at handler entry — NOT re-resolved via
      // getResearchDir()/getCheckpointFile() later inside the checkpoint
      // callbacks or after the `await` below. Those accessors always return
      // whichever project is active at the moment they're called; re-calling
      // them mid-run would let a project switch that happens while this run
      // is still in flight silently redirect this SAME execution's
      // checkpoint saves and history record into the NEWLY active project's
      // directories instead of the one this run actually started against.
      const researchDir = getResearchDir();
      const checkpointFile = getCheckpointFile();

      const clients = buildAcademicClients(getSettings(), keyStore);

      try {
        const result = await runDeepResearch({
          question: payload.question,
          memory: serializeMemoryForPrompt(getMemoryStore().getSnapshot()),
          llm: llmService.getAdapter(),
          clients,
          model: llmService.getModel(),
          onProgress: (progressEvent: ResearchProgressPayload) => {
            event.sender.send(IpcChannels.RESEARCH_PROGRESS, progressEvent);
          },
          // FR-RES-007/008: file-bound resume hooks — bound to the
          // entry-time `checkpointFile` snapshot above, never re-resolved.
          checkpoint: {
            load: () => loadCheckpoint(checkpointFile),
            save: (state) => saveCheckpoint(checkpointFile, state),
            clear: () => clearCheckpoint(checkpointFile),
          },
        });
        // Auto-save (FR-RSH-001): saveResearchRecord() owns its own
        // try/catch and only ever logs — it can never throw here and never
        // delays/replaces the response returned below. Uses the entry-time
        // `researchDir` snapshot above (H2), not a fresh getResearchDir() call.
        saveResearchRecord(researchDir, payload.question, result);
        return mapDeepResearchResult(result);
      } catch (err) {
        throw new Error(translateLlmError(err).message);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.QUALITY_GATE_RUN,
    async (_event, payload: QualityGateRunRequest): Promise<QualityGateRunResult> => {
      const definition = VALID_GATE_SECTIONS.includes(payload?.sectionId)
        ? GATE_DEFINITIONS[payload.sectionId]
        : undefined;
      if (!definition || !isBoundedString(payload?.text, MAX_GATE_TEXT_LENGTH)) {
        throw new Error(INVALID_REQUEST_MESSAGE);
      }
      if (!llmService.hasKey()) {
        throw new Error(NO_KEY_MESSAGE);
      }

      // H2 fix: snapshot the active project's gate dir ONCE here, at handler
      // entry — same race rationale as research:run above. getGateDir() must
      // not be re-called after the `await` below.
      const gateDir = getGateDir();

      try {
        const result = await runQualityGate(definition, payload.text, {
          llm: llmService.getAdapter(),
          model: llmService.getModel(),
          memory: serializeMemoryForPrompt(getMemoryStore().getSnapshot()),
        });
        // FR-WRT-008: save-on-success, never blocks/throws on failure. Uses
        // the entry-time `gateDir` snapshot above (H2), not a fresh
        // getGateDir() call.
        saveGateRecord(gateDir, payload.sectionId, payload.text, result);
        return result;
      } catch (err) {
        throw new Error(translateLlmError(err).message);
      }
    },
  );
}
