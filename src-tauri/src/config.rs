//! Persistent configuration for the OpenClaw connection.
//!
//! Configuration is stored as JSON at:
//! ```text
//! ~/.config/ai-desktop-companion/config.json       (Linux/macOS with XDG)
//! ~/Library/Application Support/ai-desktop-companion/config.json  (macOS fallback)
//! ```
//!
//! If neither `dirs::config_dir()` nor `dirs::home_dir()` is available,
//! the config falls back to `./config/ai-desktop-companion/config.json`.
//!
//! The config is loaded once at app startup into a `RwLock<OpenClawConfig>`
//! and exposed as Tauri managed state via [`ConfigState`].

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::RwLock;
use tauri::State;

// ---------- Types ----------

/// User-configurable OpenClaw connection parameters.
///
/// Serialized to/from JSON with camelCase field names to match the frontend.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawConfig {
    /// Base URL for the OpenClaw Gateway (e.g. "http://localhost:18789").
    pub gateway_url: String,
    /// Agent identifier (e.g. "claire", "main").
    pub agent_id: String,
    /// Shared secret for /hooks/agent Bearer auth.
    pub hooks_token: String,
    /// Session key for persistent conversations.
    pub session_key: String,
    /// Path to the `openclaw` CLI binary (default: "openclaw").
    #[serde(default = "default_cli_path")]
    pub cli_path: String,
}

/// Default CLI path — looks up `openclaw` from `$PATH`.
fn default_cli_path() -> String {
    "openclaw".to_string()
}

impl Default for OpenClawConfig {
    fn default() -> Self {
        Self {
            gateway_url: "http://localhost:18789".to_string(),
            agent_id: String::new(),
            hooks_token: String::new(),
            session_key: format!("desktop-companion-{}", rand_hex()),
            cli_path: default_cli_path(),
        }
    }
}

/// Generate a short random hex string derived from the current timestamp.
///
/// Used only for default session key generation. Not cryptographically
/// secure — for secure tokens see [`openclaw::generate_token`].
fn rand_hex() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("{:x}", t)
}

// ---------- State ----------

/// Thread-safe wrapper around [`OpenClawConfig`], registered as Tauri managed state.
///
/// Uses `RwLock` so multiple commands can read the config concurrently while
/// writes (from Settings UI) are exclusive.
pub struct ConfigState {
    pub config: RwLock<OpenClawConfig>,
}

impl ConfigState {
    /// Load configuration from disk, or return defaults if the file does not
    /// exist or is malformed.
    pub fn load() -> Self {
        let path = config_path();
        let config = if path.exists() {
            fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            OpenClawConfig::default()
        };
        Self {
            config: RwLock::new(config),
        }
    }

    /// Persist the current config to disk.
    ///
    /// Creates the parent directory if it does not exist.
    ///
    /// # Errors
    ///
    /// Returns `Err` if the directory cannot be created, the `RwLock` is
    /// poisoned, serialization fails, or the file cannot be written.
    pub fn save(&self) -> Result<(), String> {
        let path = config_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {e}"))?;
        }
        let config = self.config.read().map_err(|e| e.to_string())?;
        let json = serde_json::to_string_pretty(&*config)
            .map_err(|e| format!("Failed to serialize config: {e}"))?;
        fs::write(&path, json).map_err(|e| format!("Failed to write config: {e}"))?;
        Ok(())
    }

    /// Read a clone of the current configuration.
    ///
    /// # Errors
    ///
    /// Returns `Err` if the `RwLock` is poisoned.
    pub fn get(&self) -> Result<OpenClawConfig, String> {
        let config = self.config.read().map_err(|e| e.to_string())?;
        Ok(config.clone())
    }
}

/// Resolve the config file path with fallback chain:
///
/// 1. `dirs::config_dir()` — e.g. `~/Library/Application Support` (macOS)
///    or `~/.config` (Linux XDG).
/// 2. `dirs::home_dir() / .config` — if `config_dir()` is unavailable.
/// 3. `./.config` — last resort if neither `config_dir` nor `home_dir` works.
///
/// The final path is always `<base>/ai-desktop-companion/config.json`.
fn config_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| {
            dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".config")
        })
        .join("ai-desktop-companion")
        .join("config.json")
}

// ---------- Commands ----------

/// IPC command: return the current OpenClaw configuration to the frontend.
#[tauri::command]
pub fn get_openclaw_config(state: State<'_, ConfigState>) -> Result<OpenClawConfig, String> {
    state.get()
}

/// IPC command: replace the OpenClaw configuration and persist to disk.
///
/// Called from the Settings UI when the user saves changes.
#[tauri::command]
pub fn save_openclaw_config(
    state: State<'_, ConfigState>,
    config: OpenClawConfig,
) -> Result<(), String> {
    {
        let mut current = state.config.write().map_err(|e| e.to_string())?;
        *current = config;
    }
    state.save()
}
