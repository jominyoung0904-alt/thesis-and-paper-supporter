/**
 * `settings:save-provider-and-key` and `chat:send` request/result shapes
 * (LLM provider settings + "아이디어 회의" chat turns).
 */

import type { IpcLlmMode, IpcLlmProvider } from './common';

// --- settings:save-provider-and-key ---

export interface SaveProviderAndKeyRequest {
  provider: IpcLlmProvider;
  key: string;
  mode: IpcLlmMode;
}

export interface SaveProviderAndKeyResult {
  ok: boolean;
  /** Korean-language message. Required on failure, optional on success. */
  message?: string;
}

// --- chat:send ---

export interface ChatSendRequest {
  text: string;
}

export interface IpcSuggestedDecision {
  what: string;
  why: string;
}

export interface ChatSendResult {
  reply: string;
  suggestedDecision?: IpcSuggestedDecision;
}
