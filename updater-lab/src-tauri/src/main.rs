#![windows_subsystem = "windows"]
#[path = "../../../src-tauri/src/updater.rs"]
mod updater;
use tauri::Manager;
fn main() {
    tauri::Builder::default().manage(updater::DesktopUpdater::default())
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let args: Vec<String> = std::env::args().collect();
                let action = args.get(1).map(String::as_str).unwrap_or("check");
                let build: u32 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(option_env!("TRP_LAB_BUILD").unwrap_or("0").parse().unwrap());
                let mode = args.get(3).map(String::as_str).unwrap_or("update");
                if action != "check" && option_env!("TRP_LAB_FIXTURE") != Some("1") {
                    handle.exit(2);
                    return;
                }
                let result = updater::run(&handle, if action == "install" {"prepare"} else {action}, mode, build);
                let folder = handle.path().app_local_data_dir().unwrap();
                let _ = std::fs::create_dir_all(&folder);
                let _ = std::fs::write(folder.join("last-result.json"), serde_json::to_vec_pretty(&serde_json::json!({"action":action,"build":build,"result":result})).unwrap());
                if action == "install" && result.as_ref().ok().map(|v| v["stage"] == "ready").unwrap_or(false) {
                    let window = handle.get_webview_window("main").unwrap();
                    let _ = tauri::async_runtime::block_on(updater::desktop_update_install(handle.clone(), window));
                }
                handle.exit(0);
            });
            Ok(())
        })
        .run(tauri::generate_context!()).expect("Updater lab failed");
}
