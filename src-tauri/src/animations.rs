//! Custom VRMA animation file management.
//!
//! Manages user-added VRMA files stored at:
//! ```text
//! ~/.config/ai-desktop-companion/motions/custom/
//! ```
//!
//! The frontend maintains a JSON manifest of custom animations
//! via the existing `write_data_file`/`read_data_file` commands.

use std::fs;
use std::path::PathBuf;

/// Resolve the custom animations directory path.
fn custom_motions_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| {
            dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".config")
        })
        .join("ai-desktop-companion")
        .join("motions")
        .join("custom")
}

/// IPC command: save a VRMA file to the custom animations directory.
///
/// Accepts raw bytes and a filename. Returns the full path to the saved file.
/// Creates the directory if needed. Overwrites if a file with the same name
/// already exists.
#[tauri::command]
pub fn save_custom_animation(filename: String, bytes: Vec<u8>) -> Result<String, String> {
    if !filename.to_lowercase().ends_with(".vrma") {
        return Err("File must have .vrma extension".to_string());
    }
    if filename.contains('/') || filename.contains('\\') {
        return Err("Filename must not contain path separators".to_string());
    }

    let dir = custom_motions_dir();
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create custom motions dir: {}", e))?;

    let path = dir.join(&filename);
    fs::write(&path, &bytes)
        .map_err(|e| format!("Failed to write VRMA file: {}", e))?;

    Ok(path.to_string_lossy().to_string())
}

/// IPC command: delete a VRMA file from the custom animations directory.
///
/// Silently succeeds if the file does not exist.
#[tauri::command]
pub fn delete_custom_animation(filename: String) -> Result<(), String> {
    if filename.contains('/') || filename.contains('\\') {
        return Err("Filename must not contain path separators".to_string());
    }

    let path = custom_motions_dir().join(&filename);
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete VRMA file: {}", e))?;
    }
    Ok(())
}

/// IPC command: read a VRMA file from the custom animations directory as raw bytes.
#[tauri::command]
pub fn read_custom_animation(filename: String) -> Result<Vec<u8>, String> {
    if filename.contains('/') || filename.contains('\\') {
        return Err("Filename must not contain path separators".to_string());
    }

    let path = custom_motions_dir().join(&filename);
    fs::read(&path).map_err(|e| format!("Failed to read VRMA file '{}': {}", filename, e))
}
