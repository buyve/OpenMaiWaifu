import { useState, useCallback, useRef, useEffect } from "react";
import type { PrivacySettings } from "../lib/privacyManager.ts";
import { isEnabled, enable, disable } from "@tauri-apps/plugin-autostart";
import { invoke } from "@tauri-apps/api/core";
import { log } from "../lib/logger.ts";
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
      setError("Failed to change autostart setting.");
    }
  }, [enabled]);

  return (
    <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="settings-row-label">Auto-start on Login</span>
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
      {memoryMb !== null ? `Memory: ${memoryMb} MB` : "-"}
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
  onOpenMemoryTransparency: () => void;
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
  onOpenMemoryTransparency,
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
          <span className="settings-title">Settings</span>
          <button className="settings-close-btn" onClick={onClose}>
            ESC
          </button>
        </div>

        {/* ============ Character ============ */}
        <div className="settings-card">
          <div className="settings-card-title">Character</div>

          <div className="settings-row">
            <div className="settings-row-label">
              VRM Model
              <div className="settings-row-sublabel">
                Drag & drop or select a .vrm file
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
                Choose File
              </button>
              <button className="settings-btn" onClick={onModelReset}>
                Reset
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
          onOpenMemoryTransparency={onOpenMemoryTransparency}
        />

        {/* ============ OpenClaw Connection ============ */}
        <OpenClawSettings isOpen={isOpen} />

        {/* ============ System ============ */}
        <div className="settings-card">
          <div className="settings-card-title">System</div>

          <AutostartToggle />

          <div className="settings-row">
            <span className="settings-row-label">Resource Usage</span>
            <ResourceUsage isOpen={isOpen} />
          </div>

          <div className="settings-row">
            <span className="settings-row-label">App Version</span>
            <span className="settings-row-value">{APP_VERSION}</span>
          </div>
        </div>

        {/* Version footer */}
        <div className="settings-version">
          AI Desktop Companion v{APP_VERSION}
        </div>
      </div>
    </div>
  );
}
