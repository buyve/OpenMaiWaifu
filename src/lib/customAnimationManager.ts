/**
 * customAnimationManager.ts — Manage user-added VRMA animations with trigger conditions.
 *
 * Manifest stored at ~/.config/ai-desktop-companion/custom_animations.json
 * via the existing read_data_file/write_data_file Tauri commands.
 *
 * VRMA binary files stored at ~/.config/ai-desktop-companion/motions/custom/<filename>.vrma
 */

import { invoke } from "@tauri-apps/api/core";
import { log } from "./logger.ts";
import type { ParsedTrigger } from "./triggerParser.ts";

// ---------- Types ----------

export interface CustomAnimation {
  /** VRMA filename (e.g. "flying.vrma") */
  filename: string;
  /** User-friendly display name (derived from filename) */
  displayName: string;
  /** Original trigger text entered by user */
  triggerText: string;
  /** LLM-parsed trigger conditions (null if not yet parsed) */
  triggerParsed: ParsedTrigger | null;
  /** Timestamp when added (ISO 8601) */
  addedAt: string;
  /** File size in bytes */
  sizeBytes: number;
}

export interface CustomAnimationsManifest {
  animations: CustomAnimation[];
}

// ---------- Constants ----------

const MANIFEST_KEY = "custom_animations";

// ---------- Manifest I/O ----------

export async function loadManifest(): Promise<CustomAnimationsManifest> {
  try {
    const raw = await invoke<string | null>("read_data_file", {
      key: MANIFEST_KEY,
    });
    if (raw) {
      return JSON.parse(raw) as CustomAnimationsManifest;
    }
  } catch (err) {
    log.warn("[customAnimationManager] Failed to load manifest:", err);
  }
  return { animations: [] };
}

async function saveManifest(manifest: CustomAnimationsManifest): Promise<void> {
  await invoke("write_data_file", {
    key: MANIFEST_KEY,
    data: JSON.stringify(manifest),
  });
}

// ---------- Display name helper ----------

function deriveDisplayName(filename: string): string {
  return filename
    .replace(/\.vrma$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------- Public API ----------

/** Get the list of all custom animations. */
export async function listCustomAnimations(): Promise<CustomAnimation[]> {
  const manifest = await loadManifest();
  return manifest.animations;
}

/**
 * Save a VRMA file to persistent storage and add to manifest.
 * Trigger parsing is done separately via updateTriggerParsed().
 */
export async function addCustomAnimation(
  file: File,
  triggerText: string,
): Promise<CustomAnimation> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  await invoke("save_custom_animation", {
    filename: file.name,
    bytes: Array.from(bytes),
  });

  const entry: CustomAnimation = {
    filename: file.name,
    displayName: deriveDisplayName(file.name),
    triggerText,
    triggerParsed: null,
    addedAt: new Date().toISOString(),
    sizeBytes: file.size,
  };

  const manifest = await loadManifest();
  // Replace if same filename exists
  manifest.animations = manifest.animations.filter(
    (a) => a.filename !== file.name,
  );
  manifest.animations.push(entry);
  await saveManifest(manifest);

  log.info(
    `[customAnimationManager] Saved animation: ${file.name} (${file.size} bytes), trigger: "${triggerText}"`,
  );
  return entry;
}

/**
 * Update the parsed trigger for a custom animation.
 */
export async function updateTriggerParsed(
  filename: string,
  parsed: ParsedTrigger,
): Promise<void> {
  const manifest = await loadManifest();
  const entry = manifest.animations.find((a) => a.filename === filename);
  if (entry) {
    entry.triggerParsed = parsed;
    await saveManifest(manifest);
    log.info(
      `[customAnimationManager] Updated trigger for ${filename}: ${JSON.stringify(parsed)}`,
    );
  }
}

/**
 * Load a custom VRMA file as a File object (for passing to AnimationManager).
 */
export async function loadCustomAnimationFile(filename: string): Promise<File> {
  const bytes = await invoke<number[]>("read_custom_animation", { filename });
  const blob = new Blob([new Uint8Array(bytes)], {
    type: "application/octet-stream",
  });
  return new File([blob], filename, { type: "application/octet-stream" });
}

/**
 * Delete a custom animation from storage and manifest.
 */
export async function deleteCustomAnimation(filename: string): Promise<void> {
  await invoke("delete_custom_animation", { filename });

  const manifest = await loadManifest();
  manifest.animations = manifest.animations.filter(
    (a) => a.filename !== filename,
  );
  await saveManifest(manifest);

  log.info(`[customAnimationManager] Deleted animation: ${filename}`);
}

// ---------- Trigger query helpers ----------

/** Get animations that match a given emotion. */
export async function getAnimationsForEmotion(
  emotion: string,
): Promise<CustomAnimation[]> {
  const manifest = await loadManifest();
  return manifest.animations.filter(
    (a) =>
      a.triggerParsed?.type === "emotion" &&
      a.triggerParsed.emotions.includes(emotion),
  );
}

/** Get all ambient animations (random pool). */
export async function getAmbientAnimations(): Promise<CustomAnimation[]> {
  const manifest = await loadManifest();
  return manifest.animations.filter(
    (a) => a.triggerParsed?.type === "ambient",
  );
}

/** Get animations scheduled for a given hour (0-23). */
export async function getScheduledAnimations(
  hour: number,
): Promise<CustomAnimation[]> {
  const manifest = await loadManifest();
  return manifest.animations.filter((a) => {
    if (a.triggerParsed?.type !== "scheduled") return false;
    const { hourStart, hourEnd } = a.triggerParsed;
    if (hourStart <= hourEnd) {
      return hour >= hourStart && hour < hourEnd;
    }
    // Wraps midnight (e.g. 22:00–06:00)
    return hour >= hourStart || hour < hourEnd;
  });
}

/** Get animations triggered by a specific event. */
export async function getAnimationsForEvent(
  event: string,
): Promise<CustomAnimation[]> {
  const manifest = await loadManifest();
  return manifest.animations.filter(
    (a) => a.triggerParsed?.type === "event" && a.triggerParsed.event === event,
  );
}

/** Get idle replacement animations. */
export async function getIdleAnimations(): Promise<CustomAnimation[]> {
  const manifest = await loadManifest();
  return manifest.animations.filter(
    (a) => a.triggerParsed?.type === "idle",
  );
}
