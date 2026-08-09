use serde::Serialize;

#[cfg(target_os = "windows")]
mod teams_probe;
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamsAccessibilityProbeSnapshot {
    pub captured_at: String,
    pub process_found: bool,
    pub windows_scanned: u32,
    pub elements_scanned: u32,
    pub total_candidates: u32,
    pub candidates_truncated: bool,
    pub candidates: Vec<TeamsAccessibilityCandidate>,
    pub diagnostics: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamsAccessibilityCandidate {
    pub property: String,
    pub relevance: String,
    pub matched_keywords: Vec<String>,
    pub numeric_tokens: Vec<u32>,
    pub aria_keys: Vec<String>,
    pub value_length: u32,
    pub automation_id_present: bool,
    pub automation_id_length: u32,
    pub control_type: i32,
    pub is_offscreen: Option<bool>,
    pub bounds: Option<TeamsAccessibilityBounds>,
    pub patterns: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamsAccessibilityBounds {
    pub left: i32,
    pub top: i32,
    pub width: i32,
    pub height: i32,
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

#[cfg(target_os = "windows")]
pub async fn get_teams_accessibility_probe() -> TeamsAccessibilityProbeSnapshot {
    match tauri::async_runtime::spawn_blocking(teams_probe::get_probe).await {
        Ok(snapshot) => snapshot,
        Err(error) => TeamsAccessibilityProbeSnapshot {
            captured_at: String::new(),
            process_found: false,
            windows_scanned: 0,
            elements_scanned: 0,
            total_candidates: 0,
            candidates_truncated: false,
            candidates: Vec::new(),
            diagnostics: vec![format!(
                "The Teams accessibility probe task could not complete: {error}"
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

#[cfg(not(target_os = "windows"))]
pub async fn get_teams_accessibility_probe() -> TeamsAccessibilityProbeSnapshot {
    TeamsAccessibilityProbeSnapshot {
        captured_at: String::new(),
        process_found: false,
        windows_scanned: 0,
        elements_scanned: 0,
        total_candidates: 0,
        candidates_truncated: false,
        candidates: Vec::new(),
        diagnostics: vec!["The Teams accessibility probe is only available on Windows.".into()],
    }
}
