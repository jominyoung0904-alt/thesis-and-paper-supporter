/**
 * Pure exposure/availability logic for the "🔍+ 상세검색" toggle (paid-mode
 * only feature — see `ResearchRunRequest.detailed` in `shared/ipc/research.ts`
 * and the paid gate enforced defense-in-depth in `researchGateHandlers.ts`).
 *
 * Framework-free like `naverDocBannerLogic.ts` so the condition can be unit
 * tested without a DOM. `useDetailedSearchToggleState.ts` fetches the current
 * LLM mode once on mount (via the optional `callbacks.getLlmStatus`) and
 * tracks the checked state in local component state.
 */
import type { IpcLlmMode } from '../../shared/ipc-channels';
import type { ChatMode } from './chatTypes';

/** Shown inside the collapsible "상세검색이 뭔가요?" info disclosure next to the toggle. */
export const DETAILED_SEARCH_INFO_MESSAGE =
  '상세검색을 켜면 1차 결과를 보고 부족한 부분을 한 번 더 찾아요. 해외 논문을 아주 폭넓게 탐색할 때는 Gemini 딥리서치가 여전히 더 유리하지만, 국내 논문 검색은 성능 차이가 거의 없어요.';

/** Shown as a locked-state hint while free mode has the toggle disabled. */
export const DETAILED_SEARCH_LOCKED_MESSAGE =
  '상세검색은 유료 모드에서 쓸 수 있어요. 검색을 한 번 더 반복해 빠진 논문을 보강해요.';

export interface DetailedSearchVisibilityInput {
  mode: ChatMode;
}

/** Whether the toggle row should render at all — research mode only. */
export function shouldShowDetailedSearchToggle(input: DetailedSearchVisibilityInput): boolean {
  return input.mode === 'research';
}

/**
 * Whether the toggle is actually selectable right now. `llmMode` is `null`
 * while the status hasn't resolved yet (or the callback isn't wired) — the
 * toggle stays locked until it resolves, so it never briefly looks available
 * and then snaps back to locked.
 */
export function isDetailedSearchAvailable(llmMode: IpcLlmMode | null): boolean {
  return llmMode === 'paid';
}
