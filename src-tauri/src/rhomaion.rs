use std::sync::Mutex;
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
#[derive(Default)]
pub struct RhomaionState(pub Mutex<String>);
fn main_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Open Rhōmaíōn from the main app.".into());
    }
    Ok(())
}
fn ai_only(window: &WebviewWindow) -> Result<(), String> {
    if !["rhomaion-ai", "rhomaion-prompt"].contains(&window.label()) {
        return Err("This action belongs to the AI window.".into());
    }
    Ok(())
}
fn safe_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 100
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}
pub fn allowed_page(page: &str) -> bool {
    if [
        "home",
        "towns",
        "citizens",
        "earthmc-towns",
        "earthmc-people",
        "news",
        "news:new",
        "news:meeting",
        "jobs",
        "jobs:materials",
        "jobs:available",
        "jobs:inbox",
        "jobs:availability:edit",
        "jobs:new:task",
        "jobs:new:materials",
        "shops",
        "shops:bulk",
        "shops:new:shop",
        "shops:new:bulk",
        "profile",
        "settings",
        "settings:account",
        "settings:widgets",
        "settings:ai",
        "map",
        "about",
        "changelog",
        "companies",
        "expansions",
    ]
    .contains(&page)
    {
        return true;
    }
    let parts: Vec<_> = page.split(':').collect();
    match parts.as_slice() {
        ["town", id] => safe_id(id),
        ["town", id, "suggestions"] => safe_id(id),
        [root, id] if ["earthmc-town", "earthmc-player", "citizen", "news"].contains(root) => {
            safe_id(id)
        }
        [root, "item", id] if ["jobs", "shops"].contains(root) => safe_id(id),
        _ => false,
    }
}
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AiDraft {
    id: String,
    kind: String,
    fields: std::collections::BTreeMap<String, String>,
}
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiRoute {
    town_id: String,
    points: Vec<[i64; 2]>,
    checked_at: String,
}
#[derive(Clone, serde::Serialize)]
struct AiNavigation {
    page: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    draft: Option<AiDraft>,
    #[serde(skip_serializing_if = "Option::is_none")]
    route: Option<AiRoute>,
}
fn valid_draft(page: &str, draft: &AiDraft) -> bool {
    let (expected, allowed) = match draft.kind.as_str() {
        "news" => ("news:new", vec!["title", "subtitle", "body"]),
        "task" => (
            "jobs:new:task",
            vec!["title", "description", "materials", "priceGold"],
        ),
        "materials" => (
            "jobs:new:materials",
            vec!["title", "description", "materials", "priceGold"],
        ),
        "shop" => (
            "shops:new:shop",
            vec![
                "title",
                "town",
                "items",
                "description",
                "priceGold",
                "shopType",
            ],
        ),
        "bulk" => (
            "shops:new:bulk",
            vec![
                "title",
                "town",
                "items",
                "description",
                "priceGold",
                "shopType",
            ],
        ),
        _ => return false,
    };
    expected == page
        && safe_id(&draft.id)
        && draft.fields.iter().all(|(key, value)| {
            allowed.contains(&key.as_str()) && value.len() <= 24000 && !value.contains('\0')
        })
        && serde_json::to_vec(draft).is_ok_and(|bytes| bytes.len() <= 72000)
}
fn valid_route(page: &str, route: &AiRoute) -> bool {
    safe_id(&route.town_id)
        && page == format!("town:{}:suggestions", route.town_id)
        && route.checked_at.len() <= 80
        && route.points.len() <= 24
        && route
            .points
            .iter()
            .flatten()
            .all(|n| (-2_000_000..=2_000_000).contains(n))
}
// WebView2 creation must run outside a synchronous IPC command on Windows.
#[tauri::command]
pub async fn rhomaion_open(
    app: tauri::AppHandle,
    window: WebviewWindow,
    keep_on_top: bool,
) -> Result<(), String> {
    main_only(&window)?;
    if let Some(w) = app.get_webview_window("rhomaion-ai") {
        w.set_always_on_top(keep_on_top)
            .map_err(|e| e.to_string())?;
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(
        &app,
        "rhomaion-ai",
        WebviewUrl::App("index.html?rhomaion-ai=1".into()),
    )
    .title("Rhōmaíōn AI")
    .inner_size(420.0, 720.0)
    .min_inner_size(360.0, 520.0)
    .decorations(false)
    .shadow(true)
    .resizable(true)
    .always_on_top(keep_on_top)
    .background_color(tauri::window::Color(23, 25, 31, 255))
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub fn rhomaion_set_context(
    window: WebviewWindow,
    state: State<RhomaionState>,
    page: String,
) -> Result<(), String> {
    main_only(&window)?;
    if page.len() > 160 {
        return Err("Page context is too long.".into());
    }
    *state.0.lock().map_err(|_| "Page context is busy")? = page;
    Ok(())
}
#[tauri::command]
pub fn rhomaion_context(
    window: WebviewWindow,
    state: State<RhomaionState>,
) -> Result<String, String> {
    ai_only(&window)?;
    Ok(state.0.lock().map_err(|_| "Page context is busy")?.clone())
}
#[tauri::command]
pub fn rhomaion_navigate(
    app: tauri::AppHandle,
    window: WebviewWindow,
    page: String,
    draft: Option<AiDraft>,
    route: Option<AiRoute>,
) -> Result<(), String> {
    ai_only(&window)?;
    if !allowed_page(&page)
        || (draft.is_some() && route.is_some())
        || draft.as_ref().is_some_and(|d| !valid_draft(&page, d))
        || route.as_ref().is_some_and(|r| !valid_route(&page, r))
    {
        return Err("That AI page or preview is not allowed.".into());
    }
    app.emit_to(
        "main",
        "rhomaion-navigate",
        AiNavigation { page, draft, route },
    )
    .map_err(|e| e.to_string())?;
    if let Some(main) = app.get_webview_window("main") {
        main.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
pub fn rhomaion_refresh(app: tauri::AppHandle, window: WebviewWindow) -> Result<(), String> {
    ai_only(&window)?;
    app.emit_to("main", "rhomaion-refresh", ())
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn rhomaion_export(
    app: tauri::AppHandle,
    window: WebviewWindow,
    contents: String,
) -> Result<String, String> {
    if !["main", "rhomaion-ai"].contains(&window.label()) {
        return Err("Export belongs to the AI settings.".into());
    }
    if contents.len() > 32 * 1024 * 1024
        || serde_json::from_str::<serde_json::Value>(&contents).is_err()
    {
        return Err("The local chat export is invalid or too large.".into());
    }
    let directory = app.path().download_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let filename = format!("Rhomaion-chats-{}.json", stamp);
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(directory.join(&filename))
        .map_err(|e| e.to_string())?;
    use std::io::Write;
    file.write_all(contents.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    Ok(format!("Saved to Downloads: {}", filename))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn previews_cannot_target_other_pages() {
        let draft = AiDraft {
            id: "draft-1".into(),
            kind: "news".into(),
            fields: std::collections::BTreeMap::from([("title".into(), "Test".into())]),
        };
        assert!(valid_draft("news:new", &draft));
        assert!(!valid_draft("shops:new:shop", &draft));
        let route = AiRoute {
            town_id: "town1".into(),
            points: vec![[1, 2]],
            checked_at: "2026-10-29T00:00:00Z".into(),
        };
        assert!(valid_route("town:town1:suggestions", &route));
        assert!(!valid_route("town:town2:suggestions", &route));
    }
    #[test]
    fn navigation_is_limited_to_supported_pages() {
        for p in [
            "towns",
            "town:sample",
            "town:sample:suggestions",
            "earthmc-town:sample",
            "earthmc-player:sample",
            "news:new",
            "jobs:new:materials",
            "shops:new:bulk",
            "news:sample",
            "jobs:item:sample",
        ] {
            assert!(allowed_page(p))
        }
        for p in [
            "admin",
            "news:edit:1",
            "town:",
            "town:../a",
            "https://example.com",
            "town:a:edit",
        ] {
            assert!(!allowed_page(p))
        }
    }
}
