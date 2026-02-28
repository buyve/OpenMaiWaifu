import { describe, it, expect, beforeEach, vi } from "vitest";
import { PrivacyManager } from "../privacyManager";

// Mock localStorage
const mockStorage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: vi.fn(() => {
    for (const key in mockStorage) delete mockStorage[key];
  }),
  get length() {
    return Object.keys(mockStorage).length;
  },
  key: vi.fn((i: number) => Object.keys(mockStorage)[i] ?? null),
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

describe("PrivacyManager", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  // ---------- Default settings ----------

  it("starts with default settings", () => {
    const pm = new PrivacyManager();
    const settings = pm.getSettings();

    expect(settings.screenWatchEnabled).toBe(true);
    expect(settings.frequency).toBe("medium");
    expect(settings.blacklistedApps).toEqual([]);
    expect(settings.captureEnabled).toBe(false);
  });

  it("loads persisted settings from localStorage", () => {
    const saved = {
      screenWatchEnabled: false,
      frequency: "high",
      blacklistedApps: ["Safari", "Firefox"],
      captureEnabled: true,
    };
    mockStorage["companion_privacy_settings"] = JSON.stringify(saved);

    const pm = new PrivacyManager();
    const settings = pm.getSettings();

    expect(settings.screenWatchEnabled).toBe(false);
    expect(settings.frequency).toBe("high");
    expect(settings.blacklistedApps).toEqual(["Safari", "Firefox"]);
    expect(settings.captureEnabled).toBe(true);
  });

  it("handles corrupted localStorage gracefully", () => {
    mockStorage["companion_privacy_settings"] = "invalid json {{{";

    const pm = new PrivacyManager();
    const settings = pm.getSettings();
    expect(settings.screenWatchEnabled).toBe(true); // default
    expect(settings.frequency).toBe("medium"); // default
  });

  it("merges partial saved settings with defaults", () => {
    mockStorage["companion_privacy_settings"] = JSON.stringify({ frequency: "low" });

    const pm = new PrivacyManager();
    const settings = pm.getSettings();
    expect(settings.frequency).toBe("low");
    expect(settings.screenWatchEnabled).toBe(true); // default
    expect(settings.blacklistedApps).toEqual([]); // default
  });

  // ---------- getSettings returns a copy ----------

  it("getSettings returns a copy that does not mutate internal state", () => {
    const pm = new PrivacyManager();
    const settings = pm.getSettings();

    settings.screenWatchEnabled = false;
    settings.blacklistedApps.push("Hacked");

    const fresh = pm.getSettings();
    expect(fresh.screenWatchEnabled).toBe(true);
    expect(fresh.blacklistedApps).toEqual([]);
  });

  // ---------- updateSettings ----------

  it("updateSettings merges partial settings", () => {
    const pm = new PrivacyManager();

    pm.updateSettings({ frequency: "high" });
    expect(pm.getSettings().frequency).toBe("high");
    expect(pm.getSettings().screenWatchEnabled).toBe(true); // unchanged
  });

  it("updateSettings persists to localStorage", () => {
    const pm = new PrivacyManager();
    vi.clearAllMocks();

    pm.updateSettings({ screenWatchEnabled: false });
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "companion_privacy_settings",
      expect.any(String),
    );

    // Verify the saved data
    const saved = JSON.parse(mockStorage["companion_privacy_settings"]);
    expect(saved.screenWatchEnabled).toBe(false);
  });

  it("updateSettings updates blacklisted apps", () => {
    const pm = new PrivacyManager();

    pm.updateSettings({ blacklistedApps: ["Chrome", "Safari"] });
    expect(pm.getSettings().blacklistedApps).toEqual(["Chrome", "Safari"]);
  });

  // ---------- isAppBlacklisted ----------

  it("returns false for non-blacklisted apps", () => {
    const pm = new PrivacyManager();
    expect(pm.isAppBlacklisted("Chrome")).toBe(false);
  });

  it("returns true for blacklisted apps", () => {
    const pm = new PrivacyManager();
    pm.updateSettings({ blacklistedApps: ["Chrome", "Safari"] });

    expect(pm.isAppBlacklisted("Chrome")).toBe(true);
    expect(pm.isAppBlacklisted("Safari")).toBe(true);
  });

  it("isAppBlacklisted is case-insensitive", () => {
    const pm = new PrivacyManager();
    pm.updateSettings({ blacklistedApps: ["Chrome"] });

    expect(pm.isAppBlacklisted("chrome")).toBe(true);
    expect(pm.isAppBlacklisted("CHROME")).toBe(true);
    expect(pm.isAppBlacklisted("ChRoMe")).toBe(true);
  });

  it("returns false for similar but not matching names", () => {
    const pm = new PrivacyManager();
    pm.updateSettings({ blacklistedApps: ["Chrome"] });

    expect(pm.isAppBlacklisted("Google Chrome")).toBe(false);
    expect(pm.isAppBlacklisted("Chromium")).toBe(false);
  });

  // ---------- getPollingInterval ----------

  it("returns 5000ms for medium frequency", () => {
    const pm = new PrivacyManager();
    expect(pm.getPollingInterval()).toBe(5000);
  });

  it("returns 60000ms for low frequency", () => {
    const pm = new PrivacyManager();
    pm.updateSettings({ frequency: "low" });
    expect(pm.getPollingInterval()).toBe(60000);
  });

  it("returns 1000ms for high frequency", () => {
    const pm = new PrivacyManager();
    pm.updateSettings({ frequency: "high" });
    expect(pm.getPollingInterval()).toBe(1000);
  });

  it("returns 0 for off frequency", () => {
    const pm = new PrivacyManager();
    pm.updateSettings({ frequency: "off" });
    expect(pm.getPollingInterval()).toBe(0);
  });

  it("returns 0 when screenWatchEnabled is false (regardless of frequency)", () => {
    const pm = new PrivacyManager();
    pm.updateSettings({ screenWatchEnabled: false, frequency: "high" });
    expect(pm.getPollingInterval()).toBe(0);
  });

  // ---------- recordComment ----------

  it("recordComment stores a comment in history", () => {
    const pm = new PrivacyManager();
    pm.recordComment("Nice code!");

    const data = pm.getTransparencyData([]);
    expect(data.commentHistory).toHaveLength(1);
    expect(data.commentHistory[0].text).toBe("Nice code!");
    expect(typeof data.commentHistory[0].timestamp).toBe("number");
  });

  it("recordComment accumulates multiple comments", () => {
    const pm = new PrivacyManager();
    pm.recordComment("Comment 1");
    pm.recordComment("Comment 2");
    pm.recordComment("Comment 3");

    const data = pm.getTransparencyData([]);
    expect(data.commentHistory).toHaveLength(3);
  });

  it("recordComment trims to last 100 comments", () => {
    const pm = new PrivacyManager();

    for (let i = 0; i < 110; i++) {
      pm.recordComment(`Comment ${i}`);
    }

    const data = pm.getTransparencyData([]);
    expect(data.commentHistory).toHaveLength(100);
    // Should keep the last 100 (10 through 109)
    expect(data.commentHistory[0].text).toBe("Comment 10");
    expect(data.commentHistory[99].text).toBe("Comment 109");
  });

  // ---------- getTransparencyData ----------

  it("returns correct transparency payload", () => {
    const pm = new PrivacyManager();
    pm.recordComment("Test comment");

    const trackedApps = [
      { name: "Chrome", totalDuration: 3600 },
      { name: "VSCode", totalDuration: 7200 },
    ];

    const data = pm.getTransparencyData(trackedApps);

    expect(data.trackedApps).toEqual(trackedApps);
    expect(data.commentHistory).toHaveLength(1);
    expect(data.settings.screenWatchEnabled).toBe(true);
  });

  it("returns empty arrays when no data", () => {
    const pm = new PrivacyManager();
    const data = pm.getTransparencyData([]);

    expect(data.trackedApps).toEqual([]);
    expect(data.commentHistory).toEqual([]);
  });

  // ---------- Persistence across instances ----------

  it("settings persist across new PrivacyManager instances", () => {
    const pm1 = new PrivacyManager();
    pm1.updateSettings({
      screenWatchEnabled: false,
      frequency: "low",
      blacklistedApps: ["Safari"],
    });

    const pm2 = new PrivacyManager();
    const settings = pm2.getSettings();
    expect(settings.screenWatchEnabled).toBe(false);
    expect(settings.frequency).toBe("low");
    expect(settings.blacklistedApps).toEqual(["Safari"]);
  });

  it("comment history persists across instances", () => {
    const pm1 = new PrivacyManager();
    pm1.recordComment("Persisted comment");

    const pm2 = new PrivacyManager();
    const data = pm2.getTransparencyData([]);
    expect(data.commentHistory).toHaveLength(1);
    expect(data.commentHistory[0].text).toBe("Persisted comment");
  });
});
