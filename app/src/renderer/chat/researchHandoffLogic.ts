/**
 * Pure(ish) id-resolution helper for the chat-screen "이 결과로 회의하기"
 * button (Task T51, FR-RSH-003). Framework-free so it stays unit-testable
 * without a DOM, matching `chatHistoryLogic.ts` / `chatUiLogic.ts`.
 *
 * `research:run`'s response never carries a saved-history id — the
 * auto-save (`saveResearchRecord`) runs as a fire-and-forget side effect
 * only AFTER the response the renderer sees is already built (see
 * `researchHistoryHandlers.ts`'s doc comment). By the time this button is
 * clickable the run has already finished and its record was written
 * synchronously, so `research-history:list`'s first (most-recent) entry IS
 * that just-finished result — `ResearchHistoryStore.listSummaries()` sorts
 * most-recently-updated first (see `core/research-history/store.ts`).
 */
import type { ResearchHandoffStartResult } from '../../shared/ipc/researchHandoff';
import type { ResearchHistoryListResult } from '../../shared/ipc/researchHistory';

/**
 * Looks up the most recently saved research record and starts the handoff
 * for it. Both dependencies are injected (rather than reaching for
 * `window.thesisApi` directly) so this stays independently testable.
 */
export async function startHandoffFromLatestResult(
  listResearchHistory: () => Promise<ResearchHistoryListResult>,
  startResearchHandoff: (researchId: string) => Promise<ResearchHandoffStartResult>,
): Promise<ResearchHandoffStartResult> {
  const list = await listResearchHistory();
  const latest = list.records[0];
  if (!latest) {
    return { ok: false, reason: 'not_found' };
  }
  return startResearchHandoff(latest.id);
}
