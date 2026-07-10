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

// --- settings:get-llm-status ---

/**
 * Current provider/mode/key-presence snapshot for the Settings tab's "AI
 * 연결 변경" card (실사용 피드백: no post-onboarding entry point existed to
 * change provider/mode/key). Never carries the key itself — only whether one
 * is currently registered for `provider`.
 */
export interface LlmStatusResult {
  provider: IpcLlmProvider;
  mode: IpcLlmMode;
  hasKey: boolean;
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
