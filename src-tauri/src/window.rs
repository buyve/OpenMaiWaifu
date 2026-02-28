//! Primary screen size detection.
//!
//! Used at startup to size the transparent overlay window to cover the full
//! screen, and by the frontend to convert screen-pixel coordinates to
//! Three.js world-space.

use serde::Serialize;

/// Primary screen dimensions in pixels.
#[derive(Debug, Clone, Serialize)]
pub struct ScreenSize {
    pub width: u32,
    pub height: u32,
}

/// Returns the primary screen dimensions.
///
/// On macOS, queries the Cocoa framework via `NSScreen::mainScreen()` and
/// reads its `frame` rectangle. Falls back to 1920x1080 if `mainScreen`
/// returns `nil` (e.g. headless environment) or on non-macOS platforms.
///
/// # Safety (macOS path)
///
/// The `unsafe` block calls Objective-C methods through the `cocoa` crate's
/// safe wrappers. `NSScreen::mainScreen(nil)` may return `nil` on headless
/// systems — this is checked before accessing the frame.
#[tauri::command]
pub fn get_screen_size() -> ScreenSize {
    #[cfg(target_os = "macos")]
    {
        use cocoa::appkit::NSScreen;
        use cocoa::base::nil;
        use cocoa::foundation::NSRect;

        // SAFETY: NSScreen::mainScreen(nil) is a class method that returns an
        // autoreleased NSScreen object (or nil). We only read its frame, which
        // is a plain NSRect struct copy — no retained references escape.
        unsafe {
            let main_screen = NSScreen::mainScreen(nil);
            if main_screen != nil {
                let frame: NSRect = NSScreen::frame(main_screen);
                return ScreenSize {
                    width: frame.size.width as u32,
                    height: frame.size.height as u32,
                };
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};
        let w = unsafe { GetSystemMetrics(SM_CXSCREEN) };
        let h = unsafe { GetSystemMetrics(SM_CYSCREEN) };
        if w > 0 && h > 0 {
            return ScreenSize {
                width: w as u32,
                height: h as u32,
            };
        }
    }

    // Fallback for other platforms or if detection fails
    ScreenSize {
        width: 1920,
        height: 1080,
    }
}

/// Information about a connected display monitor.
#[derive(Debug, Clone, Serialize)]
pub struct MonitorInfo {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

/// Information about the macOS Dock (or equivalent taskbar).
#[derive(Debug, Clone, Serialize)]
pub struct DockInfo {
    pub height: u32,
    pub position: String, // "bottom", "left", "right"
    pub is_hidden: bool,
}

/// Returns information about the macOS Dock position and size.
///
/// On macOS, compares `NSScreen::frame()` (full screen area) with
/// `NSScreen::visibleFrame()` (area excluding menu bar and Dock) to
/// determine Dock placement and height.
///
/// On non-macOS platforms, returns a hidden dock at the bottom.
#[tauri::command]
pub fn get_dock_info() -> DockInfo {
    #[cfg(target_os = "macos")]
    {
        use cocoa::appkit::NSScreen;
        use cocoa::base::nil;
        use cocoa::foundation::NSRect;

        unsafe {
            let main_screen = NSScreen::mainScreen(nil);
            if main_screen != nil {
                let frame: NSRect = NSScreen::frame(main_screen);
                let visible: NSRect = NSScreen::visibleFrame(main_screen);

                // macOS coordinate system: origin at bottom-left
                // Dock at bottom: visibleFrame.origin.y > frame.origin.y
                let dock_bottom = (visible.origin.y - frame.origin.y) as u32;
                // Dock at left: visibleFrame.origin.x > frame.origin.x
                let dock_left = (visible.origin.x - frame.origin.x) as u32;
                // Dock at right: frame extends beyond visible on the right
                let dock_right = ((frame.size.width - visible.size.width) as u32).saturating_sub(dock_left);

                if dock_bottom > 0 {
                    return DockInfo {
                        height: dock_bottom,
                        position: "bottom".to_string(),
                        is_hidden: false,
                    };
                } else if dock_left > 0 {
                    return DockInfo {
                        height: dock_left,
                        position: "left".to_string(),
                        is_hidden: false,
                    };
                } else if dock_right > 0 {
                    return DockInfo {
                        height: dock_right,
                        position: "right".to_string(),
                        is_hidden: false,
                    };
                }

                // No dock space detected — dock is hidden
                return DockInfo {
                    height: 0,
                    position: "bottom".to_string(),
                    is_hidden: true,
                };
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::Shell::*;

        let mut abd: APPBARDATA = unsafe { std::mem::zeroed() };
        abd.cbSize = std::mem::size_of::<APPBARDATA>() as u32;

        let result = unsafe { SHAppBarMessage(ABM_GETTASKBARPOS, &mut abd) };
        if result != 0 {
            let state = unsafe { SHAppBarMessage(ABM_GETSTATE, &mut abd) };
            let is_hidden = (state & ABS_AUTOHIDE as usize) != 0;

            let (position, height) = match abd.uEdge {
                ABE_BOTTOM => ("bottom", (abd.rc.bottom - abd.rc.top) as u32),
                ABE_TOP => ("top", (abd.rc.bottom - abd.rc.top) as u32),
                ABE_LEFT => ("left", (abd.rc.right - abd.rc.left) as u32),
                ABE_RIGHT => ("right", (abd.rc.right - abd.rc.left) as u32),
                _ => ("bottom", 48),
            };

            return DockInfo {
                height,
                position: position.to_string(),
                is_hidden,
            };
        }
    }

    // Fallback for other platforms or if detection fails
    DockInfo {
        height: 0,
        position: "bottom".to_string(),
        is_hidden: true,
    }
}

/// Returns all connected monitors with their positions, dimensions, and scale factors.
///
/// On macOS, enumerates via `NSScreen::screens()`. The first screen in the
/// array is always the primary monitor.
///
/// On non-macOS platforms, returns a single fallback monitor at (0,0) 1920x1080.
#[tauri::command]
pub fn get_all_monitors() -> Vec<MonitorInfo> {
    #[cfg(target_os = "macos")]
    {
        use cocoa::appkit::NSScreen;
        use cocoa::base::nil;
        use cocoa::foundation::{NSArray, NSRect};

        let mut monitors = Vec::new();

        // SAFETY: NSScreen::screens() returns an autoreleased NSArray of NSScreen
        // objects. We iterate over them and read their frame/backingScaleFactor,
        // which are plain struct copies and floats.
        unsafe {
            let screens = NSScreen::screens(nil);
            let count = screens.count();
            for i in 0..count {
                let screen = screens.objectAtIndex(i);
                let frame: NSRect = NSScreen::frame(screen);
                let scale = NSScreen::backingScaleFactor(screen);
                monitors.push(MonitorInfo {
                    x: frame.origin.x as i32,
                    y: frame.origin.y as i32,
                    width: frame.size.width as u32,
                    height: frame.size.height as u32,
                    scale_factor: scale,
                    is_primary: i == 0,
                });
            }
        }

        if !monitors.is_empty() {
            return monitors;
        }
    }

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::{BOOL, LPARAM, RECT};
        use windows::Win32::Graphics::Gdi::{
            EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW,
            MONITORINFOF_PRIMARY,
        };
        use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};

        struct MonitorData {
            monitors: Vec<MonitorInfo>,
        }

        unsafe extern "system" fn enum_cb(
            hmon: HMONITOR,
            _hdc: HDC,
            _rect: *mut RECT,
            data: LPARAM,
        ) -> BOOL {
            let data = &mut *(data.0 as *mut MonitorData);
            let mut mi: MONITORINFOEXW = std::mem::zeroed();
            mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
            if GetMonitorInfoW(hmon, &mut mi as *mut _ as *mut MONITORINFO).as_bool() {
                let rc = mi.monitorInfo.rcMonitor;
                let is_primary = (mi.monitorInfo.dwFlags & MONITORINFOF_PRIMARY) != 0;
                let mut dpi_x: u32 = 96;
                let mut dpi_y: u32 = 96;
                let _ = GetDpiForMonitor(hmon, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y);
                let scale = dpi_x as f64 / 96.0;
                data.monitors.push(MonitorInfo {
                    x: rc.left,
                    y: rc.top,
                    width: (rc.right - rc.left) as u32,
                    height: (rc.bottom - rc.top) as u32,
                    scale_factor: scale,
                    is_primary,
                });
            }
            BOOL(1)
        }

        let mut data = MonitorData {
            monitors: Vec::new(),
        };
        unsafe {
            let _ = EnumDisplayMonitors(
                HDC::default(),
                None,
                Some(enum_cb),
                LPARAM(&mut data as *mut _ as isize),
            );
        }
        if !data.monitors.is_empty() {
            return data.monitors;
        }
    }

    // Fallback for other platforms or if detection fails
    vec![MonitorInfo {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        scale_factor: 1.0,
        is_primary: true,
    }]
}
