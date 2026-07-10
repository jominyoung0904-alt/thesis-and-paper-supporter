/**
 * Shape of `window.thesisApi`, the contextBridge surface exposed by
 * `src/main/preload.ts`. Declared once here so both the preload script
 * (implementation) and the renderer's global type declaration (consumer)
 * import the same contract instead of duplicating it.
 */

import type {
  AcademicKeyStatus,
  ChatSendResult,
  IpcAcademicKeyProvider,
  IpcGateSectionId,
  IpcLlmMode,
  IpcLlmProvider,
  QualityGateRunResult,
  ResearchProgressPayload,
  ResearchRunResult,
  SaveAcademicKeyResult,
  SaveProviderAndKeyResult,
  StartupState,
} from './ipc-channels';

export interface ThesisApi {
  /** Whether this is the first run (no LLM provider key registered yet). */
  getStartupState(): Promise<StartupState>;
  /** Persists the chosen provider + API key and verifies connectivity. */
  saveProviderAndKey(provider: IpcLlmProvider, key: string, mode: IpcLlmMode): Promise<SaveProviderAndKeyResult>;
  /** Opens an allow-listed URL in the user's default external browser. */
  openExternal(url: string): void;
  /** Sends one "아이디어 회의" chat turn and returns the assistant's reply. */
  sendChat(text: string): Promise<ChatSendResult>;
  /** Runs a full deep-research pass, streaming progress via `onProgress`. */
  runResearch(question: string, onProgress: (event: ResearchProgressPayload) => void): Promise<ResearchRunResult>;
  /** Persists a confirmed research decision. */
  saveDecision(what: string, why: string): Promise<void>;
  /** Runs a section quality-gate check against user-supplied text (FR-WRT-001/002). */
  runQualityGate(sectionId: IpcGateSectionId, text: string): Promise<QualityGateRunResult>;
  /** Saves a personal academic-search API key (NFR-ACAPI-002). */
  saveAcademicKey(provider: IpcAcademicKeyProvider, key: string): Promise<SaveAcademicKeyResult>;
  /** Reports which academic-search providers currently have a key registered. */
  getAcademicKeyStatus(): Promise<AcademicKeyStatus>;
}
