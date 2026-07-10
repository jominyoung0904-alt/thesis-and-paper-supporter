/**
 * Bottom input area: mode toggle + textarea + send button.
 * Placeholder and send-button label change with the active mode so a
 * non-technical user always knows what pressing 보내기 will do.
 */
import type { ChatMode } from './chatTypes';
import { DetailedSearchToggle } from './DetailedSearchToggle';
import { shouldShowDetailedSearchToggle } from './detailedSearchLogic';
import { ModeToggle } from './ModeToggle';
import './detailedSearchToggle.css';

interface MessageInputProps {
  mode: ChatMode;
  text: string;
  canSend: boolean;
  modeLocked: boolean;
  busy: boolean;
  /** Whether the "🔍+ 상세검색" checkbox is selectable right now (paid mode only). */
  detailedSearchAvailable: boolean;
  detailedSearchChecked: boolean;
  onChangeMode(mode: ChatMode): void;
  onChangeText(text: string): void;
  onSend(): void;
  onToggleDetailedSearch(checked: boolean): void;
}

const PLACEHOLDER: Record<ChatMode, string> = {
  discuss: '연구 아이디어나 궁금한 점을 편하게 적어 주세요.',
  research: '어떤 주제의 논문을 찾아드릴까요? (예: 초등 영어 몰입교육 효과)',
};

const SEND_LABEL: Record<ChatMode, string> = {
  discuss: '보내기',
  research: '논문 찾기',
};

export function MessageInput({
  mode,
  text,
  canSend,
  modeLocked,
  busy,
  detailedSearchAvailable,
  detailedSearchChecked,
  onChangeMode,
  onChangeText,
  onSend,
  onToggleDetailedSearch,
}: MessageInputProps): JSX.Element {
  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey && canSend) {
      event.preventDefault();
      onSend();
    }
  }

  return (
    <div className="chat-input-area">
      <ModeToggle mode={mode} disabled={modeLocked} onSelect={onChangeMode} />
      {shouldShowDetailedSearchToggle({ mode }) && (
        <DetailedSearchToggle
          available={detailedSearchAvailable}
          checked={detailedSearchChecked}
          disabled={busy}
          onChange={onToggleDetailedSearch}
        />
      )}
      <div className="chat-input-row">
        <textarea
          className="chat-input-textarea"
          value={text}
          placeholder={PLACEHOLDER[mode]}
          onChange={(event) => onChangeText(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={busy}
          aria-label={mode === 'discuss' ? '메시지 입력' : '논문 검색어 입력'}
          rows={3}
        />
        <button type="button" className="chat-send-btn" disabled={!canSend} onClick={onSend}>
          {busy ? '처리 중...' : SEND_LABEL[mode]}
        </button>
      </div>
    </div>
  );
}
