/** Simple "N / total 단계" progress indicator shown at the top of the wizard. */
interface StepIndicatorProps {
  currentIndex: number;
  total: number;
}

export function StepIndicator({ currentIndex, total }: StepIndicatorProps): JSX.Element {
  return (
    <div
      className="wizard-indicator"
      role="progressbar"
      aria-valuenow={currentIndex + 1}
      aria-valuemin={1}
      aria-valuemax={total}
    >
      <span className="wizard-indicator-text">
        {currentIndex + 1} / {total} 단계
      </span>
      <div className="wizard-indicator-dots">
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={`wizard-dot ${i <= currentIndex ? 'wizard-dot-active' : ''}`} />
        ))}
      </div>
    </div>
  );
}
