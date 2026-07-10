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
import { INVALID_REQUEST_MESSAGE, isBoundedString } from './guards';
import { NO_KEY_MESSAGE } from './llmService';
import type { LlmService } from './llmService';
import { mapDeepResearchResult } from './researchMapper';

export interface ResearchGateHandlerDeps {
  llmService: LlmService;
  memoryStore: MemoryStore;
  keyStore: KeyStore;
  getSettings: () => AppSettings;
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
  const { llmService, memoryStore, keyStore, getSettings } = deps;

  ipcMain.handle(
    IpcChannels.RESEARCH_RUN,
    async (event: IpcMainInvokeEvent, payload: ResearchRunRequest): Promise<ResearchRunResult> => {
      if (!isBoundedString(payload?.question, MAX_QUESTION_LENGTH)) {
        throw new Error(INVALID_REQUEST_MESSAGE);
      }
      if (!llmService.hasKey()) {
        throw new Error(NO_KEY_MESSAGE);
      }

      const clients = buildAcademicClients(getSettings(), keyStore);

      try {
        const result = await runDeepResearch({
          question: payload.question,
          memory: serializeMemoryForPrompt(memoryStore.getSnapshot()),
          llm: llmService.getAdapter(),
          clients,
          model: llmService.getModel(),
          onProgress: (progressEvent: ResearchProgressPayload) => {
            event.sender.send(IpcChannels.RESEARCH_PROGRESS, progressEvent);
          },
        });
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

      try {
        return await runQualityGate(definition, payload.text, {
          llm: llmService.getAdapter(),
          model: llmService.getModel(),
          memory: serializeMemoryForPrompt(memoryStore.getSnapshot()),
        });
      } catch (err) {
        throw new Error(translateLlmError(err).message);
      }
    },
  );
}
