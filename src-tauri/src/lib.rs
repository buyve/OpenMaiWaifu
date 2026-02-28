//! AI Desktop Companion — Tauri backend entry point.
//!
//! This crate drives the transparent, always-on-top desktop pet window.
//! It initialises a full-screen transparent Tauri webview, sets up
//! mouse-position polling for hit-testing, and exposes IPC commands for:
//!
//! - Screen/window enumeration ([`screen`])
//! - OpenClaw chat and webhook integration ([`openclaw`])
//! - Persistent user configuration ([`config`])
//! - Primary-screen size detection ([`window`])
//! - Mouse coordinate broadcasting ([`hittest`])

mod audio;
mod config;
mod hittest;
mod memory;
mod openclaw;
mod screen;
mod stats;
mod window;

use config::ConfigState;
use openclaw::HttpClient;
use std::sync::atomic::Ordering;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, WindowEvent};

/// Bootstrap the Tauri application.
///
/// This function performs the following setup sequence:
///
/// 1. **Managed state** — registers a shared [`HttpClient`] (reqwest) and
///    [`ConfigState`] (loaded from `~/.config/ai-desktop-companion/config.json`).
/// 2. **Window positioning** — moves the main webview to `(0, 0)` and resizes it
///    to cover the entire primary screen.
/// 3. **Close interception** — prevents the window-close event from terminating
///    the app; the window is hidden instead, so the tray icon stays alive.
/// 4. **Mouse polling** — starts a 60 Hz background thread that emits
///    `"mouse-move"` events to the frontend for raycaster hit-testing.
/// 5. **System tray** — builds a tray icon with menu items (Show/Hide, Chat,
///    Settings, Change Character, Quiet Mode, Quit) and wires up event handlers.
/// 6. **Autostart plugin** — enables macOS Launch Agent auto-start.
/// 7. **Invoke handler** — registers all `#[tauri::command]` functions so the
///    frontend can call them via `invoke()`.
///
/// # Panics
///
/// Panics if the embedded tray icon (`icons/icon.png`) cannot be loaded, or if
/// the Tauri runtime itself fails to start.
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Register shared HTTP client and config state for OpenClaw commands
            app.manage(HttpClient::new());
            app.manage(ConfigState::load());

            // Position the main window at (0, 0) and resize to fill the screen.
            if let Some(main_window) = app.get_webview_window("main") {
                let screen_size = window::get_screen_size();
                let _ = main_window.set_position(tauri::LogicalPosition::new(0.0, 0.0));
                let _ = main_window.set_size(tauri::LogicalSize::new(
                    screen_size.width as f64,
                    screen_size.height as f64,
                ));

                // Prevent window close from killing the app — hide instead
                let win = main_window.clone();
                main_window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win.hide();
                    }
                });
            }

            // Start mouse-position polling for hit-testing.
            let mouse_polling_running = hittest::start_mouse_polling(app.handle().clone());

            // Start audio level monitoring for music detection.
            if audio::start_audio_monitoring() {
                println!("[audio] Audio monitoring started");
            } else {
                eprintln!("[audio] Audio monitoring failed to start (may need permissions)");
            }

            // Load tray icon from bundled PNG
            let icon = Image::from_path("icons/icon.png")
                .or_else(|_| Image::from_path("src-tauri/icons/icon.png"))
                .unwrap_or_else(|_| Image::from_bytes(include_bytes!("../icons/icon.png")).expect("embedded icon"));

            // Build system tray menu
            let show_hide =
                MenuItem::with_id(app, "show_hide", "Show / Hide", true, None::<&str>)?;
            let open_chat = MenuItem::with_id(app, "open_chat", "Open Chat", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let change_character = MenuItem::with_id(
                app,
                "change_character",
                "Change Character",
                true,
                None::<&str>,
            )?;
            let quiet_mode = MenuItem::with_id(
                app,
                "quiet_mode",
                "Quiet Mode (30min)",
                true,
                None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[
                    &show_hide,
                    &open_chat,
                    &settings,
                    &change_character,
                    &quiet_mode,
                    &quit,
                ],
            )?;

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .tooltip("ClawMate")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show_hide" => {
                        if let Some(w) = app.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                    "open_chat" => {
                        // Show window first, then emit event
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                        let _ = app.emit("tray-open-chat", ());
                    }
                    "settings" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                        let _ = app.emit("tray-settings", ());
                    }
                    "change_character" => {
                        let _ = app.emit("tray-change-character", ());
                    }
                    "quiet_mode" => {
                        let _ = app.emit("tray-quiet-mode", ());
                    }
                    "quit" => {
                        mouse_polling_running.store(false, Ordering::Relaxed);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        // Left-click tray icon: toggle window visibility
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            screen::get_window_list,
            screen::get_active_window,
            screen::get_browser_url,
            screen::check_screen_permission,
            window::get_screen_size,
            window::get_all_monitors,
            window::get_dock_info,
            openclaw::send_chat,
            openclaw::send_webhook,
            openclaw::check_openclaw_health,
            openclaw::setup_openclaw_hooks,
            openclaw::check_openclaw_installed,
            openclaw::list_openclaw_agents,
            openclaw::create_openclaw_agent,
            config::get_openclaw_config,
            config::save_openclaw_config,
            audio::get_audio_level,
            stats::get_process_stats,
            stats::read_file_bytes,
            memory::read_data_file,
            memory::write_data_file,
            memory::delete_data_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
