//! Mouse-position polling for transparent-window hit-testing.
//!
//! Because the Tauri window is transparent and covers the entire screen,
//! native mouse events pass through to underlying applications. To detect
//! when the cursor is over the VRM character, we poll the global mouse
//! position at ~60 Hz and emit window-relative coordinates to the frontend.
//!
//! The frontend uses these coordinates with a Three.js raycaster to decide
//! whether `setIgnoreCursorEvents(false)` should be called (cursor is over
//! the character) or `setIgnoreCursorEvents(true)` (cursor should pass
//! through to the desktop).

use mouse_position::mouse_position::Mouse;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// Window-relative mouse coordinates in logical pixels.
#[derive(Clone, Serialize)]
pub struct MousePosition {
    pub x: i32,
    pub y: i32,
}

/// Start a background thread that polls the global mouse position at ~60 Hz
/// and emits `"mouse-move"` events containing window-relative coordinates.
///
/// # Coordinate conversion
///
/// `Mouse::get_mouse_position()` returns global screen coordinates in logical
/// points (macOS CGEvent coordinate space). We subtract the window's outer
/// position (also in logical pixels) to get window-relative coordinates that
/// the frontend can feed directly into its Three.js raycaster.
///
/// The window position is cached and refreshed every ~60 frames (~1 second)
/// to avoid per-frame Tauri IPC overhead.
///
/// # Shutdown
///
/// Returns an `Arc<AtomicBool>` that the caller can set to `false` to
/// gracefully stop the polling thread. This is wired to the "Quit" tray
/// menu action in `lib.rs`.
///
/// The thread also stops after `MAX_CONSECUTIVE_FAILURES` (300, ~5 seconds)
/// consecutive emit failures, which indicates the webview has been destroyed.
pub fn start_mouse_polling(app: AppHandle) -> Arc<AtomicBool> {
    let running = Arc::new(AtomicBool::new(true));
    let running_clone = running.clone();

    thread::spawn(move || {
        // Cache window position (logical pixels) and scale factor.
        // Updated every ~1 second to avoid per-frame overhead.
        let mut win_logical_x: f64 = 0.0;
        let mut win_logical_y: f64 = 0.0;
        let mut scale_factor: f64 = 1.0;
        let mut frame_count: u64 = 0;
        let mut consecutive_failures: u32 = 0;
        const MAX_CONSECUTIVE_FAILURES: u32 = 300; // ~5 seconds at 60Hz

        while running_clone.load(Ordering::Relaxed) {
            // Refresh window position every ~60 frames (~1 second)
            if frame_count % 60 == 0 {
                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(factor) = window.scale_factor() {
                        scale_factor = factor;
                    }
                    if let Ok(pos) = window.outer_position() {
                        win_logical_x = pos.x as f64 / scale_factor;
                        win_logical_y = pos.y as f64 / scale_factor;
                    }
                }
            }
            frame_count = frame_count.wrapping_add(1);

            match Mouse::get_mouse_position() {
                Mouse::Position { x, y } => {
                    // Mouse::get_mouse_position() returns global screen coords
                    // in logical points (macOS CGEvent coordinate space).
                    // Convert to window-relative by subtracting window position.
                    let rel_x = x as f64 - win_logical_x;
                    let rel_y = y as f64 - win_logical_y;

                    let pos = MousePosition {
                        x: rel_x as i32,
                        y: rel_y as i32,
                    };
                    if let Err(e) = app.emit("mouse-move", pos) {
                        consecutive_failures += 1;
                        if consecutive_failures == 1 || consecutive_failures % 60 == 0 {
                            eprintln!("[hittest] emit failed ({}x): {e}", consecutive_failures);
                        }
                        if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                            eprintln!("[hittest] too many consecutive emit failures, stopping");
                            break;
                        }
                        continue;
                    }
                    consecutive_failures = 0;
                }
                Mouse::Error => {
                    // Silently skip frames where position cannot be read
                }
            }
            thread::sleep(Duration::from_millis(16)); // ~60Hz
        }
    });

    running
}
