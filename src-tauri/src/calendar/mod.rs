use serde::Serialize;

#[cfg(target_os = "windows")]
mod windows_adapter;

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CalendarAccessStatus {
    Unspecified,
    Allowed,
    Denied,
    Unsupported,
    Error,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarPackageIdentityReport {
    pub present: bool,
    pub full_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarAccessReport {
    pub access_status: CalendarAccessStatus,
    pub api_available: bool,
    pub package_identity: CalendarPackageIdentityReport,
    pub store_available: bool,
    pub diagnostics: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarSnapshot {
    pub access_status: CalendarAccessStatus,
    pub captured_at: String,
    pub range_start: String,
    pub range_end: String,
    pub calendars: Vec<CalendarSource>,
    pub appointments: Vec<CalendarAppointment>,
    pub diagnostics: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarSource {
    pub id: String,
    pub display_name: String,
    pub source_display_name: Option<String>,
    pub hidden: bool,
    pub diagnostics: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarAppointment {
    pub id: String,
    pub calendar_id: String,
    pub start_at: String,
    pub end_at: String,
    pub all_day: bool,
    pub subject: Option<String>,
    pub location: Option<String>,
    pub busy_status: Option<String>,
    pub sensitivity: Option<String>,
    pub is_recurring: bool,
    pub diagnostics: Vec<String>,
}

impl CalendarAccessReport {
    #[cfg(not(target_os = "windows"))]
    fn unsupported(message: impl Into<String>) -> Self {
        Self {
            access_status: CalendarAccessStatus::Unsupported,
            api_available: false,
            package_identity: CalendarPackageIdentityReport {
                present: false,
                full_name: None,
            },
            store_available: false,
            diagnostics: vec![message.into()],
        }
    }
}

#[cfg(target_os = "windows")]
pub async fn get_access_status() -> CalendarAccessReport {
    windows_adapter::get_access_status().await
}

#[cfg(not(target_os = "windows"))]
pub async fn get_access_status() -> CalendarAccessReport {
    CalendarAccessReport::unsupported("Windows calendar access is only available on Windows.")
}

#[cfg(target_os = "windows")]
pub async fn request_read_access() -> CalendarAccessReport {
    windows_adapter::request_read_access().await
}

#[cfg(target_os = "windows")]
pub async fn get_snapshot() -> CalendarSnapshot {
    windows_adapter::get_snapshot().await
}

#[cfg(not(target_os = "windows"))]
pub async fn get_snapshot() -> CalendarSnapshot {
    CalendarSnapshot {
        access_status: CalendarAccessStatus::Unsupported,
        captured_at: String::new(),
        range_start: String::new(),
        range_end: String::new(),
        calendars: Vec::new(),
        appointments: Vec::new(),
        diagnostics: vec!["Windows calendar access is only available on Windows.".into()],
    }
}

#[cfg(not(target_os = "windows"))]
pub async fn request_read_access() -> CalendarAccessReport {
    CalendarAccessReport::unsupported("Windows calendar access is only available on Windows.")
}
