/**
 * modelManager.ts — Persistent VRM model storage and manifest management.
 *
 * Manifest stored at ~/.config/ai-desktop-companion/vrm_models.json
 * via the existing read_data_file/write_data_file Tauri commands.
 *
 * VRM binary files stored at ~/.config/ai-desktop-companion/models/<filename>.vrm
 */

import { invoke } from "@tauri-apps/api/core";
import { log } from "./logger.ts";

// ---------- Types ----------

export interface SavedModel {
  /** Display filename (e.g. "my-character.vrm") */
  filename: string;
  /** Timestamp when the model was added (ISO 8601) */
  addedAt: string;
  /** File size in bytes */
  sizeBytes: number;
}

export interface ModelManifest {
  /** Ordered list of saved models */
  models: SavedModel[];
  /** Filename of the currently active model, or "default.vrm" for bundled */
  activeModel: string;
}

// ---------- Constants ----------

const MANIFEST_KEY = "vrm_models";
export const DEFAULT_MODEL = "default.vrm";

// ---------- Manifest I/O ----------

export async function loadManifest(): Promise<ModelManifest> {
  try {
    const raw = await invoke<string | null>("read_data_file", {
      key: MANIFEST_KEY,
    });
    if (raw) {
      return JSON.parse(raw) as ModelManifest;
    }
  } catch (err) {
    log.warn("[modelManager] Failed to load manifest:", err);
  }
  return { models: [], activeModel: DEFAULT_MODEL };
}

async function saveManifest(manifest: ModelManifest): Promise<void> {
  await invoke("write_data_file", {
    key: MANIFEST_KEY,
    data: JSON.stringify(manifest),
  });
}

// ---------- Public API ----------

/** Get the list of all saved models. */
export async function listModels(): Promise<SavedModel[]> {
  const manifest = await loadManifest();
  return manifest.models;
}

/** Get the active model filename. */
export async function getActiveModel(): Promise<string> {
  const manifest = await loadManifest();
  return manifest.activeModel;
}

/**
 * Save a VRM file to persistent storage and add to manifest.
 * If a model with the same filename exists, it is overwritten.
 */
export async function addModel(file: File): Promise<SavedModel> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  await invoke("save_vrm_model", {
    filename: file.name,
    bytes: Array.from(bytes),
  });

  const entry: SavedModel = {
    filename: file.name,
    addedAt: new Date().toISOString(),
    sizeBytes: file.size,
  };

  const manifest = await loadManifest();
  manifest.models = manifest.models.filter((m) => m.filename !== file.name);
  manifest.models.push(entry);
  manifest.activeModel = file.name;
  await saveManifest(manifest);

  log.info(`[modelManager] Saved model: ${file.name} (${file.size} bytes)`);
  return entry;
}

/**
 * Load a saved VRM file as a File object (for passing to loadVRM).
 */
export async function loadModelFile(filename: string): Promise<File> {
  const bytes = await invoke<number[]>("read_vrm_model", { filename });
  const blob = new Blob([new Uint8Array(bytes)], {
    type: "application/octet-stream",
  });
  return new File([blob], filename, { type: "application/octet-stream" });
}

/**
 * Set a model as active (used when switching between saved models).
 */
export async function setActiveModel(filename: string): Promise<void> {
  const manifest = await loadManifest();
  manifest.activeModel = filename;
  await saveManifest(manifest);
}

/**
 * Delete a saved model from storage and manifest.
 * Returns the new active model filename.
 */
export async function deleteModel(filename: string): Promise<string> {
  if (filename === DEFAULT_MODEL) {
    throw new Error("Cannot delete the default model");
  }

  await invoke("delete_vrm_model", { filename });

  const manifest = await loadManifest();
  manifest.models = manifest.models.filter((m) => m.filename !== filename);
  if (manifest.activeModel === filename) {
    manifest.activeModel = DEFAULT_MODEL;
  }
  await saveManifest(manifest);

  log.info(`[modelManager] Deleted model: ${filename}`);
  return manifest.activeModel;
}
