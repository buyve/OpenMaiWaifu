import { useState, useCallback } from "react";
import type { PrivacySettings as PrivacySettingsType, ScreenWatchFrequency } from "../../lib/privacyManager.ts";
import { Toggle } from "./Toggle.tsx";

// ---------- Frequency Slider ----------

const FREQUENCY_VALUES: ScreenWatchFrequency[] = ["off", "low", "medium", "high"];
const FREQUENCY_LABELS: Record<ScreenWatchFrequency, string> = {
  off: "Off",
  low: "Low (1min)",
  medium: "Medium (5s)",
  high: "High (1s)",
};

// ---------- Types ----------

export interface PrivacySettingsProps {
  privacySettings: PrivacySettingsType;
  onPrivacySettingsChange: (partial: Partial<PrivacySettingsType>) => void;
}

// ---------- Component ----------

export default function PrivacySettings({
  privacySettings,
  onPrivacySettingsChange,
}: PrivacySettingsProps) {
  const [blacklistInput, setBlacklistInput] = useState("");

  const handleScreenWatchToggle = useCallback(
    (enabled: boolean) => {
      onPrivacySettingsChange({ screenWatchEnabled: enabled });
    },
    [onPrivacySettingsChange],
  );

  const freqIndex = FREQUENCY_VALUES.indexOf(privacySettings.frequency);

  const handleFrequencySlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const idx = parseInt(e.target.value, 10);
      onPrivacySettingsChange({ frequency: FREQUENCY_VALUES[idx] });
    },
    [onPrivacySettingsChange],
  );

  const handleCaptureToggle = useCallback(
    (enabled: boolean) => {
      onPrivacySettingsChange({ captureEnabled: enabled });
    },
    [onPrivacySettingsChange],
  );

  const handleAddBlacklist = useCallback(() => {
    const appName = blacklistInput.trim();
    if (!appName) return;

    const current = privacySettings.blacklistedApps;
    if (!current.some((a) => a.toLowerCase() === appName.toLowerCase())) {
      onPrivacySettingsChange({
        blacklistedApps: [...current, appName],
      });
    }
    setBlacklistInput("");
  }, [blacklistInput, privacySettings.blacklistedApps, onPrivacySettingsChange]);

  const handleRemoveBlacklist = useCallback(
    (appName: string) => {
      const updated = privacySettings.blacklistedApps.filter(
        (a) => a.toLowerCase() !== appName.toLowerCase(),
      );
      onPrivacySettingsChange({ blacklistedApps: updated });
    },
    [privacySettings.blacklistedApps, onPrivacySettingsChange],
  );

  const handleBlacklistKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddBlacklist();
      }
    },
    [handleAddBlacklist],
  );

  return (
    <div className="settings-card">
      <div className="settings-card-title">Privacy</div>

      <div className="settings-row">
        <div className="settings-row-label">
          Screen Awareness
        </div>
        <Toggle
          checked={privacySettings.screenWatchEnabled}
          onChange={handleScreenWatchToggle}
        />
      </div>

      <div className="settings-row">
        <div className="settings-row-label">
          Polling Frequency
          <div className="settings-row-sublabel">
            How often to check active window
          </div>
        </div>
        <div className="settings-slider-container">
          <input
            type="range"
            className="settings-slider"
            min={0}
            max={3}
            step={1}
            value={freqIndex}
            onChange={handleFrequencySlider}
            disabled={!privacySettings.screenWatchEnabled}
          />
          <span className="settings-slider-label">
            {FREQUENCY_LABELS[privacySettings.frequency]}
          </span>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row-label">
          Screen Capture
          <div className="settings-row-sublabel">
            Coming Soon
          </div>
        </div>
        <Toggle
          checked={privacySettings.captureEnabled}
          onChange={handleCaptureToggle}
          disabled
        />
      </div>

      {/* Blacklisted Apps */}
      <div
        className="settings-row"
        style={{ flexDirection: "column", alignItems: "stretch" }}
      >
        <span className="settings-row-label">App Blacklist</span>
        <div className="settings-blacklist">
          {privacySettings.blacklistedApps.map((app) => (
            <span key={app} className="settings-blacklist-tag">
              {app}
              <button
                className="settings-blacklist-remove"
                onClick={() => handleRemoveBlacklist(app)}
                aria-label={`Remove ${app}`}
              >
                x
              </button>
            </span>
          ))}
          {privacySettings.blacklistedApps.length === 0 && (
            <span
              style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}
            >
              No apps blacklisted
            </span>
          )}
        </div>
        <div className="settings-blacklist-input">
          <input
            type="text"
            placeholder="Add app name..."
            value={blacklistInput}
            onChange={(e) => setBlacklistInput(e.target.value)}
            onKeyDown={handleBlacklistKeyDown}
          />
          <button
            className="settings-btn"
            onClick={handleAddBlacklist}
            disabled={!blacklistInput.trim()}
          >
            Add
          </button>
        </div>
      </div>

    </div>
  );
}
