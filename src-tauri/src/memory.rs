//! Persistent data file storage for memory backup.
//!
//! Provides generic key-value file storage in the same config directory
//! used by [`crate::config`]:
//! ```text
//! ~/.config/ai-desktop-companion/{key}.json
//! ```
//!
//! The frontend uses these commands to persist localStorage data to disk,
//! implementing a write-through cache strategy so memories survive
//! WebView cache clears and app reinstalls.

use std::fs;
use std::path::PathBuf;

/// Resolve the data directory with the same fallback chain as `config.rs`:
///
/// 1. `dirs::config_dir()` (e.g. `~/Library/Application Support` on macOS)
/// 2. `dirs::home_dir() / .config`
/// 3. `./.config`
fn data_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| {
            dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".config")
        })
        .join("ai-desktop-companion")
}

/// Validate that a key contains only safe characters (alphanumeric + underscore).
fn validate_key(key: &str) -> Result<(), String> {
    if key.is_empty() {
        return Err("Key must not be empty".to_string());
    }
    if !key.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err(format!(
            "Invalid key '{}': only alphanumeric and underscore allowed",
            key
        ));
    }
    Ok(())
}

/// IPC command: read a JSON data file from disk.
///
/// Returns `Ok(Some(contents))` if the file exists, `Ok(None)` if it does not.
#[tauri::command]
pub fn read_data_file(key: String) -> Result<Option<String>, String> {
    validate_key(&key)?;
    let path = data_dir().join(format!("{}.json", key));
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}.json: {}", key, e))?;
    Ok(Some(contents))
}

/// IPC command: write a JSON data file to disk.
///
/// Creates the parent directory if it does not exist.
#[tauri::command]
pub fn write_data_file(key: String, data: String) -> Result<(), String> {
    validate_key(&key)?;
    let dir = data_dir();
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create data dir: {}", e))?;
    let path = dir.join(format!("{}.json", key));
    fs::write(&path, data)
        .map_err(|e| format!("Failed to write {}.json: {}", key, e))?;
    Ok(())
}

/// IPC command: delete a JSON data file from disk.
///
/// Silently succeeds if the file does not exist.
#[tauri::command]
pub fn delete_data_file(key: String) -> Result<(), String> {
    validate_key(&key)?;
    let path = data_dir().join(format!("{}.json", key));
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete {}.json: {}", key, e))?;
    }
    Ok(())
}
