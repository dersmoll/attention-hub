//! Auxiliary windows share the widget's running WebView2 environment.
//!
//! Looking up a fresh Evergreen environment after a runtime update can select
//! a different browser version while the widget still owns the same data
//! directory. Keep every window in this process on the widget's environment.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{utils::config::WindowConfig, Manager, WebviewUrl, WebviewWindowBuilder};

static CREATION_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

struct CreationGuard;

impl CreationGuard {
    fn acquire() -> Result<Self, String> {
        CREATION_IN_PROGRESS
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| Self)
            .map_err(|_| "Another window is opening. Please try again.".to_owned())
    }
}

impl Drop for CreationGuard {
    fn drop(&mut self) {
        CREATION_IN_PROGRESS.store(false, Ordering::Release);
    }
}

fn validate_options(options: &WindowConfig) -> Result<(), String> {
    if !matches!(
        options.label.as_str(),
        "advanced"
            | "today"
            | "medicine-panel"
            | "todo-popup"
            | "medicine"
            | "manager"
            | "sticky-note"
            | "event-settings"
            | "project-panel"
            | "update"
    ) {
        return Err("The requested auxiliary window is unavailable.".to_owned());
    }

    // All auxiliary views use the app's entry page. Permit its existing query
    // parameters, but reject external/custom schemes, network paths, files,
    // path traversal and encoded alternative paths before the builder sees it.
    let WebviewUrl::App(path) = &options.url else {
        return Err("Auxiliary windows must use a local app page.".to_owned());
    };
    let path = path
        .to_str()
        .ok_or_else(|| "Auxiliary windows must use a local app page.".to_owned())?;
    let entry_path = path.split(['?', '#']).next().unwrap_or_default();
    if !matches!(entry_path, "" | "/" | "index.html" | "/index.html")
        || path.chars().any(char::is_control)
    {
        return Err("Auxiliary windows must use a local app page.".to_owned());
    }

    // A caller must not request another profile or environment configuration
    // while explicitly sharing the main window's browser environment.
    if options.data_directory.is_some()
        || options.additional_browser_args.is_some()
        || options.proxy_url.is_some()
        || options.incognito
        || options.browser_extensions_enabled
        || options.use_https_scheme
        || options.javascript_disabled
    {
        return Err("Auxiliary windows must use the app's browser configuration.".to_owned());
    }
    Ok(())
}

fn creation_error(stage: &str) -> String {
    // Never expose native error strings: they may contain a URL or a local
    // profile path. These stage names are fixed by this module, not user input.
    format!("The window could not be opened ({stage}). Please restart Attention Hub and try again.")
}

#[tauri::command]
pub async fn create_auxiliary_window(
    app: tauri::AppHandle,
    options: WindowConfig,
) -> Result<(), String> {
    validate_options(&options)?;
    if crate::app_backup::restore_is_pending() {
        return Err("Finish backup recovery before opening another window.".to_owned());
    }
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| creation_error("widget unavailable"))?;
    // WebView2 creation pumps messages. Reject another creation immediately
    // instead of waiting on a mutex from a reentrant main-thread callback.
    let guard = CreationGuard::acquire()?;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    main.with_webview(move |platform| {
        let _guard = guard;
        let result = (|| {
            if crate::app_backup::restore_is_pending() {
                return Err("Finish backup recovery before opening another window.".to_owned());
            }
            let builder = WebviewWindowBuilder::from_config(&app, &options)
                .map_err(|_| creation_error("window configuration"))?;
            #[cfg(target_os = "windows")]
            let builder = builder.with_environment(platform.environment());
            #[cfg(not(target_os = "windows"))]
            let _ = platform;
            let window = builder
                .build()
                .map_err(|_| creation_error("native creation"))?;
            #[cfg(target_os = "windows")]
            {
                // Tauri 2.11's runtime can log a native creation failure while
                // still registering a detached window. Because this callback
                // runs on the main thread, creation has already been attempted;
                // validate the actual HWND instead of returning dispatch success.
                window
                    .hwnd()
                    .map_err(|_| creation_error("native window unavailable"))?;
            }
            #[cfg(not(target_os = "windows"))]
            let _ = window;
            Ok(())
        })();
        let _ = sender.send(result);
    })
    .map_err(|_| creation_error("browser environment"))?;
    receiver
        .await
        .map_err(|_| creation_error("creation response"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn options(label: &str, url: &str) -> WindowConfig {
        WindowConfig {
            label: label.to_owned(),
            url: serde_json::from_value(serde_json::Value::String(url.to_owned())).unwrap(),
            ..Default::default()
        }
    }

    #[test]
    fn accepts_existing_auxiliary_views_and_query_parameters() {
        for label in [
            "advanced",
            "today",
            "medicine-panel",
            "todo-popup",
            "medicine",
            "manager",
            "sticky-note",
            "event-settings",
            "project-panel",
            "update",
        ] {
            assert!(validate_options(&options(
                label,
                "/?window=today&auxiliaryRequestId=example&itemId=a%2Fb",
            ))
            .is_ok());
        }
        assert!(validate_options(&options("advanced", "index.html")).is_ok());
    }

    #[test]
    fn rejects_main_unknown_labels_and_non_app_entry_urls() {
        for label in ["main", "unknown", "project-panel-unknown"] {
            assert!(validate_options(&options(label, "/")).is_err());
        }
        for url in [
            "https://example.com/",
            "tauri://localhost/",
            "file:///C:/private.txt",
            "//example.com/",
            "../index.html",
            "/%2e%2e/index.html",
            "C:\\private.txt",
            "/\\example.com/",
            "/?value=\nsecret",
        ] {
            assert!(validate_options(&options("today", url)).is_err());
        }
    }

    #[test]
    fn rejects_separate_browser_profiles_without_echoing_input() {
        let mut config = options("today", "/?private=do-not-echo");
        config.data_directory = Some("do-not-echo".into());
        let error = validate_options(&config).unwrap_err();
        assert!(!error.contains("do-not-echo"));
    }
}
