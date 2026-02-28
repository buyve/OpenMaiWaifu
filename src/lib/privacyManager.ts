// ---------- Types ----------

export type ScreenWatchFrequency = "off" | "low" | "medium" | "high";

export interface PrivacySettings {
  /** Master toggle for screen watching. */
  screenWatchEnabled: boolean;
  /** Polling frequency: off=disabled, low=1/min, medium=5sec, high=1sec. */
  frequency: ScreenWatchFrequency;
  /** App names to ignore completely (never tracked, never commented on). */
  blacklistedApps: string[];
  /** Screen capture toggle (stub for future Vision API). */
  captureEnabled: boolean;
}

export interface TransparencyData {
  /** Aggregated app usage visible to the user. */
  trackedApps: { name: string; totalDuration: number }[];
  /** History of comments the engine has made. */
  commentHistory: { text: string; timestamp: number }[];
  /** Current privacy settings. */
  settings: PrivacySettings;
}

// ---------- Constants ----------

const STORAGE_KEY = "companion_privacy_settings";

const DEFAULT_SETTINGS: PrivacySettings = {
  screenWatchEnabled: true,
  frequency: "medium",
  blacklistedApps: [],
  captureEnabled: false,
};

/** Map frequency labels to polling interval in milliseconds. */
const FREQUENCY_TO_MS: Record<ScreenWatchFrequency, number> = {
  off: 0,
  low: 60_000, // 1 minute
  medium: 5_000, // 5 seconds
  high: 1_000, // 1 second
};

const COMMENT_HISTORY_KEY = "companion_comment_history";

// ---------- PrivacyManager ----------

/**
 * Manages privacy settings, blacklisted apps, and transparency data.
 *
 * All settings are persisted to localStorage and restored on construction.
 */
export class PrivacyManager {
  private _settings: PrivacySettings;

  constructor() {
    this._settings = this.loadSettings();
  }

  // ---------- Settings ----------

  /** Returns a copy of the current privacy settings. */
  getSettings(): PrivacySettings {
    return { ...this._settings, blacklistedApps: [...this._settings.blacklistedApps] };
  }

  /** Merge partial settings into the current settings and persist. */
  updateSettings(partial: Partial<PrivacySettings>): void {
    this._settings = { ...this._settings, ...partial };

    // Ensure blacklistedApps is always a fresh array reference
    if (partial.blacklistedApps) {
      this._settings.blacklistedApps = [...partial.blacklistedApps];
    }

    this.saveSettings();
  }

  // ---------- App blacklist ----------

  /** Check whether an app is blacklisted. Case-insensitive comparison. */
  isAppBlacklisted(appName: string): boolean {
    const lower = appName.toLowerCase();
    return this._settings.blacklistedApps.some(
      (name) => name.toLowerCase() === lower,
    );
  }

  // ---------- Polling ----------

  /**
   * Returns the polling interval in milliseconds based on the current
   * frequency setting. Returns 0 when watching is disabled.
   */
  getPollingInterval(): number {
    if (!this._settings.screenWatchEnabled) return 0;
    return FREQUENCY_TO_MS[this._settings.frequency];
  }

  // ---------- Transparency ----------

  /**
   * Build the "what do I know?" transparency payload.
   *
   * @param trackedApps - Aggregated app usage from the screen watcher.
   */
  getTransparencyData(
    trackedApps: { name: string; totalDuration: number }[],
  ): TransparencyData {
    return {
      trackedApps,
      commentHistory: this.loadCommentHistory(),
      settings: this.getSettings(),
    };
  }

  /** Record a comment in persistent history (for transparency). */
  recordComment(text: string): void {
    const history = this.loadCommentHistory();
    history.push({ text, timestamp: Date.now() });

    // Keep last 100 comments
    const trimmed = history.slice(-100);
    try {
      localStorage.setItem(COMMENT_HISTORY_KEY, JSON.stringify(trimmed));
    } catch {
      // localStorage full or unavailable — silently discard
    }
  }

  // ---------- Persistence helpers ----------

  private loadSettings(): PrivacySettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PrivacySettings>;
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch {
      // Corrupted data — fall back to defaults
    }
    return { ...DEFAULT_SETTINGS };
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._settings));
    } catch {
      // localStorage full or unavailable — silently discard
    }
  }

  private loadCommentHistory(): { text: string; timestamp: number }[] {
    try {
      const raw = localStorage.getItem(COMMENT_HISTORY_KEY);
      if (raw) {
        return JSON.parse(raw) as { text: string; timestamp: number }[];
      }
    } catch {
      // Corrupted data — return empty
    }
    return [];
  }
}
