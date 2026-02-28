/**
 * First-run bridge: reads settings written by the install.sh TUI wizard
 * (firstrun.json) and applies them to localStorage, then deletes the file.
 *
 * This runs once on the very first app launch after installation.
 */

import { invoke } from "@tauri-apps/api/core";
import { log } from "./logger.ts";

/** Shape of the firstrun.json written by install.sh */
interface FirstRunSettings {
  userName: string;
  screenWatchEnabled: boolean;
  commentFrequency: string;
  ftueComplete: boolean;
  soul?: string;
}

// localStorage keys (must match the rest of the app)
const FTUE_COMPLETE_KEY = "companion_ftue_complete";
const USER_NAME_KEY = "companion_user_name";
const SETTINGS_BEHAVIOR_KEY = "companion_settings_behavior";
const PRIVACY_SETTINGS_KEY = "companion_privacy_settings";
const SOUL_IDENTITY_KEY = "companion_soul_identity";

/**
 * Read firstrun.json from the data directory, apply its values to
 * localStorage, then delete the file so it never runs again.
 *
 * @returns `true` if settings were applied (caller should reload), `false` otherwise.
 */
export async function applyFirstRunSettings(): Promise<boolean> {
  try {
    const raw: string | null = await invoke("read_data_file", { key: "firstrun" });
    if (!raw) {
      return false;
    }

    const settings: FirstRunSettings = JSON.parse(raw);
    log.info("[firstRunBridge] Applying install wizard settings:", settings);

    // User name
    if (settings.userName) {
      localStorage.setItem(USER_NAME_KEY, settings.userName);
    }

    // FTUE complete flag
    if (settings.ftueComplete) {
      localStorage.setItem(FTUE_COMPLETE_KEY, "true");
    }

    // Behavior settings (comment frequency)
    if (settings.commentFrequency) {
      localStorage.setItem(
        SETTINGS_BEHAVIOR_KEY,
        JSON.stringify({ commentFrequency: settings.commentFrequency }),
      );
    }

    // Privacy settings (screen watch)
    if (settings.screenWatchEnabled !== undefined) {
      const existing = localStorage.getItem(PRIVACY_SETTINGS_KEY);
      let privacy: Record<string, unknown> = {};
      if (existing) {
        try {
          privacy = JSON.parse(existing);
        } catch {
          // ignore corrupt data
        }
      }
      privacy.screenWatchEnabled = settings.screenWatchEnabled;
      localStorage.setItem(PRIVACY_SETTINGS_KEY, JSON.stringify(privacy));
    }

    // Soul identity (personality + motion personality)
    if (settings.soul) {
      localStorage.setItem(SOUL_IDENTITY_KEY, settings.soul);
    }

    // Delete the firstrun file so this never runs again
    await invoke("delete_data_file", { key: "firstrun" });
    log.info("[firstRunBridge] firstrun.json consumed and deleted.");

    return true;
  } catch (err) {
    log.warn("[firstRunBridge] Could not apply first-run settings:", err);
    return false;
  }
}
