#[cfg(target_os = "windows")]
mod credential_store_windows;

use crate::published_ics::{
    self, EventSelection, PublishedIcsProbeStatus, PublishedIcsSemanticProbe,
    PublishedIcsStopReason,
};
use serde::Serialize;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

const SOURCE_IDENTITY_STATE: &str = "userSavedSinglePublishedCalendarTitleCapable";
const GATE_WAIT: Duration = Duration::from_secs(1);

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkCalendarStatus {
    Observed,
    NotConfigured,
    Unavailable,
    Busy,
    Error,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkCalendarConfiguration {
    pub configured: bool,
    pub storage_available: bool,
    pub source_identity_state: &'static str,
    pub diagnostics: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkCalendarSnapshot {
    pub status: WorkCalendarStatus,
    pub configured: bool,
    pub storage_available: bool,
    pub source_identity_state: &'static str,
    pub captured_at_unix_ms: u64,
    pub selection: Option<EventSelection>,
    pub next_selection: Option<EventSelection>,
    pub stop_reason: Option<PublishedIcsStopReason>,
    pub request_ms: u64,
    pub parse_ms: u64,
    pub diagnostics: Vec<String>,
}

pub struct WorkCalendarState {
    request_gate: Mutex<()>,
}

impl WorkCalendarState {
    pub fn new() -> Self {
        Self {
            request_gate: Mutex::new(()),
        }
    }
}

pub fn get_configuration() -> WorkCalendarConfiguration {
    match credential_store::read() {
        Ok(mut secret) => {
            let configured = secret.is_some();
            if let Some(value) = secret.as_mut() {
                zero_string(value);
            }
            WorkCalendarConfiguration {
                configured,
                storage_available: true,
                source_identity_state: SOURCE_IDENTITY_STATE,
                diagnostics: vec![if configured {
                    "One published work-calendar source is stored for this Windows user.".to_owned()
                } else {
                    "No published work-calendar source is stored.".to_owned()
                }],
            }
        }
        Err(_) => WorkCalendarConfiguration {
            configured: false,
            storage_available: false,
            source_identity_state: SOURCE_IDENTITY_STATE,
            diagnostics: vec![
                "Windows Credential Manager could not read the work-calendar source.".to_owned(),
            ],
        },
    }
}

pub async fn save_source(
    state: &WorkCalendarState,
    mut published_url: String,
    title_capability_confirmed: bool,
) -> WorkCalendarSnapshot {
    let _guard = state.request_gate.lock().await;
    let probe = published_ics::get_semantic_probe_with_deadline(
        published_url.clone(),
        title_capability_confirmed,
    )
    .await;

    if !matches!(probe.status, PublishedIcsProbeStatus::Observed)
        || !probe.semantic_extraction_allowed
        || probe.selection.is_none()
    {
        zero_string(&mut published_url);
        return snapshot_from_probe(probe, get_configuration().configured);
    }

    let write_result = credential_store::write(&published_url);
    zero_string(&mut published_url);
    match write_result {
        Ok(()) => snapshot_from_probe(probe, true),
        Err(_) => WorkCalendarSnapshot {
            status: WorkCalendarStatus::Error,
            configured: get_configuration().configured,
            storage_available: false,
            source_identity_state: SOURCE_IDENTITY_STATE,
            captured_at_unix_ms: now_unix_ms(),
            selection: None,
            next_selection: None,
            stop_reason: None,
            request_ms: probe.request_ms,
            parse_ms: probe.parse_ms,
            diagnostics: vec![
                "The verified calendar source could not be saved in Windows Credential Manager."
                    .to_owned(),
            ],
        },
    }
}

pub async fn get_snapshot(state: &WorkCalendarState) -> WorkCalendarSnapshot {
    let guard = match tokio::time::timeout(GATE_WAIT, state.request_gate.lock()).await {
        Ok(guard) => guard,
        Err(_) => {
            let configuration = get_configuration();
            return WorkCalendarSnapshot {
                status: WorkCalendarStatus::Busy,
                configured: configuration.configured,
                storage_available: configuration.storage_available,
                source_identity_state: SOURCE_IDENTITY_STATE,
                captured_at_unix_ms: now_unix_ms(),
                selection: None,
                next_selection: None,
                stop_reason: None,
                request_ms: 0,
                parse_ms: 0,
                diagnostics: vec![
                    "Another bounded work-calendar request is already in progress.".to_owned(),
                ],
            };
        }
    };

    let published_url = match credential_store::read() {
        Ok(Some(secret)) => secret,
        Ok(None) => {
            drop(guard);
            return WorkCalendarSnapshot {
                status: WorkCalendarStatus::NotConfigured,
                configured: false,
                storage_available: true,
                source_identity_state: SOURCE_IDENTITY_STATE,
                captured_at_unix_ms: now_unix_ms(),
                selection: None,
                next_selection: None,
                stop_reason: None,
                request_ms: 0,
                parse_ms: 0,
                diagnostics: vec!["No saved work-calendar source is configured.".to_owned()],
            };
        }
        Err(_) => {
            drop(guard);
            return WorkCalendarSnapshot {
                status: WorkCalendarStatus::Error,
                configured: false,
                storage_available: false,
                source_identity_state: SOURCE_IDENTITY_STATE,
                captured_at_unix_ms: now_unix_ms(),
                selection: None,
                next_selection: None,
                stop_reason: None,
                request_ms: 0,
                parse_ms: 0,
                diagnostics: vec![
                    "Windows Credential Manager could not read the work-calendar source."
                        .to_owned(),
                ],
            };
        }
    };

    let probe = published_ics::get_semantic_probe_with_deadline(published_url, true).await;
    drop(guard);
    snapshot_from_probe(probe, true)
}

pub async fn remove_source(state: &WorkCalendarState) -> WorkCalendarConfiguration {
    let _guard = state.request_gate.lock().await;
    match credential_store::delete() {
        Ok(()) => WorkCalendarConfiguration {
            configured: false,
            storage_available: true,
            source_identity_state: SOURCE_IDENTITY_STATE,
            diagnostics: vec!["The saved work-calendar source was removed.".to_owned()],
        },
        Err(_) => WorkCalendarConfiguration {
            configured: get_configuration().configured,
            storage_available: false,
            source_identity_state: SOURCE_IDENTITY_STATE,
            diagnostics: vec![
                "Windows Credential Manager could not remove the work-calendar source.".to_owned(),
            ],
        },
    }
}

pub fn log_snapshot(action: &str, snapshot: &WorkCalendarSnapshot) {
    eprintln!(
        "work calendar {action}: status={:?}, configured={}, storage_available={}, selection_present={}, next_selection_present={}, stop_reason={:?}, timing_ms={}/{}",
        snapshot.status,
        snapshot.configured,
        snapshot.storage_available,
        snapshot.selection.is_some(),
        snapshot.next_selection.is_some(),
        snapshot.stop_reason,
        snapshot.request_ms,
        snapshot.parse_ms,
    );
}

fn snapshot_from_probe(
    mut probe: PublishedIcsSemanticProbe,
    configured: bool,
) -> WorkCalendarSnapshot {
    let status = match probe.status {
        PublishedIcsProbeStatus::Observed
            if probe.semantic_extraction_allowed && probe.selection.is_some() =>
        {
            WorkCalendarStatus::Observed
        }
        PublishedIcsProbeStatus::Error => WorkCalendarStatus::Error,
        _ => WorkCalendarStatus::Unavailable,
    };
    if !matches!(status, WorkCalendarStatus::Observed) {
        probe.selection = None;
        probe.next_selection = None;
    }
    WorkCalendarSnapshot {
        status,
        configured,
        storage_available: true,
        source_identity_state: SOURCE_IDENTITY_STATE,
        captured_at_unix_ms: probe.captured_at_unix_ms,
        selection: probe.selection,
        next_selection: probe.next_selection,
        stop_reason: probe.stop_reason,
        request_ms: probe.request_ms,
        parse_ms: probe.parse_ms,
        diagnostics: probe.diagnostics,
    }
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn zero_string(value: &mut str) {
    unsafe { value.as_bytes_mut() }.fill(0);
}

#[cfg(target_os = "windows")]
mod credential_store {
    pub use super::credential_store_windows::{delete, read, write};
}

#[cfg(not(target_os = "windows"))]
mod credential_store {
    pub fn read() -> Result<Option<String>, ()> {
        Err(())
    }

    pub fn write(_published_url: &str) -> Result<(), ()> {
        Err(())
    }

    pub fn delete() -> Result<(), ()> {
        Err(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::published_ics::{PublishedIcsContentTypeState, PublishedIcsProbeStatus};

    #[test]
    fn unavailable_probe_never_exposes_a_selection() {
        let probe = PublishedIcsSemanticProbe::command_deadline(true);
        let snapshot = snapshot_from_probe(probe, true);

        assert!(matches!(snapshot.status, WorkCalendarStatus::Unavailable));
        assert!(snapshot.selection.is_none());
        assert!(snapshot.next_selection.is_none());
        assert!(snapshot.configured);
    }

    #[test]
    fn observed_status_requires_a_selection() {
        let probe = PublishedIcsSemanticProbe {
            status: PublishedIcsProbeStatus::Observed,
            captured_at_unix_ms: 1,
            url_accepted: true,
            webcal_normalized_to_https: false,
            source_identity_state: "test",
            semantic_extraction_allowed: true,
            title_capability_confirmed: true,
            http_status: Some(200),
            content_type_state: PublishedIcsContentTypeState::Calendar,
            response_bytes: 1,
            request_ms: 1,
            parse_ms: 1,
            eligible_candidate_count: 0,
            active_candidate_count: 0,
            expanded_occurrence_count: 0,
            private_title_redacted: false,
            selection: None,
            next_selection: None,
            stop_reason: None,
            diagnostics: Vec::new(),
        };
        let snapshot = snapshot_from_probe(probe, true);

        assert!(matches!(snapshot.status, WorkCalendarStatus::Unavailable));
        assert!(snapshot.selection.is_none());
    }
}
