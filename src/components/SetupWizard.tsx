import { useState, useCallback, useEffect } from "react";
import {
  checkOpenclawInstalled,
  checkHealth,
  listOpenclawAgents,
  createOpenclawAgent,
  saveOpenclawConfig,
  getOpenclawConfig,
  setupOpenclawHooks,
  sendChat,
} from "../lib/openclaw.ts";
import type { AgentInfo } from "../lib/openclaw.ts";
import { log } from "../lib/logger.ts";
import "./Settings.css";

// ---------- Types ----------

type WizardStep = 1 | 2 | 3 | 4;

interface StepStatus {
  cliInstalled: boolean | null;
  cliVersion: string;
  gatewayOnline: boolean | null;
}

export interface SetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

// ---------- Component ----------

export default function SetupWizard({
  isOpen,
  onClose,
  onComplete,
}: SetupWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [status, setStatus] = useState<StepStatus>({
    cliInstalled: null,
    cliVersion: "",
    gatewayOnline: null,
  });
  const [checking, setChecking] = useState(false);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [createNew, setCreateNew] = useState(false);
  const [setupProgress, setSetupProgress] = useState("");
  const [setupError, setSetupError] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState("");
  const [testing, setTesting] = useState(false);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setStatus({ cliInstalled: null, cliVersion: "", gatewayOnline: null });
      setAgents([]);
      setSelectedAgent("");
      setCreateNew(false);
      setSetupProgress("");
      setSetupError("");
      setTestResult(null);
      setTestError("");
      setTesting(false);
      runChecks();
    }
  }, [isOpen]);

  // ---------- Step 1: Environment Check ----------

  const runChecks = useCallback(async () => {
    setChecking(true);
    setStatus({ cliInstalled: null, cliVersion: "", gatewayOnline: null });

    try {
      const installed = await checkOpenclawInstalled();
      setStatus((prev) => ({
        ...prev,
        cliInstalled: installed.installed,
        cliVersion: installed.version,
      }));

      if (installed.installed) {
        try {
          const healthy = await checkHealth();
          setStatus((prev) => ({ ...prev, gatewayOnline: healthy }));
        } catch {
          setStatus((prev) => ({ ...prev, gatewayOnline: false }));
        }
      }
    } catch {
      setStatus((prev) => ({ ...prev, cliInstalled: false }));
    } finally {
      setChecking(false);
    }
  }, []);

  const canProceedStep1 = status.cliInstalled === true && status.gatewayOnline === true;

  const handleStep1Next = useCallback(async () => {
    if (!canProceedStep1) return;
    setStep(2);

    // Load agents
    try {
      const list = await listOpenclawAgents();
      setAgents(list);
      if (list.length === 0) {
        setCreateNew(true);
      }
    } catch (err) {
      log.warn("[SetupWizard] Failed to list agents:", err);
      setAgents([]);
      setCreateNew(true);
    }
  }, [canProceedStep1]);

  // ---------- Step 2: Agent Selection ----------

  const handleSelectExisting = useCallback((agentId: string) => {
    setSelectedAgent(agentId);
    setCreateNew(false);
  }, []);

  const handleSelectCreateNew = useCallback(() => {
    setCreateNew(true);
    setSelectedAgent("");
  }, []);

  const handleStep2Next = useCallback(() => {
    if (!createNew && !selectedAgent) return;
    setStep(3);
    runSetup();
  }, [createNew, selectedAgent]);

  // ---------- Step 3: Setup & Connect ----------

  const runSetup = useCallback(async () => {
    setSetupProgress("");
    setSetupError("");

    try {
      let agentId: string;

      if (createNew) {
        setSetupProgress("Creating new agent...");
        try {
          agentId = await createOpenclawAgent("desktop-companion");
        } catch {
          // Agent might already exist — use the name directly
          agentId = "desktop-companion";
        }
      } else {
        agentId = selectedAgent;
      }

      setSetupProgress("Saving configuration...");
      const currentConfig = await getOpenclawConfig();
      await saveOpenclawConfig({
        ...currentConfig,
        agentId,
      });

      setSetupProgress("Setting up hooks...");
      await setupOpenclawHooks();

      setSetupProgress("Done!");
      // Auto-advance to step 4 after a brief pause
      setTimeout(() => setStep(4), 800);
    } catch (err) {
      log.error("[SetupWizard] Setup failed:", err);
      setSetupError(String(err));
    }
  }, [createNew, selectedAgent]);

  // ---------- Step 4: Test & Complete ----------

  const runTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    setTestError("");

    try {
      const res = await sendChat("Hello! This is a test message from the setup wizard. Please respond briefly.");
      setTestResult(res.response);
    } catch (err) {
      log.error("[SetupWizard] Test failed:", err);
      setTestError(String(err));
    } finally {
      setTesting(false);
    }
  }, []);

  useEffect(() => {
    if (step === 4 && testResult === null && !testing && !testError) {
      runTest();
    }
  }, [step, testResult, testing, testError, runTest]);

  const handleComplete = useCallback(() => {
    onComplete();
    onClose();
  }, [onComplete, onClose]);

  // ---------- Render ----------

  if (!isOpen) return null;

  return (
    <div className={`settings-overlay ${isOpen ? "open" : ""}`} style={{ zIndex: 10002 }}>
      <div className="settings-container">
        {/* Header */}
        <div className="settings-header">
          <span className="settings-title">OpenClaw Setup</span>
          <button className="settings-close-btn" onClick={onClose}>
            ESC
          </button>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {([1, 2, 3, 4] as WizardStep[]).map((s) => (
            <div
              key={s}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background:
                  s <= step
                    ? "rgba(99, 102, 241, 0.8)"
                    : "rgba(255, 255, 255, 0.08)",
                transition: "background 0.3s ease",
              }}
            />
          ))}
        </div>

        {/* Step 1: Environment Check */}
        {step === 1 && (
          <div className="settings-card">
            <div className="settings-card-title">Step 1 - Environment Check</div>

            <div className="settings-row">
              <span className="settings-row-label">OpenClaw CLI</span>
              <div className="settings-row-value" style={{ display: "flex", alignItems: "center" }}>
                {status.cliInstalled === null ? (
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>Checking...</span>
                ) : status.cliInstalled ? (
                  <>
                    <span className="settings-status-dot online" />
                    <span>Installed {status.cliVersion && `(${status.cliVersion})`}</span>
                  </>
                ) : (
                  <>
                    <span className="settings-status-dot offline" />
                    <span>Not installed</span>
                  </>
                )}
              </div>
            </div>

            <div className="settings-row">
              <span className="settings-row-label">Gateway</span>
              <div className="settings-row-value" style={{ display: "flex", alignItems: "center" }}>
                {status.gatewayOnline === null ? (
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>
                    {status.cliInstalled === false ? "-" : "Checking..."}
                  </span>
                ) : status.gatewayOnline ? (
                  <>
                    <span className="settings-status-dot online" />
                    <span>Running</span>
                  </>
                ) : (
                  <>
                    <span className="settings-status-dot offline" />
                    <span>Not running</span>
                  </>
                )}
              </div>
            </div>

            {/* Instructions when CLI not installed */}
            {status.cliInstalled === false && (
              <div style={{
                marginTop: 12,
                padding: 12,
                background: "rgba(255,255,255,0.03)",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginBottom: 8 }}>
                  OpenClaw CLI Install
                </div>
                <code style={{
                  display: "block",
                  padding: 8,
                  background: "rgba(0,0,0,0.3)",
                  borderRadius: 4,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.7)",
                  fontFamily: "'SF Mono', 'Fira Code', monospace",
                }}>
                  npm install -g openclaw
                </code>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>
                  After installing, click the button below to recheck.
                </div>
              </div>
            )}

            {/* Instructions when gateway not running */}
            {status.cliInstalled === true && status.gatewayOnline === false && (
              <div style={{
                marginTop: 12,
                padding: 12,
                background: "rgba(255,255,255,0.03)",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginBottom: 8 }}>
                  Start OpenClaw Gateway
                </div>
                <code style={{
                  display: "block",
                  padding: 8,
                  background: "rgba(0,0,0,0.3)",
                  borderRadius: 4,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.7)",
                  fontFamily: "'SF Mono', 'Fira Code', monospace",
                }}>
                  openclaw start
                </code>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>
                  Start the daemon, then click the button below to recheck.
                </div>
              </div>
            )}

            <div className="settings-row" style={{ justifyContent: "flex-end", gap: 8 }}>
              {!canProceedStep1 && (
                <button
                  className="settings-btn"
                  onClick={runChecks}
                  disabled={checking}
                >
                  {checking ? "Checking..." : "Recheck"}
                </button>
              )}
              <button
                className="settings-btn primary"
                onClick={handleStep1Next}
                disabled={!canProceedStep1}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Agent Selection */}
        {step === 2 && (
          <div className="settings-card">
            <div className="settings-card-title">Step 2 - Agent Selection</div>

            {agents.length === 0 ? (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 12 }}>
                No existing agents found. A new agent will be created for you.
              </div>
            ) : (
              <>
                {/* Create new option */}
                <div
                  onClick={handleSelectCreateNew}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border: `1px solid ${createNew ? "rgba(99, 102, 241, 0.5)" : "rgba(255,255,255,0.08)"}`,
                    background: createNew ? "rgba(99, 102, 241, 0.1)" : "rgba(255,255,255,0.02)",
                    cursor: "pointer",
                    marginBottom: 8,
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", fontWeight: 500 }}>
                      Create New Agent (Recommended)
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                    An agent optimized for desktop companion with auto-configured personality (SOUL.md).
                  </div>
                </div>

                {/* Existing agents */}
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "12px 0 8px" }}>
                  Or select an existing agent:
                </div>
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    onClick={() => handleSelectExisting(agent.id || agent.name)}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: `1px solid ${selectedAgent === (agent.id || agent.name) ? "rgba(99, 102, 241, 0.5)" : "rgba(255,255,255,0.06)"}`,
                      background: selectedAgent === (agent.id || agent.name) ? "rgba(99, 102, 241, 0.08)" : "rgba(255,255,255,0.02)",
                      cursor: "pointer",
                      marginBottom: 6,
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>
                      {agent.name || agent.id}
                    </span>
                    {selectedAgent === (agent.id || agent.name) && (
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
                        Uses this agent's existing personality and memory. May not be optimized for desktop companion.
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            <div className="settings-row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button className="settings-btn" onClick={() => setStep(1)}>
                Back
              </button>
              <button
                className="settings-btn primary"
                onClick={handleStep2Next}
                disabled={!createNew && !selectedAgent}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Setup & Connect */}
        {step === 3 && (
          <div className="settings-card">
            <div className="settings-card-title">Step 3 - Setup & Connect</div>

            <div style={{
              padding: 16,
              textAlign: "center",
            }}>
              {setupError ? (
                <>
                  <div style={{ fontSize: 24, marginBottom: 12 }}>!</div>
                  <div style={{ fontSize: 13, color: "rgba(248, 113, 113, 0.9)", marginBottom: 8 }}>
                    Setup failed
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", wordBreak: "break-word" }}>
                    {setupError}
                  </div>
                  <button
                    className="settings-btn primary"
                    style={{ marginTop: 16 }}
                    onClick={runSetup}
                  >
                    Retry
                  </button>
                </>
              ) : (
                <>
                  <div style={{
                    width: 24,
                    height: 24,
                    border: "2px solid rgba(99, 102, 241, 0.4)",
                    borderTopColor: "rgba(99, 102, 241, 0.9)",
                    borderRadius: "50%",
                    margin: "0 auto 12px",
                    animation: setupProgress === "Done!" ? "none" : "wizard-spin 0.8s linear infinite",
                  }} />
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                    {setupProgress || "Preparing..."}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Test & Complete */}
        {step === 4 && (
          <div className="settings-card">
            <div className="settings-card-title">Step 4 - Test & Complete</div>

            <div style={{ padding: 8 }}>
              {testing && (
                <div style={{ textAlign: "center", padding: 16 }}>
                  <div style={{
                    width: 24,
                    height: 24,
                    border: "2px solid rgba(99, 102, 241, 0.4)",
                    borderTopColor: "rgba(99, 102, 241, 0.9)",
                    borderRadius: "50%",
                    margin: "0 auto 12px",
                    animation: "wizard-spin 0.8s linear infinite",
                  }} />
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                    Sending test message...
                  </div>
                </div>
              )}

              {testResult && (
                <div style={{
                  padding: 12,
                  background: "rgba(74, 222, 128, 0.06)",
                  border: "1px solid rgba(74, 222, 128, 0.15)",
                  borderRadius: 8,
                  marginBottom: 12,
                }}>
                  <div style={{ fontSize: 12, color: "rgba(74, 222, 128, 0.8)", marginBottom: 6, fontWeight: 500 }}>
                    Connection successful!
                  </div>
                  <div style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.6)",
                    maxHeight: 80,
                    overflow: "auto",
                    lineHeight: 1.5,
                  }}>
                    {testResult.slice(0, 200)}
                    {testResult.length > 200 ? "..." : ""}
                  </div>
                </div>
              )}

              {testError && (
                <div style={{
                  padding: 12,
                  background: "rgba(248, 113, 113, 0.06)",
                  border: "1px solid rgba(248, 113, 113, 0.15)",
                  borderRadius: 8,
                  marginBottom: 12,
                }}>
                  <div style={{ fontSize: 12, color: "rgba(248, 113, 113, 0.8)", marginBottom: 6, fontWeight: 500 }}>
                    Test failed
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", wordBreak: "break-word" }}>
                    {testError}
                  </div>
                  <button
                    className="settings-btn"
                    style={{ marginTop: 8 }}
                    onClick={runTest}
                  >
                    Retry Test
                  </button>
                </div>
              )}
            </div>

            <div className="settings-row" style={{ justifyContent: "flex-end" }}>
              <button
                className="settings-btn primary"
                onClick={handleComplete}
              >
                {testResult ? "Done!" : testError ? "Skip & Finish" : "..."}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Spinner animation */}
      <style>{`
        @keyframes wizard-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
