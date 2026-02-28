import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { log } from "../lib/logger.ts";

// ---------- Types ----------

export interface AppSession {
  /** Application name (e.g. "Google Chrome", "Code"). */
  appName: string;
  /** Window title at the time of detection. */
  title: string;
  /** Unix timestamp (ms) when this app became the active window. */
  startTime: number;
  /** Elapsed duration in seconds since startTime (updated each poll). */
  duration: number;
}

export interface ScreenWatchState {
  /** The currently active app session, or null if not tracking. */
  currentApp: AppSession | null;
  /** App usage history for the last 24 hours. */
  appHistory: AppSession[];
  /** Whether the watcher is actively polling. */
  isWatching: boolean;
}

// ---------- Constants ----------

/** 24 hours in milliseconds — history older than this is trimmed. */
const HISTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Maximum history entries to keep (safety cap). */
const HISTORY_MAX_ENTRIES = 500;

// ---------- Helpers ----------

/**
 * Invoke the Tauri get_active_window command.
 * Returns null when running outside of Tauri or when no window is active.
 */
async function invokeGetActiveWindow(): Promise<{
  app_name: string;
  title: string;
} | null> {
  try {
    const result = await invoke<{
      app_name: string;
      title: string;
      x: number;
      y: number;
      width: number;
      height: number;
    } | null>("get_active_window");
    return result;
  } catch (err) {
    log.warn("[useScreenWatch] get_active_window failed:", err);
    return null;
  }
}

/** Trim history entries older than 24 hours and cap total count. */
function trimHistory(history: AppSession[]): AppSession[] {
  const cutoff = Date.now() - HISTORY_MAX_AGE_MS;
  const recent = history.filter(
    (s) => s.startTime + s.duration * 1000 > cutoff,
  );
  if (recent.length > HISTORY_MAX_ENTRIES) {
    return recent.slice(recent.length - HISTORY_MAX_ENTRIES);
  }
  return recent;
}

// ---------- Hook ----------

/**
 * Tracks the currently active application window by polling the
 * Tauri backend at a configurable interval.
 *
 * @param pollingIntervalMs - Polling interval in ms (0 = disabled).
 * @param isBlacklisted     - Callback to check if an app should be ignored.
 * @param onAppChanged      - Callback fired when the active app changes.
 */
export function useScreenWatch(
  pollingIntervalMs: number,
  isBlacklisted: (appName: string) => boolean,
  onAppChanged?: (
    previous: AppSession | null,
    current: AppSession | null,
  ) => void,
) {
  const [currentApp, setCurrentApp] = useState<AppSession | null>(null);
  const [appHistory, setAppHistory] = useState<AppSession[]>([]);
  const [isWatching, setIsWatching] = useState(false);

  // Refs to avoid stale closures in the interval callback
  const currentAppRef = useRef<AppSession | null>(null);
  const appHistoryRef = useRef<AppSession[]>([]);
  const onAppChangedRef = useRef(onAppChanged);
  onAppChangedRef.current = onAppChanged;
  const isBlacklistedRef = useRef(isBlacklisted);
  isBlacklistedRef.current = isBlacklisted;

  /** Push the current session (if any) into history. */
  const finishCurrentSession = useCallback(() => {
    const session = currentAppRef.current;
    if (session && session.duration > 0) {
      const updated = trimHistory([...appHistoryRef.current, session]);
      appHistoryRef.current = updated;
      setAppHistory(updated);
    }
  }, []);

  /** Single poll iteration. */
  const poll = useCallback(async () => {
    const win = await invokeGetActiveWindow();
    const now = Date.now();

    if (!win) {
      // No active window or Tauri unavailable
      if (currentAppRef.current) {
        const prev = currentAppRef.current;
        finishCurrentSession();
        currentAppRef.current = null;
        setCurrentApp(null);
        onAppChangedRef.current?.(prev, null);
      }
      return;
    }

    // Check blacklist
    if (isBlacklistedRef.current(win.app_name)) {
      // Blacklisted — treat as if no active window (do not track)
      if (currentAppRef.current) {
        const prev = currentAppRef.current;
        finishCurrentSession();
        currentAppRef.current = null;
        setCurrentApp(null);
        onAppChangedRef.current?.(prev, null);
      }
      return;
    }

    const prev = currentAppRef.current;

    // Check if app changed
    if (!prev || prev.appName !== win.app_name) {
      // Finish old session
      finishCurrentSession();

      // Start new session
      const newSession: AppSession = {
        appName: win.app_name,
        title: win.title,
        startTime: now,
        duration: 0,
      };
      log.info("[useScreenWatch] App changed:", prev?.appName, "->", win.app_name);
      currentAppRef.current = newSession;
      setCurrentApp({ ...newSession });
      onAppChangedRef.current?.(prev, newSession);
    } else {
      // Same app — update duration and title (title may change within the same app)
      const updated: AppSession = {
        ...prev,
        title: win.title,
        duration: Math.round((now - prev.startTime) / 1000),
      };
      currentAppRef.current = updated;
      setCurrentApp({ ...updated });
    }
  }, [finishCurrentSession]);

  // ---------- Start / Stop ----------

  const startWatching = useCallback(() => {
    setIsWatching(true);
  }, []);

  const stopWatching = useCallback(() => {
    setIsWatching(false);
    finishCurrentSession();
    currentAppRef.current = null;
    setCurrentApp(null);
  }, [finishCurrentSession]);

  // ---------- Polling effect ----------

  useEffect(() => {
    if (!isWatching || pollingIntervalMs <= 0) return;

    // Perform an initial poll immediately
    poll();

    const id = setInterval(poll, pollingIntervalMs);
    return () => {
      clearInterval(id);
    };
  }, [isWatching, pollingIntervalMs, poll]);

  // ---------- Auto-start when interval > 0 ----------

  useEffect(() => {
    if (pollingIntervalMs > 0) {
      // Check screen recording permission before starting (macOS)
      invoke<boolean>("check_screen_permission")
        .then((hasPermission) => {
          if (!hasPermission) {
            log.warn("[useScreenWatch] Screen recording permission not granted — window titles may be unavailable");
          }
        })
        .catch(() => {
          // Non-Tauri environment or command unavailable
        });
      setIsWatching(true);
    } else {
      setIsWatching(false);
    }
  }, [pollingIntervalMs]);

  return {
    currentApp,
    appHistory,
    isWatching,
    startWatching,
    stopWatching,
  };
}
