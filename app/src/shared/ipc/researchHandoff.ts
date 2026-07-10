/**
 * `research-handoff:*` IPC channel names + request/result shapes
 * (FR-RSH-003, T51 / SPEC-TSA-002).
 *
 * Backs the "이 결과로 회의하기" button: starting a handoff loads a saved
 * research record's report + reference lists as the opening turns of a
 * brand-new chat (via `core/chat/researchHandoff.ts`'s
 * `buildResearchHandoffHistory`), so the user can keep discussing the result
 * with the AI without re-explaining it.
 *
 * `ResearchHandoffChannels` is a self-contained constant (not re-exported
 * through the central `shared/ipc/channels.ts` barrel yet) so this domain's
 * handler module (`main/ipc/researchHandoffHandlers.ts`) compiles in
 * isolation before the central wiring pass folds it in — same pattern as
 * `research-history.ts`'s own doc comment explains for T48/T51's shared
 * split; see this task's "배선 명세" completion-report section for the exact
 * snippets to fold into `channels.ts` / `index.ts` / `handlers.ts` /
 * `preload.ts` / `thesisApi.ts`.
 *
 * Reuses `IpcChatMessage` from `chatHistory.ts` (rather than mirroring it
 * again) for the injected-turn payload the UI renders after a successful
 * handoff — both shapes describe the exact same "one chat transcript entry"
 * concept, and `chatHistory.ts` is a stable, already-wired sibling file this
 * module only ever reads from.
 */

import type { IpcChatMessage } from './chatHistory';

export const ResearchHandoffChannels = {
  /** Starts a "이 결과로 회의하기" handoff for a saved research record. */
  RESEARCH_HANDOFF_START: 'research-handoff:start',
} as const;

export type ResearchHandoffChannelName = (typeof ResearchHandoffChannels)[keyof typeof ResearchHandoffChannels];

// --- research-handoff:start ---

export interface ResearchHandoffStartRequest {
  researchId: string;
}

export type ResearchHandoffStartFailureReason =
  /** No saved research record matches `researchId` (unknown id or already deleted). */
  | 'not_found'
  /** No LLM provider key is registered yet — mirrors `chat:send`'s NO_KEY_MESSAGE case. */
  | 'no_key';

export type ResearchHandoffStartResult =
  | {
      ok: true;
      /** Short Korean banner text describing what was just injected (`buildHandoffPreview`). */
      preview: string;
      /** The injected turns (user summary + assistant acceptance), for immediate UI rendering. */
      messages: IpcChatMessage[];
    }
  | { ok: false; reason: ResearchHandoffStartFailureReason };
