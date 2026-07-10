/**
 * Shared name-input form used by `ProjectSwitcher`'s "create" and "rename"
 * modes (T42, SPEC-TSA-002 FR-PRJ-001/003). Split out purely to keep
 * `ProjectSwitcher.tsx` under the project's 300-line file limit.
 */
export interface ProjectNameFormProps {
  label: string;
  placeholder: string;
  value: string;
  busy: boolean;
  canSubmit: boolean;
  submitLabel: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function ProjectNameForm({
  label,
  placeholder,
  value,
  busy,
  canSubmit,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: ProjectNameFormProps): JSX.Element {
  return (
    <div className="project-switcher-form">
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="project-switcher-input"
        aria-label={label}
        disabled={busy}
        autoFocus
      />
      <div className="project-switcher-form-actions">
        <button type="button" className="project-switcher-confirm-btn" disabled={!canSubmit} onClick={onSubmit}>
          {submitLabel}
        </button>
        <button type="button" className="project-switcher-cancel-btn" disabled={busy} onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  );
}
