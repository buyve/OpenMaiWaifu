import { useState, useCallback, useRef, useEffect } from "react";
import type { PrivacySettings } from "../lib/privacyManager.ts";
import { isEnabled, enable, disable } from "@tauri-apps/plugin-autostart";
import { invoke } from "@tauri-apps/api/core";
import { log } from "../lib/logger.ts";
import { locale, getLocaleCode, setLocale, LOCALE_OPTIONS } from "../lib/i18n";
import type { SupportedLocale } from "../lib/i18n";
import OpenClawSettings from "./settings/OpenClawSettings.tsx";
import BehaviorSettings from "./settings/BehaviorSettings.tsx";
import PrivacySettingsCard from "./settings/PrivacySettings.tsx";
import { Toggle } from "./settings/Toggle.tsx";
import "./Settings.css";

// ---------- Autostart Toggle ----------

function AutostartToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isEnabled()
      .then(setEnabled)
      .catch(() => setEnabled(false))
      .finally(() => setLoading(false));
  }, []);

  // Auto-clear error
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  const toggle = useCallback(async () => {
    setError(null);
    try {
      if (enabled) {
        await disable();
        setEnabled(false);
      } else {
        await enable();
        setEnabled(true);
      }
    } catch (err) {
      log.error("[Settings] autostart toggle failed:", err);
      setError(locale().ui_autostart_error);
    }
  }, [enabled]);

  return (
    <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="settings-row-label">{locale().ui_autostart}</span>
        <Toggle checked={enabled} onChange={toggle} disabled={loading} />
      </div>
      {error && (
        <span style={{ fontSize: 11, color: "rgba(248, 113, 113, 0.9)", marginTop: 4 }}>
          {error}
        </span>
      )}
    </div>
  );
}

// ---------- Resource Usage ----------

function ResourceUsage({ isOpen }: { isOpen: boolean }) {
  const [memoryMb, setMemoryMb] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchStats = () => {
      invoke<{ memory_mb: number }>("get_process_stats")
        .then((stats) => setMemoryMb(stats.memory_mb))
        .catch((err) => log.warn("[Settings] get_process_stats failed:", err));
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10_000);
    return () => clearInterval(interval);
  }, [isOpen]);

  return (
    <span className="settings-row-value">
      {memoryMb !== null ? locale().ui_memory_format(memoryMb) : "-"}
    </span>
  );
}

// ---------- Types ----------

export type CommentFrequency = "off" | "low" | "medium" | "high";

export interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;

  // Character
  currentModelName: string;
  onModelChange: (file: File) => void;
  onModelReset: () => void;

  // Behavior
  commentFrequency: CommentFrequency;
  onCommentFrequencyChange: (freq: CommentFrequency) => void;

  // Privacy
  privacySettings: PrivacySettings;
  onPrivacySettingsChange: (partial: Partial<PrivacySettings>) => void;

  // Setup Wizard
  onOpenSetupWizard?: () => void;
}

// ---------- Constants ----------

const APP_VERSION = "0.1.0";

// ---------- Component ----------

export default function Settings({
  isOpen,
  onClose,
  currentModelName,
  onModelChange,
  onModelReset,
  commentFrequency,
  onCommentFrequencyChange,
  privacySettings,
  onPrivacySettingsChange,
  onOpenSetupWizard,
}: SettingsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------- Handlers ----------

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && file.name.endsWith(".vrm")) {
        onModelChange(file);
      }
      // Reset input so the same file can be selected again
      e.target.value = "";
    },
    [onModelChange],
  );

  return (
    <div className={`settings-overlay ${isOpen ? "open" : ""}`}>
      <div className="settings-container">
        {/* Header */}
        <div className="settings-header">
          <span className="settings-title">{locale().ui_settings_title}</span>
          <button className="settings-close-btn" onClick={onClose}>
            {locale().ui_settings_close}
          </button>
        </div>

        {/* ============ Character ============ */}
        <div className="settings-card">
          <div className="settings-card-title">{locale().ui_character_title}</div>

          <div className="settings-row">
            <div className="settings-row-label">
              {locale().ui_vrm_model}
              <div className="settings-row-sublabel">
                {locale().ui_vrm_sublabel}
              </div>
            </div>
            <span className="settings-model-name">
              {currentModelName || "default.vrm"}
            </span>
          </div>

          <div className="settings-row">
            <div className="settings-row-label" />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="settings-btn primary"
                onClick={() => fileInputRef.current?.click()}
              >
                {locale().ui_choose_file}
              </button>
              <button className="settings-btn" onClick={onModelReset}>
                {locale().ui_reset}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".vrm"
              className="settings-file-input"
              onChange={handleFileSelect}
            />
          </div>
        </div>

        {/* ============ Behavior ============ */}
        <BehaviorSettings
          commentFrequency={commentFrequency}
          onCommentFrequencyChange={onCommentFrequencyChange}
        />

        {/* ============ Privacy ============ */}
        <PrivacySettingsCard
          privacySettings={privacySettings}
          onPrivacySettingsChange={onPrivacySettingsChange}
        />

        {/* ============ OpenClaw Connection ============ */}
        <OpenClawSettings isOpen={isOpen} onOpenSetupWizard={onOpenSetupWizard} />

        {/* ============ System ============ */}
        <div className="settings-card">
          <div className="settings-card-title">{locale().ui_system_title}</div>

          {/* Language selector */}
          <div className="settings-row">
            <span className="settings-row-label">{locale().ui_language}</span>
            <select
              className="settings-select"
              value={getLocaleCode()}
              onChange={async (e) => {
                await setLocale(e.target.value as SupportedLocale);
                window.location.reload();
              }}
            >
              {LOCALE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <AutostartToggle />

          <div className="settings-row">
            <span className="settings-row-label">{locale().ui_resource_usage}</span>
            <ResourceUsage isOpen={isOpen} />
          </div>

          <div className="settings-row">
            <span className="settings-row-label">{locale().ui_app_version}</span>
            <span className="settings-row-value">{APP_VERSION}</span>
          </div>
        </div>

        {/* Version footer */}
        <div className="settings-version">
          {locale().ui_version_footer(APP_VERSION)}
        </div>
      </div>
    </div>
  );
}
