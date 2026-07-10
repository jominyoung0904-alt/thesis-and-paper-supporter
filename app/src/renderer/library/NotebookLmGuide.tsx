/**
 * Collapsible non-developer walkthrough for using Google NotebookLM with
 * saved papers (FR-LIB-003). Purely presentational — never calls
 * `thesisApi` directly, only `onOpenLink` (same pattern as the rest of this
 * screen; see `LibraryScreenCallbacks.openLink`).
 */

const NOTEBOOK_LM_URL = 'https://notebooklm.google.com';

export interface NotebookLmGuideProps {
  onOpenLink(url: string): void;
}

export function NotebookLmGuide({ onOpenLink }: NotebookLmGuideProps): JSX.Element {
  return (
    <details className="library-guide">
      <summary className="library-guide-summary">
        📔 노트북LM으로 저장한 논문만 가지고 깊이 있는 회의하기
      </summary>
      <ol className="library-guide-steps">
        <li>
          notebooklm.google.com에 접속해요 (구글 계정으로 무료로 쓸 수 있어요).{' '}
          <button type="button" className="library-guide-link-btn" onClick={() => onOpenLink(NOTEBOOK_LM_URL)}>
            노트북LM 열기
          </button>
        </li>
        <li>새 노트북을 만들어요.</li>
        <li>
          소스를 추가해요: 위 "📔 노트북LM용 자료 복사" 버튼으로 복사한 내용을 '복사된 텍스트'로 붙여넣으면 돼요.
          가능하면 원문 링크에서 PDF를 받아 PDF로 올리는 게 훨씬 좋아요 (초록보다 원문이 더 깊은 내용을 담고 있어요).
        </li>
        <li>이제 질문하면, 올린 자료 안에서만 출처 표시와 함께 답해 줘요.</li>
        <li className="library-guide-why">
          왜 노트북LM일까요? 올린 자료 밖의 내용은 답하지 않아서, 출처가 중요한 논문 작업에 안전해요.
        </li>
      </ol>
    </details>
  );
}
