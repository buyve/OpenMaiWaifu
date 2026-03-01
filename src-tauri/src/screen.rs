//! Desktop window enumeration and screen-capture permission checks.
//!
//! On **macOS** the window list is obtained via CoreGraphics
//! (`CGWindowListCopyWindowInfo`), which returns a CFArray of CFDictionary
//! entries — one per on-screen window. The implementation uses raw FFI
//! bindings to CoreFoundation/CoreGraphics rather than a high-level crate,
//! so most of this file is `unsafe`.
//!
//! On **non-macOS** platforms the [`x_win`] crate is used instead, which
//! provides a safe Rust API but may panic on edge-case window manager
//! configurations, hence the `catch_unwind` guards.

use serde::Serialize;

/// Metadata about a single desktop window, serialized and sent to the frontend.
///
/// Coordinates (`x`, `y`) are in screen-space pixels (top-left origin).
/// The frontend converts these to Three.js world-space via
/// `PetBehavior.screenToWorld()`.
#[derive(Debug, Clone, Serialize)]
pub struct WindowInfo {
    pub app_name: String,
    pub title: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    /// Unique window identifier (CGWindowNumber on macOS, window handle on others).
    pub window_id: u32,
}

/// Returns a list of visible, normal-layer windows on the desktop.
///
/// Filters out:
/// - Windows belonging to our own process (by PID)
/// - Non-zero-layer windows (menus, overlays, system UI)
/// - Windows smaller than 50x50 pixels (resize handles, splitters)
/// - Windows with no owner name **and** no title
///
/// On macOS, requires Screen Recording permission for window title access.
/// Use [`check_screen_permission`] to verify before calling.
#[tauri::command]
pub fn get_window_list() -> Vec<WindowInfo> {
    #[cfg(target_os = "macos")]
    {
        get_window_list_cg()
    }

    #[cfg(not(target_os = "macos"))]
    {
        get_window_list_xwin()
    }
}

/// macOS implementation using CoreGraphics `CGWindowListCopyWindowInfo`.
///
/// # Memory management
///
/// `CGWindowListCopyWindowInfo` returns a **retained** CFArray following the
/// Core Foundation "Create Rule" — the caller owns the reference and must call
/// `CFRelease` when done. Each element of the array is a borrowed
/// CFDictionary; we do **not** release individual elements.
///
/// Temporary CFString keys created via the `cfstr!` macro (`CFStringCreateWithCString`)
/// also follow the Create Rule and are released at the end of the function.
///
/// # Safety
///
/// All unsafe blocks interact with CoreFoundation/CoreGraphics C APIs.
/// Type-safety is ensured by checking `CFGetTypeID` before casting opaque
/// `*const c_void` pointers to CFString or CFNumber.
#[cfg(target_os = "macos")]
fn get_window_list_cg() -> Vec<WindowInfo> {
    use std::ffi::c_void;

    // Raw CoreFoundation / CoreGraphics FFI bindings.
    // These are opaque pointer types — all CF objects are represented as
    // `*const c_void` and distinguished by their runtime type ID.
    type CFArrayRef = *const c_void;
    type CFDictionaryRef = *const c_void;
    type CFStringRef = *const c_void;
    type CFNumberRef = *const c_void;
    type CGWindowListOption = u32;

    /// Include only windows that are currently on-screen.
    const K_CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY: CGWindowListOption = 1;
    /// Exclude desktop elements (wallpaper, Finder desktop icons).
    const K_CG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS: CGWindowListOption = 1 << 4;
    /// CFNumber type constant for a signed 32-bit integer.
    const K_CF_NUMBER_SINT32_TYPE: i32 = 3;
    /// CFString encoding constant for UTF-8.
    const K_CF_STRING_ENCODING_UTF8: u32 = 0x08000100;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGWindowListCopyWindowInfo(option: CGWindowListOption, relative_to: u32) -> CFArrayRef;
        fn CGPreflightScreenCaptureAccess() -> bool;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFArrayGetCount(arr: CFArrayRef) -> isize;
        fn CFArrayGetValueAtIndex(arr: CFArrayRef, idx: isize) -> *const c_void;
        fn CFDictionaryGetValue(dict: CFDictionaryRef, key: *const c_void) -> *const c_void;
        fn CFStringGetCStringPtr(s: CFStringRef, encoding: u32) -> *const i8;
        fn CFStringGetCString(s: CFStringRef, buf: *mut i8, buf_size: isize, encoding: u32) -> bool;
        fn CFNumberGetValue(number: CFNumberRef, the_type: i32, value_ptr: *mut c_void) -> bool;
        fn CFRelease(cf: *const c_void);
        fn CFGetTypeID(cf: *const c_void) -> usize;
        fn CFStringGetTypeID() -> usize;
        fn CFNumberGetTypeID() -> usize;
        fn CFDictionaryGetTypeID() -> usize;
    }

    // Creates a temporary CFString from a string literal.
    // IMPORTANT: The returned CFStringRef is owned and must be released with CFRelease.
    macro_rules! cfstr {
        ($s:expr) => {{
            extern "C" {
                fn CFStringCreateWithCString(
                    alloc: *const c_void,
                    cstr: *const i8,
                    encoding: u32,
                ) -> CFStringRef;
            }
            let bytes = concat!($s, "\0");
            unsafe {
                CFStringCreateWithCString(
                    std::ptr::null(),
                    bytes.as_ptr() as *const i8,
                    K_CF_STRING_ENCODING_UTF8,
                )
            }
        }};
    }

    /// Convert a CFStringRef to a Rust `String`.
    ///
    /// Tries the fast path (`CFStringGetCStringPtr`) first, which returns a
    /// direct pointer into the CFString's internal buffer. Falls back to
    /// `CFStringGetCString` with a 512-byte stack buffer if the fast path
    /// returns null (which happens for non-ASCII or non-contiguous strings).
    ///
    /// # Safety
    ///
    /// Caller must ensure `s` is either null or a valid CFStringRef.
    /// The function checks for null and validates the type ID before use.
    unsafe fn cf_string_to_rust(s: CFStringRef) -> Option<String> {
        if s.is_null() {
            return None;
        }
        if CFGetTypeID(s) != CFStringGetTypeID() {
            return None;
        }
        let ptr = CFStringGetCStringPtr(s, K_CF_STRING_ENCODING_UTF8);
        if !ptr.is_null() {
            return Some(std::ffi::CStr::from_ptr(ptr).to_string_lossy().into_owned());
        }
        let mut buf = [0i8; 512];
        if CFStringGetCString(s, buf.as_mut_ptr(), 512, K_CF_STRING_ENCODING_UTF8) {
            Some(std::ffi::CStr::from_ptr(buf.as_ptr()).to_string_lossy().into_owned())
        } else {
            None
        }
    }

    /// Extract a 32-bit signed integer from a CFNumberRef.
    ///
    /// # Safety
    ///
    /// Caller must ensure `n` is either null or a valid CFNumberRef.
    /// The function checks for null and validates the type ID before use.
    unsafe fn cf_number_to_i32(n: CFNumberRef) -> Option<i32> {
        if n.is_null() {
            return None;
        }
        if CFGetTypeID(n) != CFNumberGetTypeID() {
            return None;
        }
        let mut val: i32 = 0;
        if CFNumberGetValue(n, K_CF_NUMBER_SINT32_TYPE, &mut val as *mut i32 as *mut c_void) {
            Some(val)
        } else {
            None
        }
    }

    let options = K_CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY | K_CG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS;
    // SAFETY: CGWindowListCopyWindowInfo is a well-defined CoreGraphics API.
    // Passing 0 as `relative_to` means "all windows". The returned CFArray is
    // owned (Create Rule) and released at the end of this function.
    let list = unsafe { CGWindowListCopyWindowInfo(options, 0) };
    if list.is_null() {
        eprintln!("[screen] CGWindowListCopyWindowInfo returned null");
        return Vec::new();
    }

    let count = unsafe { CFArrayGetCount(list) };
    let our_pid = std::process::id() as i32;

    let k_owner_name = cfstr!("kCGWindowOwnerName");
    let k_name = cfstr!("kCGWindowName");
    let k_layer = cfstr!("kCGWindowLayer");
    let k_pid = cfstr!("kCGWindowOwnerPID");
    let k_bounds = cfstr!("kCGWindowBounds");
    let k_window_number = cfstr!("kCGWindowNumber");
    let k_x = cfstr!("X");
    let k_y = cfstr!("Y");
    let k_w = cfstr!("Width");
    let k_h = cfstr!("Height");

    let mut result = Vec::new();

    for i in 0..count {
        let dict = unsafe { CFArrayGetValueAtIndex(list, i) };
        if dict.is_null() {
            continue;
        }

        // Layer (skip non-zero = menus, overlays, etc)
        let layer_val = unsafe { CFDictionaryGetValue(dict, k_layer as *const _) };
        let layer = unsafe { cf_number_to_i32(layer_val) }.unwrap_or(0);
        if layer != 0 {
            continue;
        }

        // PID (skip our own)
        let pid_val = unsafe { CFDictionaryGetValue(dict, k_pid as *const _) };
        let pid = unsafe { cf_number_to_i32(pid_val) }.unwrap_or(0);
        if pid == our_pid {
            continue;
        }

        // Owner name
        let owner_val = unsafe { CFDictionaryGetValue(dict, k_owner_name as *const _) };
        let owner = unsafe { cf_string_to_rust(owner_val) }.unwrap_or_default();

        // Window name/title
        let name_val = unsafe { CFDictionaryGetValue(dict, k_name as *const _) };
        let title = unsafe { cf_string_to_rust(name_val) }.unwrap_or_default();

        // Log even titleless windows for debug
        if title.is_empty() && owner.is_empty() {
            continue;
        }

        // Bounds
        let bounds_val = unsafe { CFDictionaryGetValue(dict, k_bounds as *const _) };
        if bounds_val.is_null() {
            continue;
        }
        // bounds_val is a CFDictionary with X, Y, Width, Height
        let x_val = unsafe { CFDictionaryGetValue(bounds_val, k_x as *const _) };
        let y_val = unsafe { CFDictionaryGetValue(bounds_val, k_y as *const _) };
        let w_val = unsafe { CFDictionaryGetValue(bounds_val, k_w as *const _) };
        let h_val = unsafe { CFDictionaryGetValue(bounds_val, k_h as *const _) };

        let x = unsafe { cf_number_to_i32(x_val) }.unwrap_or(0);
        let y = unsafe { cf_number_to_i32(y_val) }.unwrap_or(0);
        let w = unsafe { cf_number_to_i32(w_val) }.unwrap_or(0);
        let h = unsafe { cf_number_to_i32(h_val) }.unwrap_or(0);

        // Skip tiny windows (resize handles, splitters, etc)
        if w < 50 || h < 50 {
            continue;
        }

        // Window number (unique ID for this window)
        let wid_val = unsafe { CFDictionaryGetValue(dict, k_window_number as *const _) };
        let window_id = unsafe { cf_number_to_i32(wid_val) }.unwrap_or(0) as u32;

        result.push(WindowInfo {
            app_name: owner,
            title,
            x,
            y,
            width: w,
            height: h,
            window_id,
        });
    }

    // SAFETY: All CFStringRef keys were created with CFStringCreateWithCString
    // (Create Rule) and must be released. `list` is the CFArray returned by
    // CGWindowListCopyWindowInfo (also Create Rule). Individual array elements
    // are borrowed references and must NOT be released.
    unsafe {
        CFRelease(k_owner_name);
        CFRelease(k_name);
        CFRelease(k_layer);
        CFRelease(k_pid);
        CFRelease(k_bounds);
        CFRelease(k_window_number);
        CFRelease(k_x);
        CFRelease(k_y);
        CFRelease(k_w);
        CFRelease(k_h);
        CFRelease(list);
    }

    // Debug log (only first call)
    static LOGGED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if !LOGGED.swap(true, std::sync::atomic::Ordering::Relaxed) {
        eprintln!("[screen] CGWindowList found {} windows", result.len());
        for w in result.iter().take(5) {
            eprintln!("[screen]   {} | {} | {}x{} @ ({},{})", w.app_name, w.title, w.width, w.height, w.x, w.y);
        }
    }
    result
}

/// Non-macOS fallback using the `x_win` crate.
///
/// Wraps `x_win::get_open_windows()` in `catch_unwind` because the crate
/// may panic on unusual window manager configurations (e.g. missing X11
/// properties). Filters out our own window and zero-sized entries.
#[cfg(not(target_os = "macos"))]
fn get_window_list_xwin() -> Vec<WindowInfo> {
    match std::panic::catch_unwind(|| x_win::get_open_windows()) {
        Ok(Ok(windows)) => windows
            .into_iter()
            .filter(|w| {
                !w.title.is_empty()
                    && w.info.name != "OpenMaiWaifu"
                    && w.position.width > 0
                    && w.position.height > 0
            })
            .map(|w| WindowInfo {
                app_name: w.info.name,
                title: w.title,
                x: w.position.x,
                y: w.position.y,
                width: w.position.width,
                height: w.position.height,
                window_id: w.id,
            })
            .collect(),
        Ok(Err(e)) => {
            eprintln!("[screen] Failed to get window list: {:?}", e);
            Vec::new()
        }
        Err(_) => {
            eprintln!("[screen] get_window_list panicked, returning empty");
            Vec::new()
        }
    }
}

/// Returns the currently focused/active window, if any.
///
/// Uses [`x_win::get_active_window`] wrapped in `catch_unwind` to prevent
/// panics from propagating. Returns `None` if the active window has no
/// title and no owner name, or if detection fails.
#[tauri::command]
pub fn get_active_window() -> Option<WindowInfo> {
    match std::panic::catch_unwind(|| x_win::get_active_window()) {
        Ok(Ok(w)) => {
            if w.title.is_empty() && w.info.name.is_empty() {
                return None;
            }
            Some(WindowInfo {
                app_name: w.info.name,
                title: w.title,
                x: w.position.x,
                y: w.position.y,
                width: w.position.width,
                height: w.position.height,
                window_id: w.id,
            })
        }
        Ok(Err(e)) => {
            eprintln!("[screen] Failed to get active window: {:?}", e);
            None
        }
        Err(_) => {
            eprintln!("[screen] get_active_window panicked, returning None");
            None
        }
    }
}

/// Get the current browser tab URL.
///
/// Uses AppleScript on macOS and UI Automation on Windows.
/// Returns `None` on unsupported platforms, non-browser apps, or query failure.
#[tauri::command]
pub async fn get_browser_url(app_name: String) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let lower = app_name.to_lowercase();

        // Determine the AppleScript to run based on the browser.
        // Safari uses "URL of current tab", Chromium browsers use "URL of active tab".
        let script = if lower.contains("safari") {
            format!(
                r#"tell application "{}" to get URL of current tab of front window"#,
                app_name
            )
        } else if lower.contains("chrome")
            || lower.contains("arc")
            || lower.contains("brave")
            || lower.contains("edge")
            || lower.contains("opera")
        {
            format!(
                r#"tell application "{}" to get URL of active tab of front window"#,
                app_name
            )
        } else if lower.contains("firefox") {
            // Firefox does not support AppleScript tab URL queries
            return None;
        } else {
            return None;
        };

        match tokio::process::Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
            .await
        {
            Ok(output) if output.status.success() => {
                let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if url.is_empty() || url == "missing value" {
                    None
                } else {
                    Some(url)
                }
            }
            Ok(output) => {
                let err = String::from_utf8_lossy(&output.stderr);
                eprintln!("[screen] AppleScript failed for {}: {}", app_name, err.chars().take(120).collect::<String>());
                None
            }
            Err(e) => {
                eprintln!("[screen] Failed to run osascript: {}", e);
                None
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let lower = app_name.to_lowercase();
        if !lower.contains("chrome")
            && !lower.contains("edge")
            && !lower.contains("brave")
            && !lower.contains("opera")
            && !lower.contains("arc")
            && !lower.contains("firefox")
        {
            return None;
        }

        return tokio::task::spawn_blocking(move || -> Option<String> {
            use windows::Win32::System::Com::{
                CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
                COINIT_APARTMENTTHREADED,
            };
            use windows::Win32::System::Variant::VARIANT;
            use windows::Win32::UI::Accessibility::*;
            use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

            unsafe {
                if CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_err() {
                    return None;
                }

                let result = (|| -> Option<String> {
                    let automation: IUIAutomation =
                        CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()?;
                    let hwnd = GetForegroundWindow();
                    let root = automation.ElementFromHandle(hwnd).ok()?;

                    let cond = automation
                        .CreatePropertyCondition(
                            UIA_ControlTypePropertyId,
                            &VARIANT::from(50004i32),
                        )
                        .ok()?;
                    let edits = root.FindAll(TreeScope_Descendants, &cond).ok()?;

                    let count = edits.Length().unwrap_or(0);
                    for i in 0..count {
                        if let Ok(el) = edits.GetElement(i) {
                            if let Ok(vp) = el.GetCurrentPatternAs::<IUIAutomationValuePattern>(
                                UIA_ValuePatternId,
                            ) {
                                let value = vp.CurrentValue().unwrap_or_default().to_string();
                                if value.contains("://")
                                    || value.contains(".com")
                                    || value.contains(".org")
                                {
                                    return Some(value);
                                }
                            }
                        }
                    }
                    None
                })();

                CoUninitialize();
                result
            }
        })
        .await
        .ok()
        .flatten();
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = app_name;
        None
    }
}

/// Check if the macOS Screen Recording permission is granted.
///
/// On macOS, calls `CGPreflightScreenCaptureAccess()` which returns `true`
/// if the app already has permission and `false` otherwise. This does **not**
/// trigger the system permission dialog (use `CGRequestScreenCaptureAccess`
/// for that).
///
/// On non-macOS platforms, always returns `true`.
#[tauri::command]
pub fn check_screen_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        #[link(name = "CoreGraphics", kind = "framework")]
        extern "C" {
            fn CGPreflightScreenCaptureAccess() -> bool;
        }
        // SAFETY: CGPreflightScreenCaptureAccess is a side-effect-free query.
        unsafe { CGPreflightScreenCaptureAccess() }
    }

    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}
