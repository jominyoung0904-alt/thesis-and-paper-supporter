/**
 * Two-button mode toggle shown above the input box:
 * "💬 아이디어 회의" (discuss, default) vs "🔍 논문 찾기" (research).
 * Locked while a chat turn or research run is in flight.
 */
import type { ChatMode } from './chatTypes';

interface ModeToggleProps {
  mode: ChatMode;
  disabled: boolean;
  onSelect(mode: ChatMode): void;
}

export function ModeToggle({ mode, disabled, onSelect }: ModeToggleProps): JSX.Element {
  return (
    <div className="chat-mode-toggle" role="group" aria-label="대화 모드 선택">
      <button
        type="button"
        className={`chat-mode-btn${mode === 'discuss' ? ' chat-mode-btn-active' : ''}`}
        aria-pressed={mode === 'discuss'}
        disabled={disabled}
        onClick={() => onSelect('discuss')}
      >
        💬 아이디어 회의
      </button>
      <button
        type="button"
        className={`chat-mode-btn${mode === 'research' ? ' chat-mode-btn-active' : ''}`}
        aria-pressed={mode === 'research'}
        disabled={disabled}
        onClick={() => onSelect('research')}
      >
        🔍 논문 찾기
      </button>
    </div>
  );
}
