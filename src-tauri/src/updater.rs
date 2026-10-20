use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read},
    path::PathBuf,
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use tauri::{Emitter, Manager};
pub struct DesktopUpdater {
    busy: AtomicBool,
    status: Mutex<Value>,
    ready: Mutex<Option<PathBuf>>,
}
impl Default for DesktopUpdater {
    fn default() -> Self {
        Self {
            busy: AtomicBool::new(false),
            status: Mutex::new(if std::env::args().any(|arg| arg == "--update-failed") {
                json!({"stage":"error","installationFailed":true,"message":"Windows Installer did not complete the update. Your previous app is still available. Please download and retry."})
            } else {
                json!({"stage":"idle"})
            }),
            ready: Mutex::new(None),
        }
    }
}
fn publish(app: &tauri::AppHandle, value: Value) {
    *app.state::<DesktopUpdater>().status.lock().unwrap() = value.clone();
    let _ = app.emit("desktop-update", value);
}
fn helper(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("updater/trp-updater.exe");
    if path.is_file() {
        Ok(path)
    } else {
        Err("The Dart update helper is missing. Reinstall the complete MSI package.".into())
    }
}
fn command(path: PathBuf) -> Command {
    // Tauri resource paths may use verbatim Windows syntax. Dart's compiled
    // runtime rejects that executable path before main() can emit any JSON.
    #[cfg(windows)]
    let path = match path.to_str() {
        Some(text) if text.starts_with(r"\\?\UNC\") =>
            PathBuf::from(format!(r"\\{}", &text[8..])),
        Some(text) if text.starts_with(r"\\?\") => PathBuf::from(&text[4..]),
        _ => path,
    };
    let mut cmd = Command::new(path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd
}
fn main_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Updates are available in the main app window.".into());
    }
    Ok(())
}
#[tauri::command]
pub fn desktop_update_status(
    window: tauri::WebviewWindow,
    state: tauri::State<DesktopUpdater>,
) -> Result<Value, String> {
    main_window(&window)?;
    Ok(state.status.lock().unwrap().clone())
}
pub fn run(app: &tauri::AppHandle, action: &str, mode: &str, build_number: u32) -> Result<Value, String> {
    let state = app.state::<DesktopUpdater>();
    if state.busy.swap(true, Ordering::SeqCst) {
        return Err("An update operation is already running.".into());
    }
    let result = (|| {
        if state.ready.lock().unwrap().is_some() {
            return Ok(state.status.lock().unwrap().clone());
        }
        let dir = if action == "prepare" {
            let dir = tempfile::Builder::new()
                .prefix("trp-update-")
                .tempdir()
                .map_err(|e| e.to_string())?
                .keep();
            Some(dir)
        } else {
            None
        };
        publish(
            app,
            json!({"stage":if action=="prepare"{"downloading"}else{"checking"},"received":0,"total":0}),
        );
        let mut cmd = command(helper(app)?);
        cmd.args([action, &build_number.to_string(), mode]);
        if let Some(ref d) = dir {
            cmd.arg(d);
        }
        let mut child = cmd
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Could not start the Dart updater: {e}"))?;
        let stderr = child.stderr.take().unwrap();
        let errors = std::thread::spawn(move || {
            let mut text = String::new();
            let _ = stderr.take(16384).read_to_string(&mut text);
            text
        });
        let mut responded = false;
        let mut last = json!({"stage":"error","message":"The update helper did not respond."});
        for line in BufReader::new(child.stdout.take().unwrap()).lines() {
            let line = line.map_err(|e| e.to_string())?;
            if let Ok(value) = serde_json::from_str::<Value>(&line) {
                responded = true;
                last = value.clone();
                publish(app, value)
            }
        }
        let exit = child.wait().map_err(|e| e.to_string())?;
        let error_text = errors.join().unwrap_or_default();
        if !responded {
            last = json!({"stage":"error","message":format!("The update helper returned no JSON (exit {}). {}", exit, error_text.trim())});
            publish(app, last.clone());
        }
        if last["stage"] == "ready" {
            *state.ready.lock().unwrap() = dir;
        } else if let Some(d) = dir {
            let _ = std::fs::remove_dir_all(d);
        }
        if !exit.success() && last["stage"] != "error" {
            return Err("The updater stopped unexpectedly.".into());
        }
        Ok(last)
    })();
    state.busy.store(false, Ordering::SeqCst);
    if let Err(ref message) = result {
        publish(app, json!({"stage":"error","message":message}));
    }
    result
}
#[tauri::command]
pub async fn desktop_update_check(
    build_number: u32,
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<Value, String> {
    main_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || run(&app, "check", "update", build_number))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn desktop_update_download(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    reinstall: bool,
    build_number: u32,
) -> Result<Value, String> {
    main_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        run(
            &app,
            "prepare",
            if reinstall { "reinstall" } else { "update" },
            build_number,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn desktop_update_install(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    main_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<DesktopUpdater>();
        if state.busy.swap(true, Ordering::SeqCst) {
            return Err("An update operation is already running.".to_string());
        }
        let result = (|| {
            let dir = state
                .ready
                .lock()
                .unwrap()
                .clone()
                .ok_or("Download and verify the MSI first.")?;
            // Run a temporary copy so Windows Installer can replace the installed helper.
            let copied = dir.join("trp-updater.exe");
            std::fs::copy(helper(&app)?, &copied).map_err(|e| e.to_string())?;
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let mut child = command(copied)
                .arg("install")
                .arg(&dir)
                .arg(std::process::id().to_string())
                .arg(exe)
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|e| e.to_string())?;
            let mut line = String::new();
            BufReader::new(child.stdout.take().unwrap())
                .read_line(&mut line)
                .map_err(|e| e.to_string())?;
            let value: Value = serde_json::from_str(&line)
                .map_err(|_| "The installer helper did not confirm readiness.")?;
            if value["stage"] != "installing" {
                return Err(value["message"]
                    .as_str()
                    .unwrap_or("Could not prepare installation.")
                    .to_string());
            }
            publish(&app, value);
            app.exit(0);
            Ok(())
        })();
        state.busy.store(false, Ordering::SeqCst);
        if let Err(ref message) = result {
            *state.ready.lock().unwrap() = None;
            publish(&app, json!({"stage":"error","message":message}));
        }
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
