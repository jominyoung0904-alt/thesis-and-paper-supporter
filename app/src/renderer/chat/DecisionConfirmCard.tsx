/**
 * Decision confirmation card (FR-CHT-002).
 *
 * Shown under the chat when the assistant suggests recording a research
 * decision. `saveDecision` is only ever called after the user explicitly
 * clicks [기록하기] — the assistant's suggestion alone never writes memory.
 */
import type { SuggestedDecision } from './chatTypes';
import type { DecisionCardState } from './chatUiLogic';

interface DecisionConfirmCardProps {
  card: DecisionCardState;
  onConfirm(decision: SuggestedDecision): void;
  onDismiss(): void;
}

export function DecisionConfirmCard({ card, onConfirm, onDismiss }: DecisionConfirmCardProps): JSX.Element | null {
  if (card.status === 'hidden' || card.status === 'dismissed' || !card.decision) {
    return null;
  }

  const saving = card.status === 'saving';
  const saved = card.status === 'saved';

  return (
    <div className="decision-card" role="region" aria-label="연구 결정 기록 제안">
      <p className="decision-card-title">이 내용을 연구 결정으로 기록할까요?</p>
      <p className="decision-card-line">
        <strong>무엇:</strong> {card.decision.what}
      </p>
      <p className="decision-card-line">
        <strong>왜:</strong> {card.decision.why}
      </p>
      {card.errorMessage && <p className="decision-card-error">{card.errorMessage}</p>}
      {saved ? (
        <p className="decision-card-saved">기록했어요.</p>
      ) : (
        <div className="decision-card-actions">
          <button
            type="button"
            className="decision-card-btn decision-card-btn-primary"
            disabled={saving}
            onClick={() => card.decision && onConfirm(card.decision)}
          >
            {saving ? '기록하는 중...' : '기록하기'}
          </button>
          <button type="button" className="decision-card-btn decision-card-btn-secondary" disabled={saving} onClick={onDismiss}>
            아니요
          </button>
        </div>
      )}
    </div>
  );
}
