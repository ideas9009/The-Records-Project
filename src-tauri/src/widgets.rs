use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::Write,
    sync::Mutex,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
const KINDS: [&str; 3] = ["voteparty", "balance", "online"];
const UNIT: f64 = 200.0;
// Match the CSS 20px radius after both widget scaling and monitor DPI.
fn corner_diameter(dpi: f64, multiplier: f64, w: i32, h: i32) -> i32 {
    (40.0 * dpi * multiplier)
        .round()
        .max(1.0)
        .min(w.min(h).max(1) as f64) as i32
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Widget {
    pub kind: String,
    pub enabled: bool,
    pub mode: String,
    pub width: f64,
    pub height: f64,
    pub x: Option<i32>,
    pub y: Option<i32>,
    #[serde(default)]
    pub locked: bool,
    #[serde(default = "default_widget_scale")]
    pub size_multiplier: f64,
    #[serde(default = "default_blur_level")]
    pub blur_level: u8,
    #[serde(default = "default_tint")]
    pub tint: f64,
    #[serde(default = "default_blur")]
    pub blur: bool,
    #[serde(default)]
    pub auto_scroll: bool,
    #[serde(default)]
    pub anchor: Option<Anchor>,
}
fn default_widget_scale() -> f64 {
    1.0
}
fn default_blur_level() -> u8 {
    1
}
fn default_tint() -> f64 {
    0.75
}
fn default_blur() -> bool {
    true
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Anchor {
    pub id: String,
    pub pid: u32,
    pub corner: String,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct WindowChoice {
    pub id: String,
    pub pid: u32,
    pub title: String,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Pack {
    pub installed: bool,
    pub snap: bool,
    pub widgets: Vec<Widget>,
}
impl Default for Pack {
    fn default() -> Self {
        Self {
            installed: false,
            snap: true,
            widgets: KINDS
                .iter()
                .map(|kind| Widget {
                    kind: kind.to_string(),
                    enabled: false,
                    mode: "desktop".into(),
                    width: 1.0,
                    height: 1.0,
                    x: None,
                    y: None,
                    locked: false,
                    size_multiplier: 1.0,
                    blur_level: 1,
                    tint: 0.75,
                    blur: true,
                    auto_scroll: false,
                    anchor: None,
                })
                .collect(),
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq)]
struct Rect {
    x: i32,
    y: i32,
    w: i32,
    h: i32,
}
#[derive(Clone, Copy)]
struct Drag {
    rect: Rect,
    cursor: (i32, i32),
    resize: bool,
}
type DataCache = Option<(Instant, String, Value)>;
#[derive(Default)]
pub struct Widgets {
    pack: Mutex<Option<Pack>>,
    drags: Mutex<HashMap<String, Drag>>,
    data: tauri::async_runtime::Mutex<DataCache>,
    client: reqwest::Client,
    following: std::sync::atomic::AtomicBool,
}
fn units(value: f64) -> bool {
    value.is_finite()
        && (1.0..=3.0).contains(&value)
        && (value * 2.0 - (value * 2.0).round()).abs() < 0.001
}
fn validate(widget: &Widget) -> Result<(), String> {
    if !KINDS.contains(&widget.kind.as_str())
        || !["desktop", "overlay"].contains(&widget.mode.as_str())
        || !widget.size_multiplier.is_finite()
        || !(0.5..=1.5).contains(&widget.size_multiplier)
        || widget.blur_level > 2
        || !widget.tint.is_finite()
        || !(0.0..=1.0).contains(&widget.tint)
        || !units(widget.width)
        || !units(widget.height)
    {
        return Err("Choose a widget size between 1×1 and 3×3 in half-unit steps.".into());
    }
    if let Some(anchor) = &widget.anchor {
        if !["top-left", "top-right", "bottom-left", "bottom-right"]
            .contains(&anchor.corner.as_str())
            || anchor.id.parse::<isize>().ok().is_none_or(|id| id <= 0)
            || anchor.pid == 0
            || widget.mode != "overlay"
        {
            return Err("Choose an app window and a corner in overlay mode.".into());
        }
    }
    Ok(())
}
fn kind(window: &WebviewWindow) -> Result<String, String> {
    window
        .label()
        .strip_prefix("desktop-widget-")
        .filter(|value| KINDS.contains(value))
        .map(str::to_string)
        .ok_or("Unknown widget window".into())
}
fn main_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Open Expansion Packs in the main app.".into());
    }
    Ok(())
}
fn own(window: &WebviewWindow, target: &str) -> Result<(), String> {
    if window.label() == "main" || kind(window)? == target {
        Ok(())
    } else {
        Err("This widget cannot change another widget.".into())
    }
}
fn read(app: &tauri::AppHandle, state: &Widgets) -> Result<Pack, String> {
    let mut guard = state.pack.lock().map_err(|_| "Widget settings are busy")?;
    if guard.is_none() {
        let path = app
            .path()
            .app_config_dir()
            .map_err(|e| e.to_string())?
            .join("desktop-widgets.json");
        let pack = if path.exists() {
            let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
            let mut candidate: Pack = serde_json::from_slice(&bytes).map_err(|_| {
                "Widget settings could not be read. Your settings have not been replaced."
            })?;
            if candidate.widgets.len() != 3
                || KINDS
                    .iter()
                    .any(|k| candidate.widgets.iter().filter(|w| w.kind == *k).count() != 1)
                || candidate.widgets.iter().any(|w| validate(w).is_err())
            {
                return Err("Widget settings contain an unsupported size or widget.".into());
            }
            let locked = candidate.widgets.iter().any(|w| w.locked);
            let shared = candidate.widgets[0].clone();
            for widget in &mut candidate.widgets {
                widget.locked = locked;
                widget.size_multiplier = shared.size_multiplier;
                widget.blur_level = shared.blur_level;
                widget.blur = shared.blur_level > 0;
                widget.tint = shared.tint;
            }
            candidate
        } else {
            Pack::default()
        };
        *guard = Some(pack)
    }
    Ok(guard.as_ref().unwrap().clone())
}
fn save(app: &tauri::AppHandle, state: &Widgets, pack: Pack) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut tmp = tempfile::NamedTempFile::new_in(&dir).map_err(|e| e.to_string())?;
    tmp.write_all(&serde_json::to_vec(&pack).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    tmp.as_file().sync_all().map_err(|e| e.to_string())?;
    tmp.persist(dir.join("desktop-widgets.json"))
        .map_err(|e| e.to_string())?;
    *state.pack.lock().map_err(|_| "Widget settings are busy")? = Some(pack.clone());
    let _ = app.emit("widgets-changed", &pack);
    Ok(())
}
fn snap(mut rect: Rect, others: &[Rect], gap: i32, distance: i32) -> Rect {
    let original = rect;
    let (mut best_x, mut best_y) = (distance + 1, distance + 1);
    for other in others {
        let adjacent_x = [other.x - original.w - gap, other.x + other.w + gap];
        let adjacent_y = [other.y - original.h - gap, other.y + other.h + gap];
        let mut xs = Vec::new();
        let mut ys = Vec::new();
        if original.y < other.y + other.h + distance && original.y + original.h > other.y - distance
        {
            xs.extend(adjacent_x);
        }
        if adjacent_y
            .iter()
            .any(|y| (y - original.y).abs() <= distance)
        {
            xs.extend([other.x, other.x + other.w - original.w]);
        }
        if original.x < other.x + other.w + distance && original.x + original.w > other.x - distance
        {
            ys.extend(adjacent_y);
        }
        if adjacent_x
            .iter()
            .any(|x| (x - original.x).abs() <= distance)
        {
            ys.extend([other.y, other.y + other.h - original.h]);
        }
        for x in xs {
            let delta = (x - original.x).abs();
            if delta <= distance && delta < best_x {
                rect.x = x;
                best_x = delta
            }
        }
        for y in ys {
            let delta = (y - original.y).abs();
            if delta <= distance && delta < best_y {
                rect.y = y;
                best_y = delta
            }
        }
    }
    rect
}
#[cfg(windows)]
mod platform {
    use super::Rect;
    #[repr(C)]
    struct Point {
        x: i32,
        y: i32,
    }
    #[repr(C)]
    struct WinRect {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }
    #[link(name = "user32")]
    extern "system" {
        fn EnumWindows(
            callback: unsafe extern "system" fn(isize, isize) -> i32,
            param: isize,
        ) -> i32;
        fn FindWindowExW(
            parent: isize,
            after: isize,
            class: *const u16,
            title: *const u16,
        ) -> isize;
        fn FindWindowW(class: *const u16, title: *const u16) -> isize;
        fn GetParent(window: isize) -> isize;
        fn SetParent(window: isize, parent: isize) -> isize;
        fn GetWindowLongPtrW(window: isize, index: i32) -> isize;
        fn SetWindowLongPtrW(window: isize, index: i32, value: isize) -> isize;
        fn SetWindowPos(
            window: isize,
            after: isize,
            x: i32,
            y: i32,
            w: i32,
            h: i32,
            flags: u32,
        ) -> i32;
        fn ScreenToClient(window: isize, point: *mut Point) -> i32;
        fn GetWindowRect(window: isize, rect: *mut WinRect) -> i32;
        fn GetCursorPos(point: *mut Point) -> i32;
        fn GetSystemMetrics(index: i32) -> i32;
    }
    #[link(name = "user32")]
    extern "system" {
        fn SetWindowRgn(window: isize, region: isize, redraw: i32) -> i32;
        fn SetPropW(window: isize, name: *const u16, value: isize) -> i32;
        fn GetPropW(window: isize, name: *const u16) -> isize;
        fn RemovePropW(window: isize, name: *const u16) -> isize;
        fn GetDpiForWindow(window: isize) -> u32;
        fn GetClassLongPtrW(window: isize, index: i32) -> usize;
        fn SetClassLongPtrW(window: isize, index: i32, value: isize) -> usize;
        fn GetClassNameW(window: isize, text: *mut u16, count: i32) -> i32;
        fn SetLayeredWindowAttributes(window: isize, color: u32, alpha: u8, flags: u32) -> i32;
        fn IsWindow(window: isize) -> i32;
        fn IsWindowVisible(window: isize) -> i32;
        fn IsIconic(window: isize) -> i32;
        fn GetWindowTextLengthW(window: isize) -> i32;
        fn GetWindowTextW(window: isize, text: *mut u16, count: i32) -> i32;
        fn GetWindowThreadProcessId(window: isize, pid: *mut u32) -> u32;
        fn GetClientRect(window: isize, rect: *mut WinRect) -> i32;
        fn ClientToScreen(window: isize, point: *mut Point) -> i32;
        fn GetWindow(window: isize, relation: u32) -> isize;
        fn ShowWindow(window: isize, command: i32) -> i32;
    }
    #[link(name = "gdi32")]
    extern "system" {
        fn CreateRoundRectRgn(
            left: i32,
            top: i32,
            right: i32,
            bottom: i32,
            w: i32,
            h: i32,
        ) -> isize;
        fn DeleteObject(object: isize) -> i32;
    }

    const FRAME_BITS: u32 = 0x00cf0000;
    const DESKTOP: usize = 1;
    const PASSTHROUGH: usize = 2;
    const SUBCLASS_ID: usize = 0x545250;
    #[repr(C)]
    struct StyleChange {
        old: u32,
        new: u32,
    }
    type Subclass = unsafe extern "system" fn(isize, u32, usize, isize, usize, usize) -> isize;
    #[link(name = "comctl32")]
    extern "system" {
        fn SetWindowSubclass(
            window: isize,
            callback: Option<Subclass>,
            id: usize,
            data: usize,
        ) -> i32;
        fn RemoveWindowSubclass(window: isize, callback: Option<Subclass>, id: usize) -> i32;
        fn DefSubclassProc(window: isize, message: u32, wparam: usize, lparam: isize) -> isize;
    }
    unsafe extern "system" fn widget_proc(
        window: isize,
        message: u32,
        wparam: usize,
        lparam: isize,
        id: usize,
        flags: usize,
    ) -> isize {
        match message {
            // Keep a full client area even after theme, focus and WebView messages.
            0x0083 | 0x0085 => return 0, // WM_NCCALCSIZE / WM_NCPAINT
            0x0086 => return 1,          // WM_NCACTIVATE: never draw a classic caption
            0x0021 => return 3, // WM_MOUSEACTIVATE: deliver the click without activating Explorer
            0x007c if lparam != 0 => {
                // WM_STYLECHANGING
                let change = &mut *(lparam as *mut StyleChange);
                if wparam as isize == -16 {
                    change.new &= !(FRAME_BITS | 0xc0000000);
                    change.new |= if flags & DESKTOP != 0 {
                        0x40000000
                    } else {
                        0x80000000
                    };
                } else if wparam as isize == -20 {
                    change.new &= !(0x00060301 | 0x00080020);
                    // Retain the layered surface for native corner clipping,
                    // independently of whether mouse input passes through.
                    change.new |= 0x08080080;
                    if flags & PASSTHROUGH != 0 {
                        change.new |= 0x00080020;
                    }
                }
            }
            0x0082 => {
                RemovePropW(window, wide("TRPWidgetCornerScale").as_ptr());
                RemoveWindowSubclass(window, Some(widget_proc), id);
            }
            _ => {}
        }
        DefSubclassProc(window, message, wparam, lparam)
    }
    pub fn guard(window: isize, desktop: bool, click_through: bool) -> Result<(), String> {
        // Layered WebView windows cannot keep Tao's private GDI DC class bits.
        unsafe {
            let class = GetClassLongPtrW(window, -26);
            SetClassLongPtrW(window, -26, (class & !(0x20 | 0x40)) as isize);
        }
        let flags = if desktop { DESKTOP } else { 0 } | if click_through { PASSTHROUGH } else { 0 };
        if unsafe { SetWindowSubclass(window, Some(widget_proc), SUBCLASS_ID, flags) } == 0 {
            return Err("Windows could not prepare the widget surface.".into());
        }
        Ok(())
    }
    #[cfg(test)]
    pub fn client_size(window: isize) -> (i32, i32) {
        let mut r = WinRect {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        unsafe {
            GetClientRect(window, &mut r);
        }
        (r.right - r.left, r.bottom - r.top)
    }

    pub fn corner_scale(window: isize, multiplier: f64) -> Result<(), String> {
        if unsafe {
            SetPropW(
                window,
                wide("TRPWidgetCornerScale").as_ptr(),
                (multiplier * 1000.0).round() as isize,
            )
        } == 0
        {
            return Err("Widget corner scale could not be applied.".into());
        }
        Ok(())
    }
    pub fn rounded(window: isize, w: i32, h: i32) -> Result<(), String> {
        unsafe {
            let scale = (GetDpiForWindow(window).max(96) as f64) / 96.0;
            let saved = GetPropW(window, wide("TRPWidgetCornerScale").as_ptr());
            let multiplier = if saved > 0 {
                saved as f64 / 1000.0
            } else {
                1.0
            };
            let diameter = super::corner_diameter(scale, multiplier, w, h);
            let region = CreateRoundRectRgn(0, 0, w, h, diameter, diameter);
            if region == 0 {
                return Err("Rounded widget corners could not be created.".into());
            }
            if SetWindowRgn(window, region, 1) == 0 {
                DeleteObject(region);
                return Err("Rounded widget corners could not be applied.".into());
            }
            Ok(())
        }
    }
    pub fn target(anchor: &super::Anchor) -> Option<(isize, Rect, bool)> {
        unsafe {
            let window = anchor.id.parse::<isize>().ok()?;
            if IsWindow(window) == 0 {
                return None;
            }
            let mut pid = 0;
            GetWindowThreadProcessId(window, &mut pid);
            if pid != anchor.pid || pid == std::process::id() {
                return None;
            }
            let mut rect = WinRect {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            };
            if GetClientRect(window, &mut rect) == 0 {
                return None;
            }
            let mut origin = Point { x: 0, y: 0 };
            ClientToScreen(window, &mut origin);
            Some((
                window,
                Rect {
                    x: origin.x,
                    y: origin.y,
                    w: rect.right - rect.left,
                    h: rect.bottom - rect.top,
                },
                IsIconic(window) == 0 && IsWindowVisible(window) != 0,
            ))
        }
    }
    unsafe extern "system" fn collect_windows(window: isize, param: isize) -> i32 {
        let mut pid = 0;
        GetWindowThreadProcessId(window, &mut pid);
        if pid == std::process::id() || IsWindowVisible(window) == 0 {
            return 1;
        }
        let count = GetWindowTextLengthW(window);
        if count <= 0 || count > 4096 {
            return 1;
        }
        let mut text = vec![0u16; (count + 1) as usize];
        let length = GetWindowTextW(window, text.as_mut_ptr(), count + 1);
        let title = String::from_utf16_lossy(&text[..length.max(0) as usize]);
        if !title.trim().is_empty() && title != "Program Manager" {
            let rows = &mut *(param as *mut Vec<super::WindowChoice>);
            rows.push(super::WindowChoice {
                id: window.to_string(),
                pid,
                title,
            });
        }
        1
    }
    pub fn windows() -> Vec<super::WindowChoice> {
        let mut rows: Vec<super::WindowChoice> = Vec::new();
        unsafe {
            EnumWindows(
                collect_windows,
                &mut rows as *mut Vec<super::WindowChoice> as isize,
            );
        }
        rows.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
        rows
    }
    pub fn visible(window: isize, show: bool) {
        unsafe {
            if (IsWindowVisible(window) != 0) != show {
                ShowWindow(window, if show { 4 } else { 0 });
            }
        }
    }
    // Insert immediately above the selected app, rather than above unrelated apps.
    pub fn follow_order(window: isize, target: isize) {
        unsafe {
            let previous = GetWindow(target, 3);
            if previous != window {
                SetWindowPos(window, previous, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
            }
        }
    }
    pub fn untop(window: isize) {
        unsafe {
            SetWindowPos(window, -2, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
        }
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn SetLastError(code: u32);
        fn GetLastError() -> u32;
    }
    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(Some(0)).collect()
    }
    unsafe extern "system" fn desktop_candidate(window: isize, param: isize) -> i32 {
        let class = wide("SHELLDLL_DefView");
        if FindWindowExW(window, 0, class.as_ptr(), std::ptr::null()) != 0 {
            *(param as *mut isize) = window;
            0
        } else {
            1
        }
    }
    pub fn host(window: isize, desktop: bool) -> Result<(), String> {
        unsafe {
            let mut parent = 0isize;
            if desktop {
                EnumWindows(desktop_candidate, &mut parent as *mut isize as isize);
                if parent == 0 {
                    parent = FindWindowW(wide("Progman").as_ptr(), std::ptr::null())
                }
                if parent == 0 {
                    return Err("Windows desktop is unavailable. Try Overlay mode.".into());
                }
            }
            let old_parent = GetParent(window);
            let old_style = GetWindowLongPtrW(window, -16);
            let old_ex_style = GetWindowLongPtrW(window, -20);
            // Tao keeps caption bits even for undecorated top-level windows.
            // Reparenting requires removing the actual native frame as well.
            let frameless =
                old_style & !(0x00c00000 | 0x00040000 | 0x00080000 | 0x00020000 | 0x00010000);
            let style = if desktop {
                (frameless & !(0x80000000u32 as isize)) | 0x40000000
            } else {
                (frameless & !0x40000000) | (0x80000000u32 as isize)
            };
            SetWindowLongPtrW(window, -16, style);
            SetWindowLongPtrW(
                window,
                -20,
                (old_ex_style & !(0x00000100 | 0x00000200 | 0x00000001 | 0x00020000 | 0x00040000))
                    | 0x08000000
                    | 0x00000080,
            );
            SetLastError(0);
            SetParent(window, parent);
            let error = GetLastError();
            if error != 0 {
                SetWindowLongPtrW(window, -16, old_style);
                SetWindowLongPtrW(window, -20, old_ex_style);
                SetParent(window, old_parent);
                return Err(format!(
                    "Windows could not change the widget mode ({}). Try Overlay mode.",
                    error
                ));
            }
            SetWindowPos(
                window,
                if desktop { 0 } else { -1 },
                0,
                0,
                0,
                0,
                0x0001 | 0x0002 | 0x0010 | 0x0020,
            );
            Ok(())
        }
    }
    pub fn click_through(window: isize, enabled: bool) -> Result<(), String> {
        unsafe {
            // Only widgets use this class. Main/login windows keep Tao's class.
            let mut name = [0u16; 64];
            let length = GetClassNameW(window, name.as_mut_ptr(), 64);
            if String::from_utf16_lossy(&name[..length.max(0) as usize]) != "TRPDesktopWidget" {
                return Err("Unexpected widget window class.".into());
            }
            // CS_OWNDC/CS_CLASSDC prohibit layered click-through windows.
            // These WebView2 tiles do not use OpenGL or a private GDI context.
            let class = GetClassLongPtrW(window, -26);
            SetClassLongPtrW(window, -26, (class & !(0x20 | 0x40)) as isize);
            let current = GetWindowLongPtrW(window, -20);
            let desired = if enabled {
                current | 0x00080000 | 0x00000020
            } else {
                (current | 0x00080000) & !0x00000020
            };
            SetLastError(0);
            SetWindowLongPtrW(window, -20, desired);
            if GetLastError() != 0 {
                return Err("Windows could not restore widget mouse interaction.".into());
            }
            // Keep opacity at 100%; WS_EX_TRANSPARENT alone controls clicking.
            // Removing WS_EX_LAYERED lets the compositor paint square blur corners.
            if SetLayeredWindowAttributes(window, 0, 255, 2) == 0 {
                return Err(format!("Windows could not prepare the transparent widget surface (error={}, class={:x}, ex={:x}).",GetLastError(),GetClassLongPtrW(window,-26),GetWindowLongPtrW(window,-20)));
            }
            if (GetWindowLongPtrW(window, -20) & 0x20 != 0) != enabled {
                return Err("Windows did not apply widget mouse interaction.".into());
            }
            Ok(())
        }
    }
    pub fn rect(window: isize) -> Result<Rect, String> {
        unsafe {
            let mut r = WinRect {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            };
            if GetWindowRect(window, &mut r) == 0 {
                return Err("Widget position is unavailable.".into());
            }
            Ok(Rect {
                x: r.left,
                y: r.top,
                w: r.right - r.left,
                h: r.bottom - r.top,
            })
        }
    }
    #[cfg(test)]
    pub fn probe_state(window: isize) -> (isize, isize, isize, bool) {
        unsafe {
            (
                GetWindowLongPtrW(window, -16),
                GetWindowLongPtrW(window, -20),
                GetParent(window),
                IsWindowVisible(window) != 0,
            )
        }
    }
    pub fn cursor() -> Result<(i32, i32), String> {
        unsafe {
            let mut p = Point { x: 0, y: 0 };
            if GetCursorPos(&mut p) == 0 {
                return Err("Cursor position is unavailable.".into());
            }
            Ok((p.x, p.y))
        }
    }
    pub fn place(window: isize, rect: Rect) -> Result<(), String> {
        unsafe {
            let previous = self::rect(window).ok();
            let parent = GetParent(window);
            let mut p = Point {
                x: rect.x,
                y: rect.y,
            };
            if parent != 0 && GetWindowLongPtrW(window, -16) & 0x40000000 != 0 {
                ScreenToClient(parent, &mut p);
            }
            if SetWindowPos(window, 0, p.x, p.y, rect.w, rect.h, 0x0004 | 0x0010) == 0 {
                return Err("The widget could not be moved.".into());
            }
            if previous.is_none_or(|old| old.w != rect.w || old.h != rect.h) {
                rounded(window, rect.w, rect.h)?;
            }
            Ok(())
        }
    }

    #[cfg(test)]
    mod desktop_tests {
        use super::*;
        #[link(name = "user32")]
        extern "system" {
            fn CreateWindowExW(
                ex: u32,
                class: *const u16,
                name: *const u16,
                style: u32,
                x: i32,
                y: i32,
                w: i32,
                h: i32,
                parent: isize,
                menu: isize,
                instance: isize,
                param: *mut std::ffi::c_void,
            ) -> isize;
            fn GetWindowRgn(window: isize, region: isize) -> i32;
            fn DestroyWindow(window: isize) -> i32;
            fn SetThreadDpiAwarenessContext(context: isize) -> isize;
        }
        #[link(name = "gdi32")]
        extern "system" {
            fn PtInRegion(region: isize, x: i32, y: i32) -> i32;
        }
        struct Probe {
            window: isize,
            dpi: isize,
        }
        impl Drop for Probe {
            fn drop(&mut self) {
                unsafe {
                    if self.window != 0 {
                        DestroyWindow(self.window);
                    }
                    if self.dpi != 0 {
                        SetThreadDpiAwarenessContext(self.dpi);
                    }
                }
            }
        }
        #[test]
        #[ignore = "Requires a Windows desktop; creates an invisible native probe window"]
        fn desktop_host_round_trip() {
            unsafe {
                let dpi = SetThreadDpiAwarenessContext(-4);
                let window = CreateWindowExW(
                    0,
                    wide("STATIC").as_ptr(),
                    wide("TRP widget test probe").as_ptr(),
                    0x80cf0000,
                    40,
                    80,
                    200,
                    200,
                    0,
                    0,
                    0,
                    std::ptr::null_mut(),
                );
                let probe = Probe { window, dpi };
                assert_ne!(probe.window, 0, "Probe window creation failed");
                host(window, true).expect("Desktop hosting failed");
                assert_ne!(GetParent(window), 0);
                assert_eq!(
                    GetWindowLongPtrW(window, -16) & 0x00cf0000,
                    0,
                    "Desktop widget retained a native frame"
                );
                assert_ne!(
                    GetWindowLongPtrW(window, -20) & 0x08000000,
                    0,
                    "Widget must not activate Explorer"
                );
                let expected = clamp(Rect {
                    x: 40,
                    y: 80,
                    w: 400,
                    h: 300,
                });
                place(window, expected).unwrap();
                assert_eq!(rect(window).unwrap(), expected);
                let copy = CreateRoundRectRgn(0, 0, 1, 1, 0, 0);
                assert_ne!(copy, 0);
                let result = GetWindowRgn(window, copy);
                let corner = PtInRegion(copy, 0, 0);
                let center = PtInRegion(copy, expected.w / 2, expected.h / 2);
                DeleteObject(copy);
                assert_ne!(result, 0, "Native rounded clipping region is missing");
                assert_eq!(corner, 0, "Sharp outer corner must be clipped");
                assert_ne!(center, 0, "Widget center must remain visible");
                host(window, false).expect("Overlay restoration failed");
                assert_eq!(GetParent(window), 0);
                assert_eq!(
                    GetWindowLongPtrW(window, -16) & 0x00cf0000,
                    0,
                    "Overlay retained a native frame"
                );
                assert_eq!(GetWindowLongPtrW(window, -16) & 0x40000000, 0);
            }
        }
    }
    pub fn clamp(mut rect: Rect) -> Rect {
        unsafe {
            let x = GetSystemMetrics(76);
            let y = GetSystemMetrics(77);
            let w = GetSystemMetrics(78);
            let h = GetSystemMetrics(79);
            rect.x = rect.x.clamp(x, x + (w - rect.w).max(0));
            rect.y = rect.y.clamp(y, y + (h - rect.h).max(0));
            rect
        }
    }
}
fn handle(window: &WebviewWindow) -> Result<isize, String> {
    window
        .hwnd()
        .map(|h| h.0 as isize)
        .map_err(|e| e.to_string())
}
fn apply(app: &tauri::AppHandle, widget: &Widget) -> Result<(), String> {
    let owned_app = app.clone();
    let widget = widget.clone();
    let (send, receive) = std::sync::mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let _ = send.send(apply_on_main(&owned_app, &widget));
    })
    .map_err(|e| e.to_string())?;
    receive
        .recv()
        .map_err(|_| "The widget window could not be configured.".to_string())?
}
fn apply_on_main(app: &tauri::AppHandle, widget: &Widget) -> Result<(), String> {
    let label = format!("desktop-widget-{}", widget.kind);
    if !widget.enabled {
        if let Some(window) = app.get_webview_window(&label) {
            window.close().map_err(|e| e.to_string())?
        }
        return Ok(());
    }
    let existed = app.get_webview_window(&label).is_some();
    let window = if let Some(window) = app.get_webview_window(&label) {
        window
    } else {
        WebviewWindowBuilder::new(
            app,
            &label,
            WebviewUrl::App(format!("index.html?desktop-widget={}", widget.kind).into()),
        )
        .window_classname("TRPDesktopWidget")
        .title(format!("TRP · {}", widget.kind))
        .inner_size(UNIT * widget.width, UNIT * widget.height)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .background_color(tauri::window::Color(0, 0, 0, 0))
        .effects(
            tauri::window::EffectsBuilder::new()
                .effect(tauri::window::Effect::Acrylic)
                .color(tauri::window::Color(22, 22, 28, 95))
                .build(),
        )
        .build()
        .map_err(|e| e.to_string())?
    };
    let result = configure_window(&window, widget);
    if result.is_err() && !existed {
        let _ = window.destroy();
    }
    result
}
fn configure_window(window: &WebviewWindow, widget: &Widget) -> Result<(), String> {
    let hwnd = handle(&window)?;
    platform::corner_scale(hwnd, widget.size_multiplier)?;
    platform::visible(hwnd, false);
    // Configure native effects before restoring the requested desktop host.
    platform::guard(hwnd, false, false)?;
    platform::host(hwnd, false)?;
    window.set_focusable(false).map_err(|e| e.to_string())?;
    if widget.blur_level > 0 {
        window
            .set_effects(
                tauri::window::EffectsBuilder::new()
                    .effect(if widget.blur_level == 1 {
                        tauri::window::Effect::Blur
                    } else {
                        tauri::window::Effect::Acrylic
                    })
                    .color(tauri::window::Color(
                        22,
                        22,
                        28,
                        (widget.tint * 128.0) as u8,
                    ))
                    .build(),
            )
            .map_err(|e| e.to_string())?;
    } else {
        window
            .set_effects(None::<tauri::utils::config::WindowEffectsConfig>)
            .map_err(|e| e.to_string())?;
    }
    let scale = window.scale_factor().unwrap_or(1.0);
    let index = KINDS.iter().position(|k| *k == widget.kind).unwrap_or(0) as i32;
    let rect = platform::clamp(Rect {
        x: widget.x.unwrap_or(40 + index * 220),
        y: widget.y.unwrap_or(80),
        w: (UNIT * widget.width * widget.size_multiplier * scale).round() as i32,
        h: (UNIT * widget.height * widget.size_multiplier * scale).round() as i32,
    });
    let rect = if let Some(anchor) = &widget.anchor {
        let (_, target, _) = platform::target(anchor).ok_or(
            "The selected app window is no longer available. Choose another window in Settings.",
        )?;
        corner_rect(
            target,
            rect.w,
            rect.h,
            &anchor.corner,
            (12.0 * scale) as i32,
        )
    } else {
        rect
    };
    // All Tauri setters must finish on the UI thread before native hosting.
    // They otherwise rewrite WS_CHILD/caption styles after SetParent.
    window.show().map_err(|e| e.to_string())?;
    // Prepare the window clip before restoring the requested host.
    platform::rounded(hwnd, rect.w, rect.h)?;
    platform::guard(hwnd, widget.mode == "desktop", false)?;
    platform::host(hwnd, widget.mode == "desktop")?;
    platform::place(hwnd, rect)?;
    platform::rounded(hwnd, rect.w, rect.h)?;
    // Update only the native mouse styles; a Tauri setter rebuilds the whole
    // style mask and can detach this window from Explorer's coordinate space.
    platform::click_through(hwnd, false)?;
    platform::visible(hwnd, true);
    if let Some(anchor) = &widget.anchor {
        if let Some((target, _, visible)) = platform::target(anchor) {
            platform::untop(hwnd);
            platform::follow_order(hwnd, target);
            platform::visible(hwnd, visible);
        }
    }
    Ok(())
}

fn enabled_widgets(pack: &Pack) -> Vec<Widget> {
    if pack.installed {
        pack.widgets.iter().filter(|w| w.enabled).cloned().collect()
    } else {
        Vec::new()
    }
}
pub async fn restore(app: tauri::AppHandle) {
    // Window shutdown is not a preference change. Only widgets_set/install
    // persist enable/disable choices; restore reads them again on every retry.
    for attempt in 0..3 {
        let state = app.state::<Widgets>();
        let Ok(pack) = read(&app, &state) else { return };
        let mut failed = false;
        for widget in enabled_widgets(&pack) {
            if app
                .get_webview_window(&format!("desktop-widget-{}", widget.kind))
                .is_some()
            {
                continue;
            }
            if let Err(error) = apply(&app, &widget) {
                failed = true;
                eprintln!("Widget {} restoration: {}", widget.kind, error);
            }
        }
        if !failed {
            return;
        }
        if attempt < 2 {
            let delay = Duration::from_millis(500 * (attempt + 1));
            let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(delay)).await;
        }
    }
}
pub fn has_open(app: &tauri::AppHandle) -> bool {
    app.webview_windows()
        .keys()
        .any(|label| label.starts_with("desktop-widget-"))
}
#[tauri::command]
pub fn widgets_state(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<Widgets>,
) -> Result<Pack, String> {
    if window.label() != "main" {
        kind(&window)?;
    }
    read(&app, &state)
}
#[tauri::command]
pub async fn widgets_install(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<'_, Widgets>,
    enabled: bool,
) -> Result<Pack, String> {
    main_only(&window)?;
    let mut pack = read(&app, &state)?;
    pack.installed = enabled;
    if !enabled {
        for widget in &mut pack.widgets {
            widget.enabled = false;
            apply(&app, widget)?
        }
    }
    save(&app, &state, pack.clone())?;
    Ok(pack)
}
#[tauri::command]
pub fn widgets_snap(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<Widgets>,
    enabled: bool,
) -> Result<Pack, String> {
    main_only(&window)?;
    let mut pack = read(&app, &state)?;
    pack.snap = enabled;
    save(&app, &state, pack.clone())?;
    Ok(pack)
}
#[derive(Clone, Deserialize)]
pub struct SharedSettings {
    locked: bool,
    size_multiplier: f64,
    blur_level: u8,
    tint: f64,
}
fn apply_preferences(pack: &mut Pack, settings: &SharedSettings) -> Result<(), String> {
    for widget in &mut pack.widgets {
        widget.locked = settings.locked;
        widget.size_multiplier = settings.size_multiplier;
        widget.blur_level = settings.blur_level;
        widget.blur = settings.blur_level > 0;
        widget.tint = settings.tint;
        validate(widget)?;
    }
    Ok(())
}
#[tauri::command]
pub async fn widgets_preferences(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<'_, Widgets>,
    settings: SharedSettings,
) -> Result<Pack, String> {
    main_only(&window)?;
    let old = read(&app, &state)?;
    let mut next = old.clone();
    apply_preferences(&mut next, &settings)?;
    state
        .drags
        .lock()
        .map_err(|_| "Widget movement is busy")?
        .clear();
    for widget in next.widgets.iter().filter(|w| next.installed && w.enabled) {
        if let Err(error) = apply(&app, widget) {
            for original in old.widgets.iter().filter(|w| old.installed && w.enabled) {
                let _ = apply(&app, original);
            }
            return Err(error);
        }
    }
    if let Err(error) = save(&app, &state, next.clone()) {
        for original in old.widgets.iter().filter(|w| old.installed && w.enabled) {
            let _ = apply(&app, original);
        }
        return Err(error);
    }
    Ok(next)
}
#[tauri::command]
pub async fn widgets_set(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<'_, Widgets>,
    mut widget: Widget,
) -> Result<Pack, String> {
    validate(&widget)?;
    own(&window, &widget.kind)?;
    let old = read(&app, &state)?;
    if !old.installed {
        return Err("Enable Desktop Widgets first.".into());
    }
    widget.locked = old.widgets[0].locked;
    widget.size_multiplier = old.widgets[0].size_multiplier;
    widget.blur_level = old.widgets[0].blur_level;
    widget.tint = old.widgets[0].tint;
    widget.blur = widget.blur_level > 0;
    let mut next = old.clone();
    if window.label() != "main"
        && old
            .widgets
            .iter()
            .any(|w| w.kind == widget.kind && w.locked)
    {
        return Err("Unlock this widget in Settings first.".into());
    }
    if let Some(anchor) = &widget.anchor {
        if platform::target(anchor).is_none() {
            return Err("The selected window has closed. Choose another window.".into());
        }
    }
    let row = next
        .widgets
        .iter_mut()
        .find(|row| row.kind == widget.kind)
        .unwrap();
    widget.x = row.x;
    widget.y = row.y;
    if row.anchor.is_some() && widget.anchor.is_none() {
        if let Some(open) = app.get_webview_window(&format!("desktop-widget-{}", widget.kind)) {
            if let Ok(rect) = handle(&open).and_then(platform::rect) {
                widget.x = Some(rect.x);
                widget.y = Some(rect.y);
            }
        }
    }
    *row = widget.clone();
    save(&app, &state, next.clone())?;
    if let Err(error) = apply(&app, &widget) {
        let _ = save(&app, &state, old);
        return Err(error);
    }
    Ok(next)
}
#[tauri::command]
pub fn widgets_open_main(
    app: tauri::AppHandle,
    window: WebviewWindow,
    settings: Option<bool>,
) -> Result<(), String> {
    kind(&window)?;
    if let Some(main) = app.get_webview_window("main") {
        main.show().map_err(|e| e.to_string())?;
        main.set_focus().map_err(|e| e.to_string())?;
        if settings == Some(true) {
            let _ = main.emit("widgets-open-settings", ());
        }
    }
    Ok(())
}
#[tauri::command]
pub fn widgets_drag(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<Widgets>,
    action: String,
) -> Result<(), String> {
    let kind = kind(&window)?;
    let pack = read(&app, &state)?;
    if !pack.installed || !pack.widgets.iter().any(|w| w.kind == kind && w.enabled) {
        return Err("Widget is disabled.".into());
    }
    let config = pack.widgets.iter().find(|w| w.kind == kind).unwrap();
    if config.locked && action != "cancel" {
        return Err("Unlock this widget in Settings before moving or resizing it.".into());
    }
    if config.anchor.is_some() && action == "start_move" {
        return Err("Unpin this widget in Settings to move it freely.".into());
    }
    let hwnd = handle(&window)?;
    let mut drags = state.drags.lock().map_err(|_| "Widget is busy")?;
    if ["start_move", "start_resize"].contains(&action.as_str()) {
        drags.insert(
            kind,
            Drag {
                rect: platform::rect(hwnd)?,
                cursor: platform::cursor()?,
                resize: action == "start_resize",
            },
        );
        return Ok(());
    }
    let Some(drag) = drags.get(&kind).copied() else {
        return Ok(());
    };
    if action == "cancel" {
        platform::place(hwnd, drag.rect)?;
        drags.remove(&kind);
        return Ok(());
    }
    if !["move", "end"].contains(&action.as_str()) {
        return Err("Unknown widget drag action.".into());
    }
    let cursor = platform::cursor()?;
    let (dx, dy) = (cursor.0 - drag.cursor.0, cursor.1 - drag.cursor.1);
    let scale = window.scale_factor().unwrap_or(1.0) * config.size_multiplier;
    let mut rect = drag.rect;
    if drag.resize {
        rect.w = resize_extent(drag.rect.w, dx, scale, action == "end");
        rect.h = resize_extent(drag.rect.h, dy, scale, action == "end");
    } else {
        rect.x += dx;
        rect.y += dy;
        if pack.snap {
            let others: Vec<_> = app
                .webview_windows()
                .into_iter()
                .filter(|(label, _)| {
                    label.starts_with("desktop-widget-") && *label != window.label()
                })
                .filter_map(|(_, w)| handle(&w).ok().and_then(|h| platform::rect(h).ok()))
                .collect();
            rect = snap(
                rect,
                &others,
                (12.0 * scale).round() as i32,
                (16.0 * scale).round() as i32,
            );
        }
    }
    rect = platform::clamp(rect);
    platform::place(hwnd, rect)?;
    if action == "end" {
        drags.remove(&kind);
        drop(drags);
        let mut pack = read(&app, &state)?;
        let row = pack.widgets.iter_mut().find(|w| w.kind == kind).unwrap();
        row.x = Some(rect.x);
        row.y = Some(rect.y);
        row.width = (rect.w as f64 / (UNIT * scale) * 2.0).round() / 2.0;
        row.height = (rect.h as f64 / (UNIT * scale) * 2.0).round() / 2.0;
        save(&app, &state, pack)?;
    }
    Ok(())
}
fn resize_extent(original: i32, delta: i32, scale: f64, finish: bool) -> i32 {
    let units = ((original + delta) as f64 / (UNIT * scale)).clamp(1.0, 3.0);
    let units = if finish {
        (units * 2.0).round() / 2.0
    } else {
        units
    };
    (units * UNIT * scale).round() as i32
}
fn online_rows(value: Value) -> Result<Value, String> {
    if !value["players"].is_array() || !value["count"].is_u64() {
        return Err("Online player data is unavailable.".into());
    }
    Ok(value["players"].clone())
}
async fn fetch(
    client: &reqwest::Client,
    endpoint: &str,
    names: Option<Vec<&str>>,
) -> Result<Value, String> {
    let url = format!("https://api.earthmc.net/v4{}", endpoint);
    let request = if let Some(names) = names {
        client.post(url).json(&json!({"query":names}))
    } else {
        client.get(url)
    };
    let value: Value = request
        .header("User-Agent", "TheRecordsProject-Widgets")
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|_| "EarthMC could not be reached.".to_string())?
        .error_for_status()
        .map_err(|_| "EarthMC is temporarily unavailable.".to_string())?
        .json()
        .await
        .map_err(|_| "EarthMC returned an invalid response.".to_string())?;
    if endpoint == "/online" {
        online_rows(value)
    } else {
        Ok(value)
    }
}

#[tauri::command]
pub async fn widgets_data(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<'_, Widgets>,
    refresh: bool,
) -> Result<Value, String> {
    let kind = kind(&window)?;
    let pack = read(&app, &state)?;
    if !pack.installed || !pack.widgets.iter().any(|w| w.kind == kind && w.enabled) {
        return Err("Widget is disabled.".into());
    }
    let signature = pack
        .widgets
        .iter()
        .filter(|w| w.enabled)
        .map(|w| w.kind.clone())
        .collect::<Vec<_>>()
        .join(",");
    let mut cache = state.data.lock().await;
    if !refresh {
        if let Some((time, key, data)) = &*cache {
            if key == &signature && time.elapsed() < Duration::from_secs(45) {
                return Ok(data.clone());
            }
        }
    }
    let vote = pack
        .widgets
        .iter()
        .any(|w| w.kind == "voteparty" && w.enabled);
    let nation = pack
        .widgets
        .iter()
        .any(|w| ["balance", "online"].contains(&w.kind.as_str()) && w.enabled);
    let online = pack.widgets.iter().any(|w| w.kind == "online" && w.enabled);
    let mut data = json!({"remaining":null,"target":null,"balance":null,"players":[],"errors":{}});
    if vote {
        match fetch(&state.client, "/", None).await {
            Ok(value) => {
                data["remaining"] = value["voteParty"]["numRemaining"].clone();
                data["target"] = value["voteParty"]["target"].clone();
                if !data["remaining"].is_u64() {
                    data["errors"]["voteparty"] = json!("VoteParty data is unavailable.");
                }
            }
            Err(error) => data["errors"]["voteparty"] = json!(error),
        }
    }
    if nation {
        match fetch(&state.client, "/nations", Some(vec!["Byzantium"])).await {
            Ok(value) => {
                if let Some(n) = value.as_array().and_then(|rows| {
                    rows.iter().find(|row| {
                        row["name"]
                            .as_str()
                            .is_some_and(|name| name.eq_ignore_ascii_case("Byzantium"))
                    })
                }) {
                    data["balance"] = n["stats"]["balance"].clone();
                    if data["balance"]
                        .as_f64()
                        .is_none_or(|v| !v.is_finite() || v < 0.0)
                    {
                        data["errors"]["balance"] = json!("Nation balance is unavailable.");
                    }
                    if online {
                        match fetch(&state.client, "/online", None).await {
                            Ok(people) => {
                                if let (Some(members), Some(people)) =
                                    (n["residents"].as_array(), people.as_array())
                                {
                                    let ids: std::collections::HashSet<_> = members
                                        .iter()
                                        .filter_map(|p| p["uuid"].as_str())
                                        .map(|id| id.to_lowercase().replace('-', ""))
                                        .collect();
                                    let mut players = people
                                        .iter()
                                        .filter(|p| {
                                            p["uuid"].as_str().is_some_and(|id| {
                                                ids.contains(&id.to_lowercase().replace('-', ""))
                                            })
                                        })
                                        .map(|p| json!({"name":p["name"],"uuid":p["uuid"]}))
                                        .collect::<Vec<_>>();
                                    players.sort_by(|a, b| {
                                        a["name"]
                                            .as_str()
                                            .unwrap_or("")
                                            .to_lowercase()
                                            .cmp(&b["name"].as_str().unwrap_or("").to_lowercase())
                                    });
                                    data["players"] = json!(players);
                                } else {
                                    data["errors"]["online"] =
                                        json!("Online player data is unavailable.");
                                }
                            }
                            Err(error) => data["errors"]["online"] = json!(error),
                        }
                    }
                } else {
                    data["errors"]["balance"] = json!("Byzantium is unavailable.");
                    data["errors"]["online"] = json!("Byzantium is unavailable.");
                }
            }
            Err(error) => {
                data["errors"]["balance"] = json!(error.clone());
                data["errors"]["online"] = json!(error)
            }
        }
    }
    data["checkedAt"] = json!(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64);
    *cache = Some((Instant::now(), signature, data.clone()));
    Ok(data)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "Runs an isolated WebView2 event loop through delayed native frame changes"]
    fn tauri_widget_frame_survives_lock_and_mode_changes() {
        let data = tempfile::tempdir().unwrap();
        let mut context = tauri::generate_context!();
        context.config_mut().app.windows.clear();
        let blank = data.path().join("blank-webview");
        let result = std::sync::Arc::new(Mutex::new(None));
        let captured = result.clone();
        let app = tauri::Builder::default()
            .any_thread()
            .setup(move |app| {
                let window = WebviewWindowBuilder::new(
                    app,
                    "native-widget-probe",
                    WebviewUrl::External("about:blank".parse().unwrap()),
                )
                .window_classname("TRPDesktopWidget")
                .title("TRP isolated widget test")
                .inner_size(200.0, 200.0)
                .decorations(false)
                .shadow(false)
                .transparent(true)
                .resizable(false)
                .skip_taskbar(true)
                .focused(false)
                .visible(false)
                .data_directory(blank)
                .build()?;
                let app = app.handle().clone();
                std::thread::spawn(move || {
                    let checked = (|| -> Result<(), String> {
                        for (mode, blur, locked) in [
                            ("desktop", true, false),
                            ("desktop", false, true),
                            ("desktop", false, false),
                            ("overlay", true, false),
                            ("desktop", true, false),
                        ] {
                            let mut widget = Pack::default().widgets[0].clone();
                            widget.enabled = true;
                            widget.mode = mode.into();
                            widget.blur = blur;
                            widget.locked = locked;
                            let (send, receive) = std::sync::mpsc::sync_channel(1);
                            let w = window.clone();
                            app.run_on_main_thread(move || {
                                let step = (|| -> Result<(), String> {
                                    configure_window(&w, &widget)?;
                                    // Force framework style rewrites after setup, as happens on focus/visibility changes.
                                    w.set_resizable(true).map_err(|e| e.to_string())?;
                                    w.set_resizable(false).map_err(|e| e.to_string())?;
                                    w.hide().map_err(|e| e.to_string())?;
                                    w.show().map_err(|e| e.to_string())?;
                                    Ok(())
                                })();
                                let _ = send.send(step);
                            })
                            .map_err(|e| e.to_string())?;
                            receive
                                .recv_timeout(Duration::from_secs(10))
                                .map_err(|e| e.to_string())??;
                            std::thread::sleep(Duration::from_millis(150));
                            let (send, receive) = std::sync::mpsc::sync_channel(1);
                            let w = window.clone();
                            app.run_on_main_thread(move || {
                                let step = (|| -> Result<(), String> {
                                    let hwnd = handle(&w)?;
                                    let (style, ex, parent, visible) = platform::probe_state(hwnd);
                                    if style & 0x00cf0000 != 0 {
                                        return Err(
                                            "Native caption returned after queued events".into()
                                        );
                                    }
                                    if (style & 0x40000000 != 0) != (mode == "desktop")
                                        || (parent != 0) != (mode == "desktop")
                                    {
                                        return Err(
                                            "Desktop host changed after queued events".into()
                                        );
                                    }
                                    if ex & 0x08000000 == 0 || (ex & 0x20 != 0) != false {
                                        return Err(
                                            "Mouse interaction changed after queued events".into(),
                                        );
                                    }
                                    if ex & 0x00080000 == 0 {
                                        return Err(
                                            "Widget lost its layered clipping surface".into()
                                        );
                                    }
                                    let rect = platform::rect(hwnd)?;
                                    if platform::client_size(hwnd) != (rect.w, rect.h) {
                                        return Err(
                                            "A native frame is consuming widget space".into()
                                        );
                                    }
                                    if !visible {
                                        return Err("Widget disappeared after queued events".into());
                                    }
                                    platform::place(
                                        hwnd,
                                        Rect {
                                            x: rect.x + 30,
                                            y: rect.y + 20,
                                            ..rect
                                        },
                                    )?;
                                    Ok(())
                                })();
                                let _ = send.send(step);
                            })
                            .map_err(|e| e.to_string())?;
                            receive
                                .recv_timeout(Duration::from_secs(10))
                                .map_err(|e| e.to_string())??;
                        }
                        Ok(())
                    })();
                    *captured.lock().unwrap() = Some(checked);
                    app.exit(0);
                });
                Ok(())
            })
            .build(context)
            .expect("Isolated Tauri test could not start");
        app.run_return(|_, _| {});
        result
            .lock()
            .unwrap()
            .take()
            .expect("Widget test did not finish")
            .unwrap();
    }
    #[test]
    fn resize_is_continuous_until_release_and_clamped_to_the_grid() {
        assert_eq!(resize_extent(200, 37, 1.0, false), 237);
        assert_eq!(resize_extent(200, 37, 1.0, true), 200);
        assert_eq!(resize_extent(200, 68, 1.0, true), 300);
        assert_eq!(resize_extent(300, 102, 1.5, true), 450);
        assert_eq!(resize_extent(200, -1000, 1.0, false), 200);
        assert_eq!(resize_extent(200, 1000, 1.0, true), 600);
    }
    #[test]
    fn grid_bounds() {
        for w in [1.0, 1.5, 2.0, 2.5, 3.0] {
            for h in [1.0, 1.5, 2.0, 2.5, 3.0] {
                let mut widget = Pack::default().widgets[0].clone();
                widget.width = w;
                widget.height = h;
                assert!(validate(&widget).is_ok());
            }
        }
        for value in [0.5, 0.0, 3.5, 1.2, f64::NAN, f64::INFINITY] {
            assert!(!units(value));
        }
    }
    #[test]
    fn padded_snapping() {
        let other = Rect {
            x: 300,
            y: 100,
            w: 200,
            h: 200,
        };
        let moved = Rect {
            x: 85,
            y: 104,
            w: 200,
            h: 200,
        };
        let result = snap(moved, &[other], 12, 16);
        assert_eq!(result.x, 88);
        assert_eq!(result.y, 100);
        assert_eq!(other.x - (result.x + result.w), 12);
    }
    #[test]
    fn vertical_snapping_preserves_padding_without_magnetizing_overlaps() {
        let other = Rect {
            x: 300,
            y: 100,
            w: 200,
            h: 200,
        };
        let result = snap(
            Rect {
                x: 304,
                y: 313,
                w: 200,
                h: 200,
            },
            &[other],
            12,
            16,
        );
        assert_eq!(
            result,
            Rect {
                x: 300,
                y: 312,
                w: 200,
                h: 200
            }
        );
        let overlap = Rect {
            x: 305,
            y: 104,
            w: 200,
            h: 200,
        };
        assert_eq!(snap(overlap, &[other], 12, 16), overlap);
    }
    #[test]
    fn no_distant_snapping() {
        let rect = Rect {
            x: 85,
            y: 1000,
            w: 200,
            h: 200,
        };
        assert_eq!(
            snap(
                rect,
                &[Rect {
                    x: 300,
                    y: 100,
                    w: 200,
                    h: 200
                }],
                12,
                16
            ),
            rect
        );
    }
    #[test]
    #[ignore = "Read-only live EarthMC widget data check"]
    fn live_widget_data() {
        tauri::async_runtime::block_on(async {
            let client = reqwest::Client::new();
            let nation = fetch(&client, "/nations", Some(vec!["Byzantium"]))
                .await
                .expect("Native EarthMC nation request failed");
            let nation = nation
                .as_array()
                .unwrap()
                .iter()
                .find(|n| {
                    n["name"]
                        .as_str()
                        .is_some_and(|name| name.eq_ignore_ascii_case("Byzantium"))
                })
                .unwrap();
            assert!(nation["stats"]["balance"]
                .as_f64()
                .is_some_and(|v| v.is_finite() && v >= 0.0));
            assert!(nation["residents"].is_array());
            let online = fetch(&client, "/online", None)
                .await
                .expect("Native EarthMC online request failed");
            assert!(online.is_array());
            let server = fetch(&client, "/", None)
                .await
                .expect("Native EarthMC VoteParty request failed");
            assert!(server["voteParty"]["numRemaining"].is_u64());
        });
    }
    #[test]
    fn online_envelope_is_not_treated_as_an_empty_player_list() {
        assert_eq!(
            online_rows(json!({"count":1,"players":[{"name":"Player","uuid":"abcd"}]}))
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert!(online_rows(json!({"count":1,"players":null})).is_err());
        assert!(online_rows(json!([])).is_err());
    }
    #[test]
    fn existing_pack_keeps_safe_interactive_defaults() {
        let widget: Widget = serde_json::from_value(json!({"kind":"online","enabled":true,"mode":"desktop","width":1.5,"height":2,"x":40,"y":80})).unwrap();
        assert!(!widget.locked);
        assert!(widget.blur);
        assert!(!widget.auto_scroll);
        assert!(widget.anchor.is_none());
        assert!(validate(&widget).is_ok());
    }
    #[test]
    fn corners_follow_target_moves_and_resizes() {
        let first = Rect {
            x: 100,
            y: 80,
            w: 1000,
            h: 800,
        };
        for (corner, x, y) in [
            ("top-left", 112, 92),
            ("top-right", 888, 92),
            ("bottom-left", 112, 568),
            ("bottom-right", 888, 568),
        ] {
            let start = corner_rect(first, 200, 300, corner, 12);
            assert_eq!(
                start,
                Rect {
                    x,
                    y,
                    w: 200,
                    h: 300
                }
            );
            let moved = corner_rect(
                Rect {
                    x: -200,
                    y: 180,
                    w: 1200,
                    h: 900,
                },
                200,
                300,
                corner,
                12,
            );
            assert_eq!(
                moved.x,
                start.x - 300 + if corner.ends_with("right") { 200 } else { 0 }
            );
            assert_eq!(
                moved.y,
                start.y + 100 + if corner.starts_with("bottom") { 100 } else { 0 }
            );
        }
    }
    #[test]
    fn pack_starts_disabled() {
        let pack = Pack::default();
        assert!(!pack.installed);
        assert!(pack.widgets.iter().all(|w| !w.enabled));
        assert_eq!(pack.widgets.len(), 3);
    }
}

fn corner_rect(target: Rect, w: i32, h: i32, corner: &str, gap: i32) -> Rect {
    Rect {
        x: if corner.ends_with("right") {
            target.x + target.w - w - gap
        } else {
            target.x + gap
        },
        y: if corner.starts_with("bottom") {
            target.y + target.h - h - gap
        } else {
            target.y + gap
        },
        w,
        h,
    }
}
#[tauri::command]
pub fn widgets_windows(window: WebviewWindow) -> Result<Vec<WindowChoice>, String> {
    main_only(&window)?;
    Ok(platform::windows())
}
pub fn start_following(app: tauri::AppHandle) {
    use std::sync::atomic::Ordering;
    if app
        .state::<Widgets>()
        .following
        .swap(true, Ordering::Relaxed)
    {
        return;
    }
    std::thread::spawn(move || {
        while app.get_webview_window("main").is_some() {
            let active = read(&app, &app.state::<Widgets>()).is_ok_and(|p| {
                p.installed && p.widgets.iter().any(|w| w.enabled && w.anchor.is_some())
            });
            if active {
                follow_tick(&app);
            }
            std::thread::sleep(Duration::from_millis(if active { 60 } else { 1000 }));
        }
    });
}
fn follow_tick(app: &tauri::AppHandle) {
    let state = app.state::<Widgets>();
    let Ok(pack) = read(app, &state) else { return };
    if !pack.installed {
        return;
    }
    for widget in pack
        .widgets
        .iter()
        .filter(|w| w.enabled && w.anchor.is_some())
    {
        let anchor = widget.anchor.as_ref().unwrap();
        let target = platform::target(anchor);
        if target.is_none() {
            if let Ok(mut fresh) = read(app, &state) {
                if let Some(row) = fresh.widgets.iter_mut().find(|w| w.kind == widget.kind) {
                    if let Some(open) =
                        app.get_webview_window(&format!("desktop-widget-{}", widget.kind))
                    {
                        if let Ok(rect) = handle(&open).and_then(platform::rect) {
                            row.x = Some(rect.x);
                            row.y = Some(rect.y);
                        }
                    }
                    row.anchor = None;
                    let config = row.clone();
                    let _ = save(app, &state, fresh);
                    let _ = apply(app, &config);
                }
            }
            continue;
        }
        let Some(window) = app.get_webview_window(&format!("desktop-widget-{}", widget.kind))
        else {
            continue;
        };
        let Ok(hwnd) = handle(&window) else { continue };
        let (target, target_rect, visible) = target.unwrap();
        platform::visible(hwnd, visible);
        if !visible {
            continue;
        }
        if state
            .drags
            .lock()
            .map(|drags| drags.contains_key(&widget.kind))
            .unwrap_or(true)
        {
            continue;
        }
        if let Ok(current) = platform::rect(hwnd) {
            let scale = window.scale_factor().unwrap_or(1.0);
            let desired = corner_rect(
                target_rect,
                current.w,
                current.h,
                &anchor.corner,
                (12.0 * scale) as i32,
            );
            if current != desired {
                let _ = platform::place(hwnd, desired);
            }
            platform::follow_order(hwnd, target);
        }
    }
}

#[cfg(test)]
mod shared_preferences_tests {
    use super::*;
    #[test]
    fn shared_settings_preserve_placement_and_apply_to_disabled_widgets() {
        let mut pack = Pack::default();
        pack.widgets[1].mode = "overlay".into();
        pack.widgets[1].x = Some(123);
        pack.widgets[1].width = 2.0;
        apply_preferences(
            &mut pack,
            &SharedSettings {
                locked: true,
                size_multiplier: 0.5,
                blur_level: 0,
                tint: 0.3,
            },
        )
        .unwrap();
        for w in &pack.widgets {
            assert!(w.locked);
            assert_eq!(w.size_multiplier, 0.5);
            assert_eq!(w.blur_level, 0);
            assert_eq!(w.tint, 0.3);
            assert!(!w.enabled);
        }
        assert_eq!(pack.widgets[1].x, Some(123));
        assert_eq!(pack.widgets[1].width, 2.0);
        assert_eq!(pack.widgets[1].mode, "overlay");
        assert_eq!(resize_extent(100, 50, 0.5, true), 150);
    }
    #[test]
    fn invalid_shared_preferences_are_rejected() {
        for (size, blur, tint) in [
            (0.1, 1, 0.5),
            (f64::NAN, 1, 0.5),
            (1.0, 3, 0.5),
            (1.0, 1, 1.1),
            (1.0, 1, f64::INFINITY),
        ] {
            assert!(apply_preferences(
                &mut Pack::default(),
                &SharedSettings {
                    locked: false,
                    size_multiplier: size,
                    blur_level: blur,
                    tint
                }
            )
            .is_err());
        }
    }
    #[test]
    fn legacy_widget_settings_load_with_defaults() {
        let mut json = serde_json::to_value(Pack::default()).unwrap();
        for row in json["widgets"].as_array_mut().unwrap() {
            for key in ["size_multiplier", "blur_level", "tint"] {
                row.as_object_mut().unwrap().remove(key);
            }
        }
        let pack: Pack = serde_json::from_value(json).unwrap();
        assert_eq!(pack.widgets[0].size_multiplier, 1.0);
        assert_eq!(pack.widgets[0].blur_level, 1);
        assert_eq!(pack.widgets[0].tint, 0.75);
    }
}

#[cfg(test)]
mod corner_scale_tests {
    use super::*;
    #[test]
    fn corners_match_css_at_every_widget_and_monitor_scale() {
        for multiplier in [0.5, 0.75, 1.0, 1.5] {
            for dpi in [1.0, 1.25, 1.5, 2.0] {
                assert_eq!(
                    corner_diameter(dpi, multiplier, 1200, 1200),
                    (2.0 * 20.0 * dpi * multiplier).round() as i32
                );
            }
        }
        assert_eq!(corner_diameter(2.0, 1.5, 30, 20), 20);
    }
}

#[cfg(test)]
mod restore_preferences_tests {
    use super::*;
    #[test]
    fn restoring_windows_keeps_saved_enable_and_placement_choices() {
        let mut pack = Pack::default();
        pack.installed = true;
        pack.widgets[0].enabled = true;
        pack.widgets[0].x = Some(321);
        pack.widgets[1].enabled = true;
        let saved = serde_json::to_string(&pack).unwrap();
        let selected = enabled_widgets(&pack);
        assert_eq!(selected.len(), 2);
        assert_eq!(selected[0].x, Some(321));
        assert_eq!(serde_json::to_string(&pack).unwrap(), saved);
        let restored: Pack = serde_json::from_str(&saved).unwrap();
        assert_eq!(enabled_widgets(&restored).len(), 2);
        pack.installed = false;
        assert!(enabled_widgets(&pack).is_empty());
    }
}
