//! Process resource statistics and file utilities exposed to the frontend.

use sysinfo::{Pid, System};

/// Returns the current process memory usage in megabytes.
#[tauri::command]
pub fn get_process_stats() -> serde_json::Value {
    let pid = Pid::from_u32(std::process::id());
    let mut sys = System::new();
    sys.refresh_processes(
        sysinfo::ProcessesToUpdate::Some(&[pid]),
        true,
    );

    let memory_mb = sys
        .process(pid)
        .map(|p| p.memory() as f64 / 1_048_576.0)
        .unwrap_or(0.0);

    serde_json::json!({
        "memory_mb": (memory_mb * 10.0).round() / 10.0
    })
}

/// Read a file as raw bytes. Used for drag-and-drop VRM loading
/// so the frontend can create a Blob without the asset protocol.
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}
