import { useState, useEffect, useCallback, useRef } from "react";
import type { MemoryManager, MemoryTier } from "../lib/memoryManager.ts";
import { TIER_LABELS, TIER_ORDER } from "../lib/memoryManager.ts";
import "./MemoryTransparency.css";

// ---------- Types ----------

export interface MemoryTransparencyProps {
  isOpen: boolean;
  onClose: () => void;
  memoryManager: MemoryManager;
}

type ConfirmAction = "delete-single" | "delete-all" | null;

interface ConfirmState {
  action: ConfirmAction;
  targetId: string | null;
}

// ---------- Helpers ----------

/**
 * Format a timestamp into a human-readable relative age string.
 */
function formatAge(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)}d ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Trigger a JSON file download in the browser.
 */
function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- Component ----------

export default function MemoryTransparency({
  isOpen,
  onClose,
  memoryManager,
}: MemoryTransparencyProps) {
  const [memories, setMemories] = useState<MemoryTier[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    action: null,
    targetId: null,
  });

  // Track whether OpenClaw backend is being used
  const isOpenClaw = memoryManager.isUsingOpenClaw();

  // Ref to track if the component is mounted
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ---------- Load Memories ----------

  const loadMemories = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const result = await memoryManager.getMemories();
      if (mountedRef.current) {
        setMemories(result);
      }
    } catch (err) {
      if (mountedRef.current) {
        setMemories([]);
        setErrorMsg("Failed to load memories. Please try again.");
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [memoryManager]);

  // Load memories when the panel opens
  useEffect(() => {
    if (isOpen) {
      loadMemories();
    }
  }, [isOpen, loadMemories]);

  // Auto-clear error after 5 seconds
  useEffect(() => {
    if (!errorMsg) return;
    const timer = setTimeout(() => setErrorMsg(null), 5000);
    return () => clearTimeout(timer);
  }, [errorMsg]);

  // ---------- Actions ----------

  const handleExport = useCallback(async () => {
    try {
      const allMemories = await memoryManager.exportAll();
      const exportData = {
        exportedAt: new Date().toISOString(),
        source: isOpenClaw ? "openclaw" : "local",
        memories: allMemories,
      };
      downloadJson(exportData, `companion-memories-${Date.now()}.json`);
    } catch {
      setErrorMsg("Export failed. Please try again.");
    }
  }, [memoryManager, isOpenClaw]);

  const handleDeleteSingle = useCallback(
    async (id: string) => {
      const success = await memoryManager.deleteMemory(id);
      if (success) {
        setMemories((prev) => prev.filter((m) => m.id !== id));
      }
      setConfirmState({ action: null, targetId: null });
    },
    [memoryManager],
  );

  const handleDeleteAll = useCallback(async () => {
    const success = await memoryManager.deleteAll();
    if (success) {
      setMemories([]);
    }
    setConfirmState({ action: null, targetId: null });
  }, [memoryManager]);

  const requestDeleteSingle = useCallback((id: string) => {
    setConfirmState({ action: "delete-single", targetId: id });
  }, []);

  const requestDeleteAll = useCallback(() => {
    setConfirmState({ action: "delete-all", targetId: null });
  }, []);

  const cancelConfirm = useCallback(() => {
    setConfirmState({ action: null, targetId: null });
  }, []);

  // ---------- Group memories by tier ----------

  const groupedMemories: Record<string, MemoryTier[]> = {};
  for (const tier of TIER_ORDER) {
    const tierMemories = memories.filter((m) => m.tier === tier);
    if (tierMemories.length > 0) {
      groupedMemories[tier] = tierMemories;
    }
  }

  const isEmpty = memories.length === 0 && !isLoading;

  return (
    <div className={`memory-panel ${isOpen ? "open" : ""}`}>
      {/* Header */}
      <div className="memory-header">
        <div style={{ display: "flex", alignItems: "center" }}>
          <span className="memory-header-title">What do I know?</span>
          {memories.length > 0 && (
            <span className="memory-header-badge">{memories.length}</span>
          )}
        </div>
        <button
          className="memory-close-btn"
          onClick={onClose}
          aria-label="Close memory panel"
        >
          &times;
        </button>
      </div>

      {/* Adapter status badge */}
      <div className="memory-adapter-badge">
        <div
          className={`memory-adapter-dot ${isOpenClaw ? "online" : "offline"}`}
        />
        <span>
          {isOpenClaw ? "OpenClaw Memory" : "Local Storage (Fallback)"}
        </span>
      </div>

      {/* Action buttons */}
      {!isEmpty && (
        <div className="memory-actions">
          <button className="memory-action-btn" onClick={handleExport}>
            Export All
          </button>
          <button
            className="memory-action-btn danger"
            onClick={requestDeleteAll}
          >
            Delete All
          </button>
        </div>
      )}

      {/* Error message */}
      {errorMsg && (
        <div
          style={{
            padding: "8px 12px",
            margin: "0 12px 8px",
            borderRadius: 6,
            background: "rgba(248, 113, 113, 0.15)",
            color: "rgba(248, 113, 113, 0.9)",
            fontSize: 12,
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Content area */}
      <div className="memory-content">
        {isLoading && (
          <div className="memory-loading">
            <div className="memory-loading-spinner" />
          </div>
        )}

        {isEmpty && (
          <div className="memory-empty">
            <div className="memory-empty-icon">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </div>
            <div className="memory-empty-title">
              {"\uC544\uC9C1 \uAE30\uC5B5\uC774 \uC5C6\uC5B4!"}
            </div>
            <div className="memory-empty-text">
              {"\uB300\uD654\uB97C \uB098\uB204\uBA74\uC11C \uC870\uAE08\uC529 \uB108\uC5D0 \uB300\uD574 \uC54C\uC544\uAC08\uAC8C. \uADF8\uB7EC\uBA74 \uC5EC\uAE30\uC11C \uBCFC \uC218 \uC788\uC5B4!"}
            </div>
          </div>
        )}

        {!isLoading &&
          TIER_ORDER.map((tier) => {
            const tierMemories = groupedMemories[tier];
            if (!tierMemories || tierMemories.length === 0) return null;

            return (
              <div key={tier} className="memory-tier-group">
                <div className="memory-tier-header">
                  <span className="memory-tier-label">
                    {TIER_LABELS[tier] ?? tier}
                  </span>
                  <span className="memory-tier-count">
                    {tierMemories.length}
                  </span>
                </div>

                {tierMemories.map((memory) => (
                  <div key={memory.id} className="memory-item">
                    <div className="memory-item-content">
                      <div className="memory-item-text">{memory.content}</div>
                      <div className="memory-item-date">
                        {formatAge(memory.createdAt)}
                      </div>
                    </div>
                    <button
                      className="memory-delete-btn"
                      onClick={() => requestDeleteSingle(memory.id)}
                      aria-label={`Delete memory: ${memory.content.slice(0, 30)}`}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
      </div>

      {/* Confirm dialog overlay */}
      {confirmState.action && (
        <div className="memory-confirm-overlay">
          <div className="memory-confirm-dialog">
            <div className="memory-confirm-text">
              {confirmState.action === "delete-all"
                ? "\uBAA8\uB4E0 \uAE30\uC5B5\uC744 \uC0AD\uC81C\uD560\uAE4C? \uC774 \uC791\uC5C5\uC740 \uB418\uB3CC\uB9B4 \uC218 \uC5C6\uC5B4."
                : "\uC774 \uAE30\uC5B5\uC744 \uC0AD\uC81C\uD560\uAE4C?"}
            </div>
            <div className="memory-confirm-actions">
              <button
                className="memory-confirm-btn cancel"
                onClick={cancelConfirm}
              >
                Cancel
              </button>
              <button
                className="memory-confirm-btn confirm"
                onClick={() => {
                  if (confirmState.action === "delete-all") {
                    handleDeleteAll();
                  } else if (confirmState.targetId) {
                    handleDeleteSingle(confirmState.targetId);
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
