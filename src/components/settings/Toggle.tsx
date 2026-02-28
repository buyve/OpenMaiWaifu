// ---------- Types ----------

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

// ---------- Component ----------

export function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <label className="settings-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="settings-toggle-track" />
      <span className="settings-toggle-thumb" />
    </label>
  );
}
