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
pub async fn get_snapshot(source_keys: Vec<String>) -> Result<AttentionSignalSnapshot, String> {
    let source_keys = normalize_source_keys(source_keys)?;
    let failure_keys = source_keys.clone();
    match tauri::async_runtime::spawn_blocking(move || windows_adapter::get_snapshot(&source_keys))
        .await
    {
        Ok(snapshot) => Ok(snapshot),
        Err(error) => Ok(AttentionSignalSnapshot {
            captured_at: String::new(),
            sources: failed_sources(
                &failure_keys,
                format!("The attention-signal snapshot task could not complete: {error}"),
            ),
            signals: Vec::new(),
            diagnostics: vec![format!(
                "The attention-signal snapshot task could not complete: {error}"
            )],
        }),
    }
}

#[cfg(not(target_os = "windows"))]
pub async fn get_snapshot(source_keys: Vec<String>) -> Result<AttentionSignalSnapshot, String> {
    let source_keys = normalize_source_keys(source_keys)?;
    let diagnostic = "Persistent attention signals are only available on Windows.".to_owned();
    Ok(AttentionSignalSnapshot {
        captured_at: String::new(),
        sources: source_definitions()
            .into_iter()
            .filter(|(source_key, _)| source_is_selected(&source_keys, source_key))
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
    })
}

fn source_definitions() -> [(&'static str, &'static str); 6] {
    [
        ("telegram", "Telegram"),
        ("outlook", "Microsoft Outlook"),
        ("teams", "Microsoft Teams"),
        ("slack", "Slack"),
        ("viber", "Viber"),
        ("whatsapp", "WhatsApp"),
    ]
}

fn normalize_source_keys(source_keys: Vec<String>) -> Result<Vec<String>, String> {
    let mut normalized = Vec::new();
    for source_key in source_keys {
        if !source_definitions()
            .iter()
            .any(|(supported_key, _)| *supported_key == source_key)
        {
            return Err(format!("Unsupported attention source: {source_key}"));
        }
        if !normalized.contains(&source_key) {
            normalized.push(source_key);
        }
    }
    Ok(normalized)
}

fn source_is_selected(source_keys: &[String], source_key: &str) -> bool {
    source_keys.iter().any(|key| key == source_key)
}

fn failed_sources(source_keys: &[String], diagnostic: String) -> Vec<AttentionSourceObservation> {
    source_definitions()
        .into_iter()
        .filter(|(source_key, _)| source_is_selected(source_keys, source_key))
        .map(|(source_key, display_name)| AttentionSourceObservation {
            source_key: source_key.into(),
            display_name: display_name.into(),
            state: AttentionSourceState::Error,
            signals: Vec::new(),
            diagnostics: vec![diagnostic.clone()],
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{failed_sources, normalize_source_keys, source_is_selected};

    #[test]
    fn source_selection_is_bounded_and_deduplicated() {
        assert_eq!(
            normalize_source_keys(vec!["teams".into(), "teams".into(), "whatsapp".into()]).unwrap(),
            vec!["teams".to_owned(), "whatsapp".to_owned()]
        );
        assert!(normalize_source_keys(vec!["unsupported".into()]).is_err());
        assert!(normalize_source_keys(Vec::new()).unwrap().is_empty());
        assert!(source_is_selected(&["outlook".into()], "outlook"));
        assert!(!source_is_selected(&["outlook".into()], "teams"));
        let failed = failed_sources(&["outlook".into()], "test failure".into());
        assert_eq!(failed.len(), 1);
        assert_eq!(failed[0].source_key, "outlook");
    }
}
