import { invoke } from "@tauri-apps/api/core";
import { log } from "./logger.ts";

// ---------- Types ----------

export interface ChatResponse {
  response: string;
}

export interface OpenClawConfig {
  gatewayUrl: string;
  agentId: string;
  hooksToken: string;
  sessionKey: string;
  cliPath: string;
}

// ---------- Chat API ----------

/**
 * Send a chat message via the `openclaw agent` CLI (synchronous).
 * Blocks until the agent produces a response.
 */
export async function sendChat(message: string, context?: string): Promise<ChatResponse> {
  const args: Record<string, string> = { message };
  if (context) {
    args.context = context;
  }
  log.info("[openclaw.ts] invoking send_chat with args:", args);
  try {
    const result = await invoke<ChatResponse>("send_chat", args);
    log.info("[openclaw.ts] send_chat result:", result);
    return result;
  } catch (err) {
    log.error("[openclaw.ts] send_chat error:", err);
    throw err;
  }
}

/**
 * Fire-and-forget webhook to POST /hooks/agent (async, returns immediately).
 * Use for background triggers where you don't need the response.
 */
export async function sendWebhook(message: string): Promise<void> {
  return invoke<void>("send_webhook", { message });
}

/**
 * Check if the OpenClaw Gateway is reachable.
 */
export async function checkHealth(): Promise<boolean> {
  return invoke<boolean>("check_openclaw_health");
}

// ---------- Browser URL API ----------

/**
 * Get the current browser tab URL via AppleScript (macOS only).
 * Returns null if the app is not a supported browser or the query fails.
 */
export async function getBrowserUrl(appName: string): Promise<string | null> {
  try {
    return await invoke<string | null>("get_browser_url", { appName });
  } catch {
    return null;
  }
}

// ---------- Config API ----------

/**
 * Load the current OpenClaw configuration from the backend.
 */
export async function getOpenclawConfig(): Promise<OpenClawConfig> {
  return invoke<OpenClawConfig>("get_openclaw_config");
}

/**
 * Save OpenClaw configuration to disk via the backend.
 */
export async function saveOpenclawConfig(config: OpenClawConfig): Promise<void> {
  return invoke<void>("save_openclaw_config", { config });
}

// ---------- Setup Wizard API ----------

export interface InstalledCheck {
  installed: boolean;
  version: string;
}

export interface AgentInfo {
  id: string;
  name: string;
}

/**
 * Check if the OpenClaw CLI binary is installed by running `openclaw --version`.
 */
export async function checkOpenclawInstalled(): Promise<InstalledCheck> {
  return invoke<InstalledCheck>("check_openclaw_installed");
}

/**
 * List existing OpenClaw agents via `openclaw agents list --json`.
 */
export async function listOpenclawAgents(): Promise<AgentInfo[]> {
  return invoke<AgentInfo[]>("list_openclaw_agents");
}

/**
 * Create a new OpenClaw agent via `openclaw agents add <name> --non-interactive`.
 */
export async function createOpenclawAgent(name: string): Promise<string> {
  return invoke<string>("create_openclaw_agent", { name });
}

// ---------- Setup API ----------

/**
 * Configure OpenClaw hooks in ~/.openclaw/openclaw.json.
 * Generates a random token, writes hooks config, and returns the token.
 * The token is also automatically saved to the app's config.
 */
export async function setupOpenclawHooks(): Promise<string> {
  return invoke<string>("setup_openclaw_hooks");
}
