/**
 * `quality-gate:run` request/result shapes for section quality-gate checks
 * (FR-WRT-001/002).
 */

// --- quality-gate:run ---

/**
 * Section ids whose quality gate can currently be run through IPC.
 * Whitelisted at the handler boundary (only 'introduction' ships in phase 1
 * — see `core/writing/gateDefinitions.ts`).
 */
export type IpcGateSectionId = 'introduction';

export interface QualityGateRunRequest {
  sectionId: IpcGateSectionId;
  text: string;
}

export interface IpcCriterionResult {
  criterionId: string;
  passed: boolean;
  feedback: string;
}

export interface QualityGateRunResult {
  sectionId: string;
  passed: boolean;
  results: IpcCriterionResult[];
  summary: string;
}
