//! Binary entry point for the AI Desktop Companion Tauri app.
//!
//! In release builds, `windows_subsystem = "windows"` hides the console
//! window on Windows. All application logic is in [`ai_desktop_companion_lib::run`].

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ai_desktop_companion_lib::run()
}
