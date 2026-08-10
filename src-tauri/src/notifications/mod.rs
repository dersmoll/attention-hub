use serde::Serialize;

#[cfg(target_os = "windows")]
mod windows_adapter;

#[cfg(target_os = "windows")]
pub use windows_adapter::NotificationListenerState;

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NotificationAccessStatus {
    Unspecified,
    Allowed,
    Denied,
    Unsupported,
    Error,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageIdentityReport {
    pub present: bool,
    pub full_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationAccessReport {
    pub access_status: NotificationAccessStatus,
    pub api_available: bool,
    pub package_identity: PackageIdentityReport,
    pub diagnostics: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationSnapshot {
    pub access_status: NotificationAccessStatus,
    pub captured_at: String,
    pub notifications: Vec<AttentionNotification>,
    pub diagnostics: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttentionNotification {
    pub id: u32,
    pub source: NotificationSource,
    pub created_at: Option<String>,
    pub title: Option<String>,
    pub body: Vec<String>,
    pub raw_text_elements: Vec<String>,
    pub diagnostics: Vec<String>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationSource {
    pub display_name: Option<String>,
    pub app_user_model_id: Option<String>,
    pub package_family_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListenerStartReport {
    pub active: bool,
    pub diagnostics: Vec<String>,
}

#[cfg(not(target_os = "windows"))]
pub struct NotificationListenerState;

#[cfg(not(target_os = "windows"))]
impl NotificationListenerState {
    pub fn new() -> Self {
        Self
    }
}

impl NotificationAccessReport {
    #[cfg(not(target_os = "windows"))]
    fn unsupported(message: impl Into<String>) -> Self {
        Self {
            access_status: NotificationAccessStatus::Unsupported,
            api_available: false,
            package_identity: PackageIdentityReport {
                present: false,
                full_name: None,
            },
            diagnostics: vec![message.into()],
        }
    }
}

#[cfg(target_os = "windows")]
pub async fn get_access_status(app: tauri::AppHandle) -> NotificationAccessReport {
    windows_adapter::get_access_status(app).await
}

#[cfg(not(target_os = "windows"))]
pub async fn get_access_status(_app: tauri::AppHandle) -> NotificationAccessReport {
    NotificationAccessReport::unsupported(
        "Windows notification listening is only available on Windows.",
    )
}

#[cfg(target_os = "windows")]
pub async fn request_access(app: tauri::AppHandle) -> NotificationAccessReport {
    windows_adapter::request_access(app).await
}

#[cfg(not(target_os = "windows"))]
pub async fn request_access(_app: tauri::AppHandle) -> NotificationAccessReport {
    NotificationAccessReport::unsupported(
        "Windows notification listening is only available on Windows.",
    )
}

#[cfg(target_os = "windows")]
pub async fn get_snapshot(app: tauri::AppHandle) -> NotificationSnapshot {
    windows_adapter::get_snapshot(app).await
}

#[cfg(not(target_os = "windows"))]
pub async fn get_snapshot(_app: tauri::AppHandle) -> NotificationSnapshot {
    NotificationSnapshot {
        access_status: NotificationAccessStatus::Unsupported,
        captured_at: String::new(),
        notifications: Vec::new(),
        diagnostics: vec!["Windows notification listening is only available on Windows.".into()],
    }
}

#[cfg(target_os = "windows")]
pub async fn start_listener(
    app: tauri::AppHandle,
    state: &NotificationListenerState,
) -> ListenerStartReport {
    windows_adapter::start_listener(app, state).await
}

#[cfg(not(target_os = "windows"))]
pub async fn start_listener(
    _app: tauri::AppHandle,
    _state: &NotificationListenerState,
) -> ListenerStartReport {
    ListenerStartReport {
        active: false,
        diagnostics: vec!["Windows notification listening is only available on Windows.".into()],
    }
}
