/**
 * Shape of `window.thesisApi`, the contextBridge surface exposed by
 * `src/main/preload.ts`. Declared once here so both the preload script
 * (implementation) and the renderer's global type declaration (consumer)
 * import the same contract instead of duplicating it.
 */

import type {
  ChatSendResult,
  IpcLlmMode,
  IpcLlmProvider,
  ResearchProgressPayload,
  ResearchRunResult,
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
}
