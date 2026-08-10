use serde::Serialize;

#[cfg(target_os = "windows")]
mod windows_adapter;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttentionSignalSnapshot {
    pub captured_at: String,
    pub signals: Vec<AttentionSignal>,
    pub diagnostics: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttentionSignal {
    pub source_key: String,
    pub display_name: String,
    pub kind: String,
    pub count: Option<u32>,
    pub needs_attention: Option<bool>,
    pub origin: String,
    pub raw_label: Option<String>,
    pub confidence: String,
    pub meaning: String,
    pub diagnostics: Vec<String>,
}

#[cfg(target_os = "windows")]
pub async fn get_snapshot() -> AttentionSignalSnapshot {
    match tauri::async_runtime::spawn_blocking(windows_adapter::get_snapshot).await {
        Ok(snapshot) => snapshot,
        Err(error) => AttentionSignalSnapshot {
            captured_at: String::new(),
            signals: Vec::new(),
            diagnostics: vec![format!(
                "The attention-signal snapshot task could not complete: {error}"
            )],
        },
    }
}

#[cfg(not(target_os = "windows"))]
pub async fn get_snapshot() -> AttentionSignalSnapshot {
    AttentionSignalSnapshot {
        captured_at: String::new(),
        signals: Vec::new(),
        diagnostics: vec!["Persistent attention signals are only available on Windows.".into()],
    }
}
