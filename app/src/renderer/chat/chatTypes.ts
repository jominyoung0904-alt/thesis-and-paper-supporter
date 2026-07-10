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
 *
 * `ResearchPaperView.metadata` (Task T45, FR-LIB) is the one deliberate
 * exception to the "mirror, don't import" rule above: it reuses
 * `IpcPaperMetadata` from the shared IPC layer as-is (not core), since the
 * library-save button in `ResearchProgress.tsx` needs the paper's full raw
 * metadata (source + externalId, the duplicate-detection key) to call
 * `saveToLibrary`. `ChatScreenCallbacks.getAcademicKeyStatus` (실사용 피드백
 * #2) is a second, equally deliberate exception, reusing `AcademicKeyStatus`
 * as-is so the naverdoc-connect banner never drifts from what
 * `SettingsScreen` itself considers "registered".
 */
import type { AcademicKeyStatus, IpcPaperMetadata } from '../../shared/ipc-channels';
import type { IpcChatMessage } from '../../shared/ipc/chatHistory';
import type { ResearchHandoffStartResult } from '../../shared/ipc/researchHandoff';

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
  /** Full raw metadata — the library-save button's `saveToLibrary` input (Task T45, FR-LIB-001). */
  metadata: IpcPaperMetadata;
}

/** Failed-source row mirrored from `DeepResearchResult.failedSources`. */
export interface ResearchFailedSourceView {
  source: string;
  reason: string;
}

/** Trimmed view of `DeepResearchResult` this screen actually renders. */
export interface ResearchView {
  report: string;
  /** Every screened paper (high/medium/low). Kept for backward compatibility. */
  papers: ResearchPaperView[];
  /** Papers actually cited in `report`'s body; array position (+1) is the `[n]` shown in text. */
  citedPapers: ResearchPaperView[];
  /** Medium-relevance papers never cited in `report`, capped at 8 — "관련이 있을 수 있는 문헌". */
  relatedPapers: ResearchPaperView[];
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
  /**
   * Starts a "이 결과로 회의하기" handoff for a saved research record
   * (FR-RSH-003, T51): reloads its report + reference lists as the opening
   * turns of a brand-new chat. Optional — undefined until T62 wires
   * `appCallbacks.ts`'s `createChatScreenCallbacks()` to the real
   * `thesisApi.startResearchHandoff` bridge method; `ResearchProgress`'s
   * handoff button stays hidden while this is absent.
   */
  startResearchHandoff?(researchId: string): Promise<ResearchHandoffStartResult>;
  /**
   * Reports which academic-search providers currently have a key registered
   * — used only to decide whether the naverdoc-connect info banner should
   * show in research mode (실사용 피드백 #2). Optional — undefined until
   * `appCallbacks.ts` wires the real `thesisApi.getAcademicKeyStatus` bridge
   * method; the banner never renders while this is absent.
   */
  getAcademicKeyStatus?(): Promise<AcademicKeyStatus>;
}

export interface ChatScreenProps {
  callbacks: ChatScreenCallbacks;
  /**
   * A handoff injected from a different top-level tab (SPEC-TSA-002, T62) —
   * e.g. "이 결과로 회의하기" clicked from the 🔍 리서치 tab's record detail
   * view. `App.tsx` sets this once, right after switching `mainTab` to
   * `'chat'`; this screen loads it into the transcript the same way its own
   * in-screen handoff button does, then calls `onHandoffConsumed` so a later
   * re-render never re-injects the same handoff.
   */
  pendingHandoff?: { messages: IpcChatMessage[]; preview: string } | null;
  /** Notifies the host shell that `pendingHandoff` was consumed (one-shot). */
  onHandoffConsumed?: () => void;
  /**
   * Switches the host shell's top-level tab to "⚙️ 설정" (실사용 피드백 #2) —
   * wired by `App.tsx` to `setMainTab('settings')`. Optional so this screen
   * still renders standalone (e.g. in isolation/tests) without it; the
   * naverdoc banner's [설정으로 가기] button just does nothing if absent.
   */
  onNavigateToSettings?: () => void;
}
