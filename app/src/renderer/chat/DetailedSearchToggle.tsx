/**
 * "🔍+ 상세검색" checkbox shown above `.chat-input-row` in research mode only
 * (`ChatMode.mode === 'research'` — see `shouldShowDetailedSearchToggle` in
 * `detailedSearchLogic.ts`, which `MessageInput.tsx` calls before mounting
 * this component). Locked (and shows a small hint) on free mode — the
 * "상세검색" pipeline pass is paid-tier only, gated defense-in-depth in
 * `researchGateHandlers.ts`.
 *
 * The longer explanation ("상세검색이 뭔가요?") is a `<details>` disclosure so
 * it never crowds the input row by default, same calmer-tone rationale as
 * `NaverDocBanner.tsx`.
 */
import { DETAILED_SEARCH_INFO_MESSAGE, DETAILED_SEARCH_LOCKED_MESSAGE } from './detailedSearchLogic';

interface DetailedSearchToggleProps {
  available: boolean;
  checked: boolean;
  disabled: boolean;
  onChange(checked: boolean): void;
}

export function DetailedSearchToggle({
  available,
  checked,
  disabled,
  onChange,
}: DetailedSearchToggleProps): JSX.Element {
  return (
    <div className="detailed-search-row">
      <label
        className="detailed-search-label"
        title={available ? undefined : DETAILED_SEARCH_LOCKED_MESSAGE}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled || !available}
          onChange={(event) => onChange(event.target.checked)}
          aria-label="상세검색 켜기/끄기"
        />
        🔍+ 상세검색
      </label>
      {!available && <span className="detailed-search-locked-hint">{DETAILED_SEARCH_LOCKED_MESSAGE}</span>}
      <details className="detailed-search-info">
        <summary>상세검색이 뭔가요?</summary>
        <p>{DETAILED_SEARCH_INFO_MESSAGE}</p>
      </details>
    </div>
  );
}
