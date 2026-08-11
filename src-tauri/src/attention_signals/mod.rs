use serde::Serialize;

#[cfg(target_os = "windows")]
mod windows_adapter;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttentionSignalSnapshot {
    pub captured_at: String,
    pub sources: Vec<AttentionSourceObservation>,
    pub signals: Vec<AttentionSignal>,
    pub diagnostics: Vec<String>,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AttentionSourceState {
    Observed,
    NotRunning,
    NotExposed,
    Error,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttentionSourceObservation {
    pub source_key: String,
    pub display_name: String,
    pub state: AttentionSourceState,
    pub signals: Vec<AttentionSignal>,
    pub diagnostics: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
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
    pub inferred: bool,
    pub meaning: String,
    pub diagnostics: Vec<String>,
}

#[cfg(target_os = "windows")]
pub async fn get_snapshot() -> AttentionSignalSnapshot {
    match tauri::async_runtime::spawn_blocking(windows_adapter::get_snapshot).await {
        Ok(snapshot) => snapshot,
        Err(error) => AttentionSignalSnapshot {
            captured_at: String::new(),
            sources: failed_sources(format!(
                "The attention-signal snapshot task could not complete: {error}"
            )),
            signals: Vec::new(),
            diagnostics: vec![format!(
                "The attention-signal snapshot task could not complete: {error}"
            )],
        },
    }
}

#[cfg(not(target_os = "windows"))]
pub async fn get_snapshot() -> AttentionSignalSnapshot {
    let diagnostic = "Persistent attention signals are only available on Windows.".to_owned();
    AttentionSignalSnapshot {
        captured_at: String::new(),
        sources: source_definitions()
            .into_iter()
            .map(|(source_key, display_name)| AttentionSourceObservation {
                source_key: source_key.into(),
                display_name: display_name.into(),
                state: AttentionSourceState::NotExposed,
                signals: Vec::new(),
                diagnostics: vec![diagnostic.clone()],
            })
            .collect(),
        signals: Vec::new(),
        diagnostics: vec![diagnostic],
    }
}

fn source_definitions() -> [(&'static str, &'static str); 3] {
    [
        ("telegram", "Telegram"),
        ("outlook", "Microsoft Outlook"),
        ("teams", "Microsoft Teams"),
    ]
}

fn failed_sources(diagnostic: String) -> Vec<AttentionSourceObservation> {
    source_definitions()
        .into_iter()
        .map(|(source_key, display_name)| AttentionSourceObservation {
            source_key: source_key.into(),
            display_name: display_name.into(),
            state: AttentionSourceState::Error,
            signals: Vec::new(),
            diagnostics: vec![diagnostic.clone()],
        })
        .collect()
}
