use serde::Serialize;

#[cfg(target_os = "windows")]
mod windows_adapter;

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GraphEnvironmentStatus {
    Ready,
    NotConfigured,
    Unavailable,
    Error,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEnvironmentReport {
    pub status: GraphEnvironmentStatus,
    pub helper_available: bool,
    pub windows_supported: bool,
    pub client_id_configured: bool,
    pub tenant_id_configured: bool,
    pub dotnet_runtime_version: Option<String>,
    pub msal_version: Option<String>,
    pub broker_version: Option<String>,
    pub diagnostics: Vec<String>,
}

impl GraphEnvironmentReport {
    #[cfg(not(target_os = "windows"))]
    fn unavailable(message: impl Into<String>) -> Self {
        Self {
            status: GraphEnvironmentStatus::Unavailable,
            helper_available: false,
            windows_supported: false,
            client_id_configured: false,
            tenant_id_configured: false,
            dotnet_runtime_version: None,
            msal_version: None,
            broker_version: None,
            diagnostics: vec![message.into()],
        }
    }
}

#[cfg(target_os = "windows")]
pub async fn get_environment() -> GraphEnvironmentReport {
    windows_adapter::get_environment().await
}

#[cfg(not(target_os = "windows"))]
pub async fn get_environment() -> GraphEnvironmentReport {
    GraphEnvironmentReport::unavailable(
        "The Microsoft Graph calendar helper is only available on Windows.",
    )
}
