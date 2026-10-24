#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod database;
mod microsoft_window;
use microsoft_window::{open_microsoft_signin, close_microsoft_signin};
mod updater;
use database::{database_commit, database_path, database_read};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use updater::{
    desktop_update_check, desktop_update_download, desktop_update_install, desktop_update_status,
    DesktopUpdater,
};
struct Preferences {
    background: AtomicBool,
}
#[tauri::command]
fn export_cpu_threads() -> usize {
    std::thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(1)
}

#[tauri::command]
async fn earthmc(endpoint: String, names: Vec<String>) -> Result<serde_json::Value, String> {
    if !["/nations", "/towns", "/players", "/server", "/online", "/"].contains(&endpoint.as_str()) {
        return Err("Unsupported EarthMC endpoint".into());
    }
    if names.len() > 100 {
        return Err("Request too large".into());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("https://api.earthmc.net/v4{}", endpoint);
    let req = if names.is_empty() {
        client.get(url)
    } else {
        client.post(url).json(&serde_json::json!({"query":names}))
    };
    req.send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn open_panel(app: tauri::AppHandle, page: String) -> Result<(), String> {
    if !["live", "towns", "citizens", "map", "widgets"].contains(&page.as_str()) {
        return Err("Unknown panel".into());
    }
    let name = format!("panel-{}", page);
    if let Some(w) = app.get_webview_window(&name) {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(
        &app,
        name,
        WebviewUrl::App(format!("index.html?panel={}", page).into()),
    )
    .title(format!("The Records Project · {}", page))
    .inner_size(950.0, 720.0)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize)]
struct WindowsPreferences {
    startup: bool,
    minimized: bool,
    background: bool,
}
#[tauri::command]
fn get_windows_preferences(app: tauri::AppHandle) -> Result<WindowsPreferences, String> {
    use winreg::{enums::*, RegKey};
    let startup_command = match RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
        KEY_READ,
    ) {
        Ok(key) => match key.get_value::<String, _>("TheRecordsProjectNostra2") {
            Ok(value) => value,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
            Err(e) => return Err(e.to_string()),
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(e.to_string()),
    };
    Ok(WindowsPreferences {
        startup: !startup_command.is_empty(),
        minimized: startup_command.contains(" --minimized"),
        background: app
            .state::<Preferences>()
            .background
            .load(Ordering::Relaxed),
    })
}

#[tauri::command]
fn set_startup(enabled: bool, minimized: Option<bool>) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;
    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            KEY_SET_VALUE,
        )
        .map_err(|e| e.to_string())?;
    if enabled {
        let path = std::env::current_exe().map_err(|e| e.to_string())?;
        key.set_value(
            "TheRecordsProjectNostra2",
            &format!(
                "\"{}\"{}",
                path.display(),
                if minimized.unwrap_or(false) {
                    " --minimized"
                } else {
                    ""
                }
            ),
        )
        .map_err(|e| e.to_string())?;
    } else {
        match key.delete_value("TheRecordsProjectNostra2") {
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}
#[tauri::command]
fn set_background(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let path = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    std::fs::write(
        path.join("background.txt"),
        if enabled { "true" } else { "false" },
    )
    .map_err(|e| e.to_string())?;
    app.state::<Preferences>()
        .background
        .store(enabled, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
fn widget_window(
    app: tauri::AppHandle,
    kind: String,
    action: String,
    top: bool,
    locked: bool,
) -> Result<(), String> {
    if !["stats", "nation", "friends", "voteparty"].contains(&kind.as_str()) {
        return Err("Unknown widget".into());
    }
    if !["open", "close", "unlock"].contains(&action.as_str()) {
        return Err("Unknown widget action".into());
    }
    let label = format!("panel-widget-{}", kind);
    if let Some(w) = app.get_webview_window(&label) {
        if action == "close" {
            return w.close().map_err(|e| e.to_string());
        }
        w.set_ignore_cursor_events(action == "open" && locked)
            .map_err(|e| e.to_string())?;
        w.set_always_on_top(action == "open" && top)
            .map_err(|e| e.to_string())?;
        w.show().map_err(|e| e.to_string())?;
        if action == "unlock" {
            let _ = w.center();
        }
        if !locked {
            let _ = w.set_focus();
        }
        return Ok(());
    }
    if action != "open" {
        return Ok(());
    }
    let mut builder = WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::App(format!("index.html?panel=widget-{}", kind).into()),
    )
    .title(format!("The Records Project · {}", kind))
    .inner_size(360.0, 340.0)
    .min_inner_size(260.0, 200.0)
    .always_on_top(top)
    .skip_taskbar(false);
    if let Ok(dir) = app.path().app_config_dir() {
        if let Ok(raw) = std::fs::read_to_string(dir.join(format!("{}.json", label))) {
            if let Ok(g) = serde_json::from_str::<[f64; 4]>(&raw) {
                builder = builder
                    .position(g[0], g[1])
                    .inner_size(g[2].max(260.0), g[3].max(200.0));
            }
        }
    }
    let w = builder.build().map_err(|e| e.to_string())?;
    w.set_ignore_cursor_events(locked)
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
fn notify_vote_party(app: tauri::AppHandle, remaining: u32) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    if remaining > 250 {
        return Err("Vote party is not imminent".into());
    }
    app.notification()
        .builder()
        .title("EarthMC Vote Party")
        .body(format!("Only {} votes remaining. Get ready!", remaining))
        .show()
        .map_err(|e| e.to_string())
}
fn main() {
    tauri::Builder::default()
        .manage(DesktopUpdater::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .manage(Preferences {
            background: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            desktop_update_status,
            desktop_update_check,
            desktop_update_download,
            desktop_update_install,
            export_cpu_threads,
            database_read,
            database_commit,
            database_path,
            earthmc,
            open_panel,
            open_microsoft_signin,
            close_microsoft_signin,
            get_windows_preferences,
            set_startup,
            set_background,
            widget_window,
            notify_vote_party
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label().starts_with("panel-widget-") {
                    if let (Ok(dir), Ok(pos), Ok(size), Ok(scale)) = (
                        window.app_handle().path().app_config_dir(),
                        window.outer_position(),
                        window.inner_size(),
                        window.scale_factor(),
                    ) {
                        let _ = std::fs::create_dir_all(&dir);
                        let g = [
                            pos.x as f64 / scale,
                            pos.y as f64 / scale,
                            size.width as f64 / scale,
                            size.height as f64 / scale,
                        ];
                        if let Ok(json) = serde_json::to_string(&g) {
                            let _ =
                                std::fs::write(dir.join(format!("{}.json", window.label())), json);
                        }
                    }
                }
                if window.label() == "main"
                    && window
                        .state::<Preferences>()
                        .background
                        .load(Ordering::Relaxed)
                {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            if std::env::args().any(|a| a == "--minimized") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            if let Ok(path) = app.path().app_config_dir() {
                let enabled = std::fs::read_to_string(path.join("background.txt"))
                    .unwrap_or_default()
                    == "true";
                app.state::<Preferences>()
                    .background
                    .store(enabled, Ordering::Relaxed);
            }
            let show =
                MenuItem::with_id(app, "show", "Open The Records Project", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Exit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("The Records Project")
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Unable to start The Records Project");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unapproved_endpoints() {
        assert!(tauri::async_runtime::block_on(earthmc("/invalid".into(), vec![])).is_err());
    }
    #[test]
    #[ignore = "Makes a read-only request to the public EarthMC API"]
    fn live_earthmc() {
        let result =
            tauri::async_runtime::block_on(earthmc("/nations".into(), vec!["Byzantium".into()]))
                .expect("EarthMC HTTPS request failed");
        assert_eq!(result[0]["name"], "Byzantium");
        println!("EarthMC TLS verified: Byzantium nation returned.");
    }
}
