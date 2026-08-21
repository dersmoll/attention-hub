#[cfg(target_os = "windows")]
mod credential_store_windows;

use crate::published_ics::{
    self, EventClassification, EventSelection, PublishedIcsProbeStatus, PublishedIcsSemanticProbe,
    PublishedIcsStopReason,
};
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::Mutex as StdMutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
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
    pub selection: Option<WorkCalendarSelection>,
    pub overlapping_selections: Vec<WorkCalendarSelection>,
    pub next_selection: Option<WorkCalendarSelection>,
    pub stop_reason: Option<PublishedIcsStopReason>,
    pub request_ms: u64,
    pub parse_ms: u64,
    pub diagnostics: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkCalendarSelection {
    pub subject: String,
    pub start: String,
    pub end: String,
    pub all_day: bool,
    pub classification: EventClassification,
    pub meeting_link_present: Option<bool>,
    pub join_token: Option<String>,
}

#[derive(Default)]
struct JoinTargetCache {
    next_token: u64,
    targets: HashMap<String, String>,
}

pub struct WorkCalendarState {
    request_gate: Mutex<()>,
    join_targets: StdMutex<JoinTargetCache>,
}

impl WorkCalendarState {
    pub fn new() -> Self {
        Self {
            request_gate: Mutex::new(()),
            join_targets: StdMutex::new(JoinTargetCache::default()),
        }
    }

    fn clear_join_targets(&self) {
        if let Ok(mut cache) = self.join_targets.lock() {
            cache.targets.clear();
        }
    }

    fn expose_selections(
        &self,
        selection: Option<EventSelection>,
        overlapping_selections: Vec<EventSelection>,
        next_selection: Option<EventSelection>,
    ) -> (
        Option<WorkCalendarSelection>,
        Vec<WorkCalendarSelection>,
        Option<WorkCalendarSelection>,
    ) {
        let Ok(mut cache) = self.join_targets.lock() else {
            return (
                selection.map(|value| WorkCalendarSelection::from_event(value, None)),
                overlapping_selections
                    .into_iter()
                    .map(|value| WorkCalendarSelection::from_event(value, None))
                    .collect(),
                next_selection.map(|value| WorkCalendarSelection::from_event(value, None)),
            );
        };
        cache.targets.clear();
        let mut expose = |event: EventSelection| {
            let token = event.meeting_url.as_ref().map(|url| {
                cache.next_token = cache.next_token.wrapping_add(1);
                let token = format!("join-{}", cache.next_token);
                cache.targets.insert(token.clone(), url.clone());
                token
            });
            WorkCalendarSelection::from_event(event, token)
        };
        let selection = selection.map(&mut expose);
        let overlapping_selections = overlapping_selections
            .into_iter()
            .map(&mut expose)
            .collect();
        let next_selection = next_selection.map(expose);
        (selection, overlapping_selections, next_selection)
    }
}

impl WorkCalendarSelection {
    fn from_event(event: EventSelection, join_token: Option<String>) -> Self {
        Self {
            subject: event.subject,
            start: event.start,
            end: event.end,
            all_day: event.all_day,
            classification: event.classification,
            meeting_link_present: event.meeting_link_present,
            join_token,
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
        return snapshot_from_probe(state, probe, get_configuration().configured);
    }

    let write_result = credential_store::write(&published_url);
    zero_string(&mut published_url);
    match write_result {
        Ok(()) => snapshot_from_probe(state, probe, true),
        Err(_) => {
            state.clear_join_targets();
            WorkCalendarSnapshot {
                status: WorkCalendarStatus::Error,
                configured: get_configuration().configured,
                storage_available: false,
                source_identity_state: SOURCE_IDENTITY_STATE,
                captured_at_unix_ms: now_unix_ms(),
                selection: None,
                overlapping_selections: Vec::new(),
                next_selection: None,
                stop_reason: None,
                request_ms: probe.request_ms,
                parse_ms: probe.parse_ms,
                diagnostics: vec![
                    "The verified calendar source could not be saved in Windows Credential Manager."
                        .to_owned(),
                ],
            }
        }
    }
}

pub async fn get_snapshot(state: &WorkCalendarState) -> WorkCalendarSnapshot {
    let guard = match tokio::time::timeout(GATE_WAIT, state.request_gate.lock()).await {
        Ok(guard) => guard,
        Err(_) => {
            let configuration = get_configuration();
            state.clear_join_targets();
            return WorkCalendarSnapshot {
                status: WorkCalendarStatus::Busy,
                configured: configuration.configured,
                storage_available: configuration.storage_available,
                source_identity_state: SOURCE_IDENTITY_STATE,
                captured_at_unix_ms: now_unix_ms(),
                selection: None,
                overlapping_selections: Vec::new(),
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
            state.clear_join_targets();
            return WorkCalendarSnapshot {
                status: WorkCalendarStatus::NotConfigured,
                configured: false,
                storage_available: true,
                source_identity_state: SOURCE_IDENTITY_STATE,
                captured_at_unix_ms: now_unix_ms(),
                selection: None,
                overlapping_selections: Vec::new(),
                next_selection: None,
                stop_reason: None,
                request_ms: 0,
                parse_ms: 0,
                diagnostics: vec!["No saved work-calendar source is configured.".to_owned()],
            };
        }
        Err(_) => {
            drop(guard);
            state.clear_join_targets();
            return WorkCalendarSnapshot {
                status: WorkCalendarStatus::Error,
                configured: false,
                storage_available: false,
                source_identity_state: SOURCE_IDENTITY_STATE,
                captured_at_unix_ms: now_unix_ms(),
                selection: None,
                overlapping_selections: Vec::new(),
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
    snapshot_from_probe(state, probe, true)
}

pub async fn remove_source(state: &WorkCalendarState) -> WorkCalendarConfiguration {
    let _guard = state.request_gate.lock().await;
    state.clear_join_targets();
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

pub fn join_url(state: &WorkCalendarState, join_token: &str) -> Result<String, String> {
    if join_token.len() > 64 || !join_token.starts_with("join-") {
        return Err("The meeting link token is invalid or expired.".to_owned());
    }
    state
        .join_targets
        .lock()
        .map_err(|_| "The work-calendar link cache is temporarily unavailable.".to_owned())?
        .targets
        .get(join_token)
        .cloned()
        .ok_or_else(|| {
            "The meeting link is no longer current. Wait for calendar refresh.".to_owned()
        })
}

fn snapshot_from_probe(
    state: &WorkCalendarState,
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
        probe.overlapping_selections.clear();
        probe.next_selection = None;
    }
    let (selection, overlapping_selections, next_selection) = state.expose_selections(
        probe.selection,
        probe.overlapping_selections,
        probe.next_selection,
    );
    WorkCalendarSnapshot {
        status,
        configured,
        storage_available: true,
        source_identity_state: SOURCE_IDENTITY_STATE,
        captured_at_unix_ms: probe.captured_at_unix_ms,
        selection,
        overlapping_selections,
        next_selection,
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
        let state = WorkCalendarState::new();
        let probe = PublishedIcsSemanticProbe::command_deadline(true);
        let snapshot = snapshot_from_probe(&state, probe, true);

        assert!(matches!(snapshot.status, WorkCalendarStatus::Unavailable));
        assert!(snapshot.selection.is_none());
        assert!(snapshot.next_selection.is_none());
        assert!(snapshot.configured);
    }

    #[test]
    fn observed_status_requires_a_selection() {
        let state = WorkCalendarState::new();
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
            overlapping_selections: Vec::new(),
            next_selection: None,
            stop_reason: None,
            diagnostics: Vec::new(),
        };
        let snapshot = snapshot_from_probe(&state, probe, true);

        assert!(matches!(snapshot.status, WorkCalendarStatus::Unavailable));
        assert!(snapshot.selection.is_none());
    }

    #[test]
    fn exposes_only_an_ephemeral_token_for_an_allowlisted_join_url() {
        let state = WorkCalendarState::new();
        let event = EventSelection {
            subject: "Joinable meeting".into(),
            start: "2026-08-17T12:00:00Z".into(),
            end: "2026-08-17T13:00:00Z".into(),
            all_day: false,
            classification: EventClassification::Upcoming,
            meeting_link_present: Some(true),
            meeting_url: Some("https://teams.microsoft.com/l/meetup-join/opaque-token".into()),
        };
        let overlapping_event = EventSelection {
            subject: "Overlapping meeting".into(),
            start: "2026-08-17T11:30:00Z".into(),
            end: "2026-08-17T12:30:00Z".into(),
            all_day: false,
            classification: EventClassification::Active,
            meeting_link_present: Some(true),
            meeting_url: Some(
                "https://teams.microsoft.com/l/meetup-join/second-opaque-token".into(),
            ),
        };

        let (selection, overlapping, next) =
            state.expose_selections(Some(event), vec![overlapping_event], None);
        assert_eq!(overlapping.len(), 1);
        assert!(next.is_none());
        let selection = selection.unwrap();
        let token = selection.join_token.as_deref().unwrap();
        let overlapping_token = overlapping[0].join_token.as_deref().unwrap();
        assert_ne!(token, overlapping_token);
        assert_eq!(
            join_url(&state, token).unwrap(),
            "https://teams.microsoft.com/l/meetup-join/opaque-token"
        );
        assert_eq!(
            join_url(&state, overlapping_token).unwrap(),
            "https://teams.microsoft.com/l/meetup-join/second-opaque-token"
        );
        let serialized = serde_json::to_string(&selection).unwrap();
        let overlapping_serialized = serde_json::to_string(&overlapping).unwrap();
        assert!(serialized.contains(token));
        assert!(!serialized.contains("meetup-join"));
        assert!(!serialized.contains("opaque-token"));
        assert!(overlapping_serialized.contains(overlapping_token));
        assert!(!overlapping_serialized.contains("meetup-join"));
        assert!(!overlapping_serialized.contains("second-opaque-token"));
    }
}
