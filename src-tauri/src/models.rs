//! VRM model file management.
//!
//! Manages user-added VRM files stored at:
//! ```text
//! ~/.config/ai-desktop-companion/models/
//! ```
//!
//! The frontend maintains a JSON manifest of saved models
//! via the existing `write_data_file`/`read_data_file` commands.

use std::fs;
use std::path::PathBuf;

/// Resolve the models directory path.
fn models_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| {
            dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".config")
        })
        .join("ai-desktop-companion")
        .join("models")
}

/// IPC command: save a VRM file to the models directory.
///
/// Accepts raw bytes and a filename. Returns the full path to the saved file.
/// Creates the `models/` directory if needed. Overwrites if a file with the
/// same name already exists.
#[tauri::command]
pub fn save_vrm_model(filename: String, bytes: Vec<u8>) -> Result<String, String> {
    if !filename.to_lowercase().ends_with(".vrm") {
        return Err("File must have .vrm extension".to_string());
    }
    if filename.contains('/') || filename.contains('\\') {
        return Err("Filename must not contain path separators".to_string());
    }

    let dir = models_dir();
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create models dir: {}", e))?;

    let path = dir.join(&filename);
    fs::write(&path, &bytes)
        .map_err(|e| format!("Failed to write VRM file: {}", e))?;

    Ok(path.to_string_lossy().to_string())
}

/// IPC command: delete a VRM file from the models directory.
///
/// Silently succeeds if the file does not exist.
#[tauri::command]
pub fn delete_vrm_model(filename: String) -> Result<(), String> {
    if filename.contains('/') || filename.contains('\\') {
        return Err("Filename must not contain path separators".to_string());
    }

    let path = models_dir().join(&filename);
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete VRM file: {}", e))?;
    }
    Ok(())
}

/// IPC command: read a VRM file from the models directory as raw bytes.
///
/// Used by the frontend to load a saved model on startup.
#[tauri::command]
pub fn read_vrm_model(filename: String) -> Result<Vec<u8>, String> {
    if filename.contains('/') || filename.contains('\\') {
        return Err("Filename must not contain path separators".to_string());
    }

    let path = models_dir().join(&filename);
    fs::read(&path).map_err(|e| format!("Failed to read VRM file '{}': {}", filename, e))
}
