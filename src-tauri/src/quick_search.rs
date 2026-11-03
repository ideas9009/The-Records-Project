use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
#[derive(Default)]
pub struct QuickSearchState {
    opening: tauri::async_runtime::Mutex<()>,
    registered: AtomicBool,
}
pub async fn open(app: tauri::AppHandle) -> Result<(), String> {
    open_mode(app, false, true).await
}
async fn open_mode(app: tauri::AppHandle, ai: bool, activate: bool) -> Result<(), String> {
    let label = if ai {
        "rhomaion-prompt"
    } else {
        "quick-search"
    };
    if activate {
        if let Some(other) = app.get_webview_window(if ai {
            "quick-search"
        } else {
            "rhomaion-prompt"
        }) {
            let _ = other.hide();
        }
    }
    let state = app.state::<QuickSearchState>();
    let _lock = state.opening.lock().await;
    if let Some(window) = app.get_webview_window(label) {
        if !activate {
            return Ok(());
        }
        if !ai {
            layout(&window, false, false, false)?;
        }
        window
            .emit("quick-search-reset", ())
            .map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let window = WebviewWindowBuilder::new(
        &app,
        label,
        WebviewUrl::App(
            if ai {
                "index.html?rhomaion-prompt=1"
            } else {
                "index.html?quick-search=1"
            }
            .into(),
        ),
    )
    .title(if ai {
        "TRP · Rhōmaíōn AI"
    } else {
        "TRP · Quick Search"
    })
    .inner_size(680.0, 260.0)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .resizable(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false)
    .focused(false)
    .background_color(tauri::window::Color(0, 0, 0, 0))
    .build()
    .map_err(|e| e.to_string())?;
    window
        .set_effects(
            tauri::window::EffectsBuilder::new()
                .effect(tauri::window::Effect::Blur)
                .color(tauri::window::Color(22, 22, 28, 96))
                .build(),
        )
        .map_err(|e| e.to_string())?;
    layout(&window, false, false, false)?;
    if !activate {
        return Ok(());
    }
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn quick_search_prepare_ai(
    app: tauri::AppHandle,
    window: WebviewWindow,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Prepare Rhōmaíōn from the main app.".into());
    }
    // Load the authenticated UI in a hidden, reusable webview. No AI completion is sent.
    open_mode(app, true, false).await
}
fn search_only(window: &WebviewWindow) -> Result<(), String> {
    if !["quick-search", "rhomaion-prompt"].contains(&window.label()) {
        return Err("This action belongs to Quick Search.".into());
    }
    Ok(())
}
fn layout(
    window: &WebviewWindow,
    expanded: bool,
    results: bool,
    preview: bool,
) -> Result<(), String> {
    let monitor = window.current_monitor().map_err(|e| e.to_string())?;
    let (max_width, max_height) = monitor
        .map(|m| {
            (
                m.size().width as f64 / m.scale_factor() - 32.0,
                m.size().height as f64 / m.scale_factor() - 72.0,
            )
        })
        .unwrap_or((680.0, 640.0));
    let width = max_width.clamp(280.0, if preview { 1040.0 } else { 680.0 });
    let height = (if expanded {
        640.0_f64
    } else if results {
        480.0
    } else {
        260.0
    })
    .min(max_height.max(160.0));
    window
        .set_size(tauri::LogicalSize::new(width, height))
        .map_err(|e| e.to_string())?;
    window.center().map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn quick_search_open(app: tauri::AppHandle, window: WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Open Quick Search from the main app.".into());
    }
    open(app).await
}
#[tauri::command]
pub fn quick_search_layout(
    window: WebviewWindow,
    expanded: bool,
    results: bool,
    preview: Option<bool>,
) -> Result<(), String> {
    if window.label() != "rhomaion-ai" {
        search_only(&window)?;
    }
    layout(&window, expanded, results, preview.unwrap_or(false))
}
#[tauri::command]
pub fn quick_search_close(window: WebviewWindow) -> Result<(), String> {
    search_only(&window)?;
    window.hide().map_err(|e| e.to_string())
}
#[tauri::command]
pub fn quick_search_show_main(app: tauri::AppHandle, window: WebviewWindow) -> Result<(), String> {
    search_only(&window)?;
    window.hide().map_err(|e| e.to_string())?;
    if let Some(main) = app.get_webview_window("main") {
        main.show().map_err(|e| e.to_string())?;
        main.unminimize().map_err(|e| e.to_string())?;
        main.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
pub fn quick_search_shortcut_status(
    window: WebviewWindow,
    state: State<QuickSearchState>,
) -> Result<bool, String> {
    if !["main", "quick-search", "rhomaion-prompt"].contains(&window.label()) {
        return Err("Unavailable window.".into());
    }
    Ok(state.registered.load(Ordering::Relaxed))
}
#[cfg(windows)]
pub fn register(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        #[repr(C)]
        struct Point {
            x: i32,
            y: i32,
        }
        #[repr(C)]
        struct Message {
            window: isize,
            message: u32,
            wparam: usize,
            lparam: isize,
            time: u32,
            point: Point,
            private: u32,
        }
        #[link(name = "user32")]
        extern "system" {
            fn RegisterHotKey(window: isize, id: i32, modifiers: u32, key: u32) -> i32;
            fn UnregisterHotKey(window: isize, id: i32) -> i32;
            fn GetMessageW(message: *mut Message, window: isize, min: u32, max: u32) -> i32;
        }
        let search_registered = unsafe { RegisterHotKey(0, 0x5451, 0x4001, 0x51) != 0 };
        {
            if !search_registered {
                eprintln!("Quick Search: Alt+Q is already in use. The topbar search button remains available.");
            }
        }
        let ai_registered = unsafe { RegisterHotKey(0, 0x5452, 0x4005, 0x51) != 0 };
        if !ai_registered {
            eprintln!("Rhōmaíōn prompt: Alt+Shift+Q is already in use.");
        }
        app.state::<QuickSearchState>()
            .registered
            .store(search_registered, Ordering::Relaxed);
        loop {
            let mut message: Message = unsafe { std::mem::zeroed() };
            if unsafe { GetMessageW(&mut message, 0, 0, 0) } <= 0 {
                break;
            }
            if message.message == 0x312 && [0x5451, 0x5452].contains(&message.wparam) {
                let ai = message.wparam == 0x5452;
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = open_mode(app, ai, true).await {
                        eprintln!("Quick Search could not open: {}", error);
                    }
                });
            }
        }
        unsafe {
            UnregisterHotKey(0, 0x5451);
            UnregisterHotKey(0, 0x5452);
        }
        app.state::<QuickSearchState>()
            .registered
            .store(false, Ordering::Relaxed);
    });
}
#[cfg(not(windows))]
pub fn register(_app: tauri::AppHandle) {}
