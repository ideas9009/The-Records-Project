use tauri::{Manager, Url, WebviewUrl, WebviewWindowBuilder};
const LABEL: &str = "microsoft-signin";
const CLIENT_ID: &str = "8dba1883-5bb6-4c05-b384-ec361a91b886";
const CALLBACK: &str = "https://the-records-project-api.onrender.com/api/auth/microsoft/callback";
fn https_url(url: &Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port_or_known_default() == Some(443)
}
fn start_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "Invalid Microsoft sign-in address.")?;
    if !https_url(&url)
        || url.host_str() != Some("login.microsoftonline.com")
        || url.path() != "/consumers/oauth2/v2.0/authorize"
        || url.fragment().is_some()
    {
        return Err("Invalid Microsoft sign-in address.".into());
    }
    let one = |key: &str| -> Option<String> {
        let values: Vec<_> = url
            .query_pairs()
            .filter(|(name, _)| name == key)
            .map(|(_, value)| value.into_owned())
            .collect();
        if values.len() == 1 {
            Some(values[0].clone())
        } else {
            None
        }
    };
    let opaque = |value: Option<String>| {
        value.is_some_and(|v| {
            v.len() == 43
                && v.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        })
    };
    if one("client_id").as_deref() != Some(CLIENT_ID)
        || one("redirect_uri").as_deref() != Some(CALLBACK)
        || one("response_type").as_deref() != Some("code")
        || one("response_mode").as_deref() != Some("query")
        || one("scope").as_deref() != Some("XboxLive.signin")
        || one("code_challenge_method").as_deref() != Some("S256")
        || !opaque(one("state"))
        || !opaque(one("code_challenge"))
    {
        return Err("Invalid Microsoft verification request.".into());
    }
    Ok(url)
}
fn allowed_navigation(url: &Url) -> bool {
    if !https_url(url) {
        return false;
    }
    let host = url.host_str().unwrap_or("");
    if host == "the-records-project-api.onrender.com" {
        return url.path() == "/api/auth/microsoft/callback";
    }
    [
        "microsoftonline.com",
        "live.com",
        "microsoft.com",
        "msauth.net",
        "msftauth.net",
    ]
    .iter()
    .any(|domain| host == *domain || host.ends_with(&format!(".{domain}")))
}
#[tauri::command]
pub async fn open_microsoft_signin(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    url: String,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Microsoft sign-in must be opened from the main app.".into());
    }
    let url = start_url(&url)?;
    if let Some(existing) = app.get_webview_window(LABEL) {
        existing
            .navigate(url)
            .map_err(|_| "Could not open Microsoft sign-in.")?;
        existing
            .show()
            .map_err(|_| "Could not show Microsoft sign-in.")?;
        existing
            .set_focus()
            .map_err(|_| "Could not focus Microsoft sign-in.")?;
        return Ok(());
    }
    let data = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "Could not locate Microsoft browser data.")?
        .join("microsoft-signin");
    std::fs::create_dir_all(&data).map_err(|_| "Could not create Microsoft browser data.")?;
    WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::External(url))
        .title("Microsoft sign-in · The Records Project")
        .inner_size(560.0, 760.0)
        .min_inner_size(440.0, 600.0)
        .center()
        .data_directory(data)
        .incognito(false)
        .devtools(false)
        .on_navigation(allowed_navigation)
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .parent(&window)
        .map_err(|_| "Could not attach Microsoft sign-in to the app.")?
        .build()
        .map_err(|_| {
            "Could not open the Microsoft sign-in window. Try your default browser instead."
        })?;
    Ok(())
}
#[tauri::command]
pub async fn close_microsoft_signin(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Only the main app can close Microsoft sign-in.".into());
    }
    if let Some(signin) = app.get_webview_window(LABEL) {
        signin
            .close()
            .map_err(|_| "Could not close Microsoft sign-in.")?;
        window
            .set_focus()
            .map_err(|_| "Could not return to the app.")?;
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn valid() -> String {
        let mut url =
            Url::parse("https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize")
                .unwrap();
        url.query_pairs_mut().extend_pairs(&[
            ("client_id", CLIENT_ID),
            ("redirect_uri", CALLBACK),
            ("response_type", "code"),
            ("response_mode", "query"),
            ("scope", "XboxLive.signin"),
            ("state", &"a".repeat(43)),
            ("code_challenge", &"b".repeat(43)),
            ("code_challenge_method", "S256"),
        ]);
        url.to_string()
    }
    #[test]
    fn permits_only_the_expected_authorization_request() {
        assert!(start_url(&valid()).is_ok());
        for bad in [
            valid().replace(CLIENT_ID, "other-client"),
            valid().replace("login.microsoftonline.com", "attacker.invalid"),
            valid().replace("response_type=code", "response_type=token"),
            format!("{}&state=extra", valid()),
            valid().replace("https://login", "http://login"),
        ] {
            assert!(start_url(&bad).is_err());
        }
    }
    #[test]
    fn restricts_the_remote_window_to_microsoft_and_our_callback() {
        for good in [
            "https://login.live.com/",
            "https://account.microsoft.com/",
            CALLBACK,
        ] {
            assert!(allowed_navigation(&Url::parse(good).unwrap()));
        }
        for bad in [
            "http://login.live.com/",
            "https://login.live.com.evil.invalid/",
            "https://evil@login.live.com/",
            "https://login.live.com:444/",
            "https://the-records-project-api.onrender.com/api/admin",
            "https://127.0.0.1/",
            "file:///C:/Windows/",
        ] {
            assert!(!allowed_navigation(&Url::parse(bad).unwrap()));
        }
    }
}
