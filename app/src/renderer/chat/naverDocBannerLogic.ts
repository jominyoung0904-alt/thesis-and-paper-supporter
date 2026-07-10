/**
 * Pure exposure-condition logic for the "네이버 전문자료 미연결" info banner
 * (실사용 피드백 #2) shown above `MessageInput` in research mode.
 *
 * Framework-free like `slowResponseLogic.ts` so the condition can be unit
 * tested without a DOM. `ChatScreen.tsx` fetches the naverdoc key status
 * once on mount (via the optional `callbacks.getAcademicKeyStatus`) and
 * tracks a session-only "dismissed" flag in local state — in-memory state is
 * enough per the feature request, no need to persist the dismissal across
 * app restarts.
 */
import type { ChatMode } from './chatTypes';

/** Shown above `MessageInput` while research mode is active and naverdoc isn't registered yet. */
export const NAVER_DOC_BANNER_MESSAGE =
  '네이버 전문자료를 연결하면 국내 학위논문까지 검색돼요. ⚙️ 설정 탭에서 연결할 수 있어요. (연결 없이도 해외 논문과 국내 학술지 검색은 가능해요)';

export interface NaverDocBannerConditionInput {
  mode: ChatMode;
  /** `null` while the key status hasn't loaded yet (or the callback isn't wired) — the banner stays hidden until it resolves, so it never flashes an incorrect state. */
  naverDocRegistered: boolean | null;
  /** True once the user has clicked 닫기 this session. */
  dismissed: boolean;
}

/** Whether the banner should be visible right now, given the current mode + key status + dismissal state. */
export function shouldShowNaverDocBanner(input: NaverDocBannerConditionInput): boolean {
  if (input.dismissed) {
    return false;
  }
  if (input.mode !== 'research') {
    return false;
  }
  if (input.naverDocRegistered === null) {
    return false;
  }
  return !input.naverDocRegistered;
}
