import { useEffect } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { log } from "../lib/logger.ts";

// ---------- Hook ----------

/**
 * Sets up Tauri event listeners for system tray actions.
 * Uses the BUG-01 cancellation pattern to prevent listener leaks
 * when cleanup runs before the `listen()` Promise resolves.
 */
export function useTauriListeners(): void {
  useEffect(() => {
    let cancelled = false;
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      const unlistenChat = await listen("tray-open-chat", () => {
        emit("open-chat").catch(() => {});
      });
      if (cancelled) {
        unlistenChat();
      } else {
        unlisteners.push(unlistenChat);
      }

      const unlistenQuiet = await listen("tray-quiet-mode", () => {
        log.info("[TauriListeners] Quiet mode activated for 30 minutes.");
      });
      if (cancelled) {
        unlistenQuiet();
      } else {
        unlisteners.push(unlistenQuiet);
      }
    };
    setup().catch((err) => {
      log.warn("[TauriListeners] Failed to set up listeners:", err);
    });

    return () => {
      cancelled = true;
      for (const u of unlisteners) u();
    };
  }, []);
}
