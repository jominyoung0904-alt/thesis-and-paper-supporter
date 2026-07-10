/**
 * Collapsible chat-session sidebar (T54, SPEC-TSA-002 FR-CHM-002~004).
 *
 * Toggled open/closed from `ChatScreen`'s header (📑 button) rather than
 * always-on — the chat screen is a narrow, centered column (`chat.css`'s
 * `.chat-screen { max-width: 820px }`), so a permanently-docked sidebar
 * would fight the existing KakaoTalk-style layout T35 fixed. Opening the
 * panel re-fetches the session list every time (never on a timer/interval),
 * per this task's brief.
 *
 * Every IPC call flows through `ChatHistoryCallbacks` (built once by
 * `ChatScreen` via `createChatHistoryCallbacks()`); this component never
 * touches `window.thesisApi` directly, matching every other screen.
 */
import { useEffect, useState } from 'react';

import type { ChatHistoryCallbacks } from '../appCallbacks';
import type { ChatHistoryLoadResult, IpcChatSessionSummary } from '../../shared/ipc-channels';
import {
  buildRemoveSessionConfirmMessage,
  buildSessionSubtitle,
  resolveLoadFailureMessage,
  resolveRemoveFailureMessage,
  sortSessionsByRecency,
} from './chatHistoryLogic';
import './chatHistoryPanel.css';

export interface ChatHistoryPanelProps {
  open: boolean;
  callbacks: ChatHistoryCallbacks;
  /** The session id currently loaded into the chat screen, if any — used to reset the screen when that session is deleted. */
  activeSessionId: string | null;
  onClose(): void;
  onSessionLoaded(result: Extract<ChatHistoryLoadResult, { ok: true }>): void;
  onActiveSessionRemoved(): void;
}

export function ChatHistoryPanel({
  open,
  callbacks,
  activeSessionId,
  onClose,
  onSessionLoaded,
  onActiveSessionRemoved,
}: ChatHistoryPanelProps): JSX.Element | null {
  const [sessions, setSessions] = useState<IpcChatSessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadList(): Promise<void> {
    setLoading(true);
    setErrorMessage(null);
    try {
      const result = await callbacks.listChatHistory();
      setSessions(sortSessionsByRecency(result.sessions));
    } catch {
      setErrorMessage('대화 목록을 불러오지 못했어요. 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }

  // Re-fetch every time the panel opens (never on an interval) — matches
  // the "목록 재조회는 패널 열 때만" requirement.
  useEffect(() => {
    if (open) {
      void loadList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) {
    return null;
  }

  async function handleSelect(id: string): Promise<void> {
    if (busyId) return;
    setBusyId(id);
    setErrorMessage(null);
    try {
      const result = await callbacks.loadChatHistory(id);
      if (result.ok) {
        onSessionLoaded(result);
        return;
      }
      setErrorMessage(resolveLoadFailureMessage(result.reason));
      await loadList();
    } catch {
      setErrorMessage('대화를 불러오지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(session: IpcChatSessionSummary): Promise<void> {
    if (busyId || !window.confirm(buildRemoveSessionConfirmMessage(session.title))) return;
    setBusyId(session.id);
    setErrorMessage(null);
    try {
      const result = await callbacks.removeChatHistory(session.id);
      if (!result.ok) {
        setErrorMessage(resolveRemoveFailureMessage(result.reason));
        await loadList();
        return;
      }
      if (session.id === activeSessionId) {
        onActiveSessionRemoved();
      }
      await loadList();
    } catch {
      setErrorMessage('삭제하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="chat-history-panel" role="dialog" aria-label="대화 목록">
      <div className="chat-history-panel-header">
        <h3 className="chat-history-panel-title">지난 대화</h3>
        <button type="button" className="chat-history-panel-close" onClick={onClose} aria-label="대화 목록 닫기">
          ✕
        </button>
      </div>

      {loading && (
        <p className="chat-history-status" role="status">
          불러오는 중이에요…
        </p>
      )}

      {errorMessage && (
        <p className="chat-history-error" role="alert">
          {errorMessage}
        </p>
      )}

      {!loading && sessions.length === 0 && !errorMessage && (
        <p className="chat-history-empty">아직 저장된 대화가 없어요.</p>
      )}

      {!loading && sessions.length > 0 && (
        <ul className="chat-history-list">
          {sessions.map((session) => (
            <li
              key={session.id}
              className={`chat-history-item${session.id === activeSessionId ? ' chat-history-item-active' : ''}`}
            >
              <button
                type="button"
                className="chat-history-item-main"
                disabled={busyId !== null}
                onClick={() => void handleSelect(session.id)}
                aria-label={`${session.title} 대화 열기`}
              >
                <span className="chat-history-item-title">{session.title}</span>
                <span className="chat-history-item-subtitle">{buildSessionSubtitle(session)}</span>
              </button>
              <button
                type="button"
                className="chat-history-item-remove"
                disabled={busyId !== null}
                onClick={() => void handleRemove(session)}
                aria-label={`${session.title} 대화 삭제`}
                title="삭제"
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
