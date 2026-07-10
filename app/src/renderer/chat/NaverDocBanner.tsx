/**
 * Info banner shown above `MessageInput` in research mode when naverdoc
 * isn't registered yet (실사용 피드백 #2). Purely presentational —
 * `shouldShowNaverDocBanner` in `naverDocBannerLogic.ts` decides visibility;
 * `ChatScreen.tsx` only mounts this component once that's true.
 *
 * Deliberately styled distinct from `.chat-slow-response-banner` (warning
 * tone, amber) — this is informational, not a "something may be wrong"
 * signal, so it uses a calmer blue tone (see `chat.css`).
 */
import { NAVER_DOC_BANNER_MESSAGE } from './naverDocBannerLogic';

interface NaverDocBannerProps {
  onNavigateToSettings?: () => void;
  onDismiss(): void;
}

export function NaverDocBanner({ onNavigateToSettings, onDismiss }: NaverDocBannerProps): JSX.Element {
  return (
    <div className="chat-naver-banner" role="status">
      <p className="chat-naver-banner-text">{NAVER_DOC_BANNER_MESSAGE}</p>
      <div className="chat-naver-banner-actions">
        {onNavigateToSettings && (
          <button type="button" className="chat-naver-banner-btn" onClick={onNavigateToSettings}>
            설정으로 가기
          </button>
        )}
        <button
          type="button"
          className="chat-naver-banner-dismiss"
          aria-label="네이버 안내 배너 닫기"
          onClick={onDismiss}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
