/**
 * Shared types for the single-chat interface (Task T17 / SPEC-TSA-001).
 *
 * FR-CHT-001/002 and the "채팅 하나로 모든 기능" UX principle require one
 * screen that handles both free-form research discussion and deep-research
 * runs. This module locally mirrors the shapes exposed by
 * `src/core/research-pipeline/types.ts` (`ProgressEvent`, the paper/report
 * fields of `DeepResearchResult`) instead of depending on that module's full
 * surface, so this directory stays decoupled from core internals the same
 * way `wizardTypes.ts` mirrors `src/main/config/defaultSettings.ts`. Central
 * integration (see completion report) is responsible for adapting the real
 * `DeepResearchResult` / `ProgressEvent` into the shapes below.
 *
 * Like the wizard, this screen never touches IPC directly — it is a pure
 * function of `ChatScreenCallbacks`, which the central app shell wires to
 * the real `window.api.*` preload bridge.
 */

/** Chat mode toggle shown above the input box. */
export type ChatMode = 'discuss' | 'research';

/** Bubble kinds rendered by `MessageList`. `summary` is a collapsed, greyed-out prior-context recap. */
export type ChatMessageRole = 'user' | 'assistant' | 'summary';

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  text: string;
  createdAt: number;
}

/** A research decision the assistant proposes recording (FR-CHT-002). */
export interface SuggestedDecision {
  what: string;
  why: string;
}

export interface ChatReplyResult {
  reply: string;
  suggestedDecision?: SuggestedDecision;
}

/** Progress signal mirrored from `ProgressEvent` in the research pipeline core. */
export interface ResearchProgressEvent {
  stage: string;
  detail?: string;
}

/** Paper row mirrored from the screened-paper shape of `DeepResearchResult`. */
export interface ResearchPaperView {
  title: string;
  authors: string[];
  year: number | null;
  url: string | null;
  source: string;
}

/** Failed-source row mirrored from `DeepResearchResult.failedSources`. */
export interface ResearchFailedSourceView {
  source: string;
  reason: string;
}

/** Trimmed view of `DeepResearchResult` this screen actually renders. */
export interface ResearchView {
  report: string;
  papers: ResearchPaperView[];
  failedSources: ResearchFailedSourceView[];
}

/**
 * Host-provided callbacks. The screen never calls IPC or opens links
 * itself — every side effect (chat turn, deep-research run, decision
 * persistence, external link open) is delegated here.
 */
export interface ChatScreenCallbacks {
  /** Sends one chat turn in "아이디어 회의" mode and returns the assistant's reply. */
  sendChat(text: string): Promise<ChatReplyResult>;
  /** Runs a full deep-research pass in "논문 찾기" mode, streaming progress. */
  runResearch(question: string, onProgress: (event: ResearchProgressEvent) => void): Promise<ResearchView>;
  /** Persists a confirmed research decision. Called only after the user clicks [기록하기]. */
  saveDecision(what: string, why: string): Promise<void>;
  /** Opens a URL in the user's default external browser (never a raw `<a target=_blank>`). */
  openLink(url: string): void;
}

export interface ChatScreenProps {
  callbacks: ChatScreenCallbacks;
}
