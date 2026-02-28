import { useState, useCallback, useEffect } from "react";
import {
  checkHealth,
  getOpenclawConfig,
  saveOpenclawConfig,
  setupOpenclawHooks,
} from "../../lib/openclaw.ts";
import type { OpenClawConfig } from "../../lib/openclaw.ts";

// ---------- Types ----------

export interface OpenClawSettingsProps {
  isOpen: boolean;
  onOpenSetupWizard?: () => void;
}

// ---------- Component ----------

export default function OpenClawSettings({ isOpen, onOpenSetupWizard }: OpenClawSettingsProps) {
  const [openclawOnline, setOpenclawOnline] = useState<boolean | null>(null);
  const [ocConfig, setOcConfig] = useState<OpenClawConfig | null>(null);
  const [ocConfigSaving, setOcConfigSaving] = useState(false);
  const [ocConfigMsg, setOcConfigMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [hooksSetupRunning, setHooksSetupRunning] = useState(false);

  // Load OpenClaw config and check health when settings opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const load = async () => {
      try {
        const cfg = await getOpenclawConfig();
        if (!cancelled) setOcConfig(cfg);
      } catch {
        if (!cancelled) {
          setOcConfig({
            gatewayUrl: "http://localhost:18789",
            agentId: "",
            hooksToken: "",
            sessionKey: "",
            cliPath: "",
          });
        }
      }
    };

    const check = async () => {
      try {
        const healthy = await checkHealth();
        if (!cancelled) setOpenclawOnline(healthy);
      } catch {
        if (!cancelled) setOpenclawOnline(false);
      }
    };

    load();
    check();

    const interval = setInterval(check, 10_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isOpen]);

  // Clear status message after 3 seconds
  useEffect(() => {
    if (!ocConfigMsg) return;
    const timer = setTimeout(() => setOcConfigMsg(null), 3000);
    return () => clearTimeout(timer);
  }, [ocConfigMsg]);

  const handleOcConfigChange = useCallback(
    (field: keyof OpenClawConfig, value: string) => {
      setOcConfig((prev) => (prev ? { ...prev, [field]: value } : prev));
    },
    [],
  );

  const handleOcConfigSave = useCallback(async () => {
    if (!ocConfig) return;
    setOcConfigSaving(true);
    try {
      await saveOpenclawConfig(ocConfig);
      setOcConfigMsg({ type: "ok", text: "Saved" });
      try {
        const healthy = await checkHealth();
        setOpenclawOnline(healthy);
      } catch {
        setOpenclawOnline(false);
      }
    } catch (e) {
      setOcConfigMsg({ type: "err", text: String(e) });
    } finally {
      setOcConfigSaving(false);
    }
  }, [ocConfig]);

  const handleSetupHooks = useCallback(async () => {
    setHooksSetupRunning(true);
    try {
      const token = await setupOpenclawHooks();
      setOcConfig((prev) => (prev ? { ...prev, hooksToken: token } : prev));
      setOcConfigMsg({ type: "ok", text: "Hooks configured! Token saved." });
      try {
        const healthy = await checkHealth();
        setOpenclawOnline(healthy);
      } catch {
        setOpenclawOnline(false);
      }
    } catch (e) {
      setOcConfigMsg({ type: "err", text: String(e) });
    } finally {
      setHooksSetupRunning(false);
    }
  }, []);

  return (
    <div className="settings-card">
      <div className="settings-card-title">OpenClaw Connection</div>

      <div className="settings-row">
        <span className="settings-row-label">Status</span>
        <div
          className="settings-row-value"
          style={{ display: "flex", alignItems: "center" }}
        >
          <span
            className={`settings-status-dot ${openclawOnline ? "online" : "offline"}`}
          />
          {openclawOnline === null
            ? "Checking..."
            : openclawOnline
              ? "Connected"
              : "Disconnected"}
        </div>
      </div>

      {onOpenSetupWizard && (
        <div className="settings-row">
          <span className="settings-row-label">
            Guided Setup
            <div className="settings-row-sublabel">
              Step-by-step wizard for first-time configuration
            </div>
          </span>
          <button className="settings-btn primary" onClick={onOpenSetupWizard}>
            Setup Wizard
          </button>
        </div>
      )}

      {ocConfig && (
        <>
          <div
            className="settings-row"
            style={{ flexDirection: "column", alignItems: "stretch" }}
          >
            <span className="settings-row-label">Gateway URL</span>
            <input
              className="settings-text-input"
              type="text"
              placeholder="http://localhost:18789"
              value={ocConfig.gatewayUrl}
              onChange={(e) =>
                handleOcConfigChange("gatewayUrl", e.target.value)
              }
              spellCheck={false}
            />
          </div>

          <div
            className="settings-row"
            style={{ flexDirection: "column", alignItems: "stretch" }}
          >
            <span className="settings-row-label">Agent ID</span>
            <input
              className="settings-text-input"
              type="text"
              placeholder="e.g. claire, main"
              value={ocConfig.agentId}
              onChange={(e) =>
                handleOcConfigChange("agentId", e.target.value)
              }
              spellCheck={false}
            />
          </div>

          <div
            className="settings-row"
            style={{ flexDirection: "column", alignItems: "stretch" }}
          >
            <span className="settings-row-label">Hooks Token</span>
            <input
              className="settings-text-input"
              type="password"
              placeholder="Shared secret for /hooks/agent auth"
              value={ocConfig.hooksToken}
              onChange={(e) =>
                handleOcConfigChange("hooksToken", e.target.value)
              }
              spellCheck={false}
            />
          </div>

          <div
            className="settings-row"
            style={{ flexDirection: "column", alignItems: "stretch" }}
          >
            <span className="settings-row-label">
              Session Key
              <div className="settings-row-sublabel">
                Optional. Auto-generated if empty.
              </div>
            </span>
            <input
              className="settings-text-input"
              type="text"
              placeholder="desktop-companion-..."
              value={ocConfig.sessionKey}
              onChange={(e) =>
                handleOcConfigChange("sessionKey", e.target.value)
              }
              spellCheck={false}
            />
          </div>

          <div
            className="settings-row"
            style={{ flexDirection: "column", alignItems: "stretch" }}
          >
            <span className="settings-row-label">
              CLI Path
              <div className="settings-row-sublabel">
                Path to the openclaw binary. Leave empty for default.
              </div>
            </span>
            <input
              className="settings-text-input"
              type="text"
              placeholder="openclaw"
              value={ocConfig.cliPath}
              onChange={(e) =>
                handleOcConfigChange("cliPath", e.target.value)
              }
              spellCheck={false}
            />
          </div>

          <div className="settings-row">
            <span className="settings-row-label">
              Enable Hooks
              <div className="settings-row-sublabel">
                Auto-configure ~/.openclaw/openclaw.json
              </div>
            </span>
            <button
              className="settings-btn"
              onClick={handleSetupHooks}
              disabled={hooksSetupRunning}
            >
              {hooksSetupRunning ? "Setting up..." : "Setup Hooks"}
            </button>
          </div>

          <div className="settings-row">
            <div
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <button
                className="settings-btn primary"
                onClick={handleOcConfigSave}
                disabled={ocConfigSaving}
              >
                {ocConfigSaving ? "Saving..." : "Save"}
              </button>
              {ocConfigMsg && (
                <span
                  style={{
                    fontSize: 12,
                    color:
                      ocConfigMsg.type === "ok"
                        ? "rgba(74, 222, 128, 0.9)"
                        : "rgba(248, 113, 113, 0.9)",
                  }}
                >
                  {ocConfigMsg.text}
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
