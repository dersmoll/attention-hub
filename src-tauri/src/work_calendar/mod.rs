#[cfg(target_os = "windows")]
mod credential_store_windows;

use crate::published_ics::{
    self, DayEventSelection, EventClassification, EventSelection, MeetingProvider,
    PublishedIcsProbeStatus, PublishedIcsSemanticProbe, PublishedIcsStopReason,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
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
    pub day_selections: Vec<WorkCalendarDaySelection>,
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
    pub meeting_provider: Option<MeetingProvider>,
    pub join_token: Option<String>,
    pub event_token: Option<String>,
    pub event_workspace: Option<EventWorkspaceSummary>,
    #[serde(skip_serializing)]
    pub(crate) workspace_key: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkCalendarDaySelection {
    pub subject: String,
    pub start: String,
    pub end: String,
    pub all_day: bool,
    pub cancelled: bool,
    pub recurring: bool,
    pub event_token: Option<String>,
    pub event_workspace: Option<EventWorkspaceSummary>,
    #[serde(skip_serializing)]
    pub(crate) workspace_key: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventWorkspaceSummary {
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub notes_present: bool,
    pub link_url_present: bool,
    pub link_url: Option<String>,
}

/// How long an issued join token stays redeemable after the most recent
/// snapshot that still contained its meeting.
///
/// Expiry is measured in elapsed time, never in how many snapshots have been
/// taken since. Advanced and the widget refresh independently, so a
/// count-based window made a displayed Join button's lifetime depend on how
/// often *another* window happened to poll: two Advanced refreshes retired a
/// token the widget was still showing, and pressing it reported an expired
/// link. Counting generations only moved that failure to the third refresh.
///
/// A meeting that is still in the feed keeps its existing token, so refreshing
/// more often can only extend a token's life, never shorten it. A meeting that
/// leaves the feed takes its token with it once this window elapses.
const JOIN_TOKEN_TTL_MS: u64 = TOKEN_SURVIVES_MISSED_POLLS * WIDGET_CALENDAR_POLL_INTERVAL_MS;

/// How many consecutive calendar polls a displayed token must outlive.
///
/// The TTL is derived from the poll interval rather than chosen independently:
/// a token that expires faster than the surface holding it can refresh would
/// reproduce the original failure from the opposite direction.
const TOKEN_SURVIVES_MISSED_POLLS: u64 = 8;

/// The widget's own calendar poll interval, mirrored from
/// `WORK_CALENDAR_POLL_INTERVAL_MS` in `src/work-calendar-model.ts`.
///
/// The TTL above is only honest if it comfortably exceeds the interval at which
/// the surface holding a token refreshes it; otherwise a token expires while
/// still on screen and we have merely swapped one failure for its mirror image.
/// The compile-time assertion below enforces the relationship here, and
/// `scripts/test-work-calendar-model.mjs` fails if this mirror drifts from the
/// frontend constant.
const WIDGET_CALENDAR_POLL_INTERVAL_MS: u64 = 120_000;

/// A displayed token must survive several missed calendar polls.
///
/// Both sides are constants, so this is checked when the crate is built rather
/// than when tests run — a runtime `assert!` on constants proves nothing at the
/// moment it matters, and Clippy rightly rejects one.
const _: () = assert!(JOIN_TOKEN_TTL_MS >= 5 * WIDGET_CALENDAR_POLL_INTERVAL_MS);

/// Safety net only. A snapshot exposes at most an active selection, one
/// overlapping event and one upcoming event, so the live set is a handful of
/// entries; this bounds the map if that ever stops being true.
const MAX_RETAINED_TOKENS: usize = 64;

struct JoinTarget {
    /// When the most recent snapshot containing this meeting was taken.
    last_seen_unix_ms: u64,
    url: String,
}

#[derive(Default)]
struct JoinTargetCache {
    next_token: u64,
    /// The source these tokens belong to. A different source invalidates every
    /// token immediately rather than waiting for the TTL.
    source_scope: Option<String>,
    /// token -> target
    targets: HashMap<String, JoinTarget>,
    /// occurrence key -> token, so a meeting that is still on screen keeps the
    /// token the screen is holding.
    tokens_by_occurrence: HashMap<String, String>,
}

/// Identity for token reuse: which source, which series, which occurrence.
///
/// Recurring meetings share one joining URL across every occurrence, so the URL
/// alone cannot distinguish this lesson from next week's. The occurrence start
/// is enough here and is deliberately *not* the reschedule-stable recurrence
/// anchor a persistent per-occurrence override would need: a token dying because
/// its occurrence moved is correct for an ephemeral handle.
fn occurrence_key(source_scope: Option<&str>, series_uid: &str, start: &str) -> String {
    format!(
        "{}\u{0}{series_uid}\u{0}{start}",
        source_scope.unwrap_or("")
    )
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
            cache.tokens_by_occurrence.clear();
            cache.source_scope = None;
        }
    }

    fn expose_selections(
        &self,
        selection: Option<EventSelection>,
        overlapping_selections: Vec<EventSelection>,
        next_selection: Option<EventSelection>,
        source_scope: Option<&str>,
    ) -> (
        Option<WorkCalendarSelection>,
        Vec<WorkCalendarSelection>,
        Option<WorkCalendarSelection>,
    ) {
        self.expose_selections_at(
            now_unix_ms(),
            selection,
            overlapping_selections,
            next_selection,
            source_scope,
        )
    }

    fn expose_selections_at(
        &self,
        now_unix_ms: u64,
        selection: Option<EventSelection>,
        overlapping_selections: Vec<EventSelection>,
        next_selection: Option<EventSelection>,
        source_scope: Option<&str>,
    ) -> (
        Option<WorkCalendarSelection>,
        Vec<WorkCalendarSelection>,
        Option<WorkCalendarSelection>,
    ) {
        let Ok(mut cache) = self.join_targets.lock() else {
            return (
                selection.map(|value| WorkCalendarSelection::from_event(value, None, source_scope)),
                overlapping_selections
                    .into_iter()
                    .map(|value| WorkCalendarSelection::from_event(value, None, source_scope))
                    .collect(),
                next_selection
                    .map(|value| WorkCalendarSelection::from_event(value, None, source_scope)),
            );
        };
        let cache = &mut *cache;
        // A different source is a different set of meetings. Discard every token
        // at once rather than letting the previous source's links stay
        // redeemable for the remainder of their TTL.
        if cache.source_scope.as_deref() != source_scope {
            cache.targets.clear();
            cache.tokens_by_occurrence.clear();
            cache.source_scope = source_scope.map(str::to_owned);
        }
        // Drop what has aged out. Nothing here depends on how many snapshots
        // have been taken, so another window's refresh rate cannot retire a
        // token this one is still displaying.
        cache.targets.retain(|_, target| {
            now_unix_ms.saturating_sub(target.last_seen_unix_ms) < JOIN_TOKEN_TTL_MS
        });
        cache
            .tokens_by_occurrence
            .retain(|_, token| cache.targets.contains_key(token));
        let mut expose = |event: EventSelection| {
            let token = event.meeting_url.as_ref().map(|url| {
                let key = occurrence_key(source_scope, &event.series_uid, &event.start);
                // Reuse the token this occurrence already has, so a surface
                // still showing it keeps working. The stored URL is refreshed
                // from the feed, which stays authoritative if the meeting's
                // joining link changes.
                if let Some(existing) = cache
                    .tokens_by_occurrence
                    .get(&key)
                    .filter(|token| cache.targets.contains_key(*token))
                    .cloned()
                {
                    cache.targets.insert(
                        existing.clone(),
                        JoinTarget {
                            last_seen_unix_ms: now_unix_ms,
                            url: url.clone(),
                        },
                    );
                    return existing;
                }
                cache.next_token = cache.next_token.wrapping_add(1);
                let token = format!("join-{}", cache.next_token);
                cache.targets.insert(
                    token.clone(),
                    JoinTarget {
                        last_seen_unix_ms: now_unix_ms,
                        url: url.clone(),
                    },
                );
                cache.tokens_by_occurrence.insert(key, token.clone());
                token
            });
            WorkCalendarSelection::from_event(event, token, source_scope)
        };
        let selection = selection.map(&mut expose);
        let overlapping_selections = overlapping_selections
            .into_iter()
            .map(&mut expose)
            .collect();
        let next_selection = next_selection.map(expose);
        // Never let the cache grow without bound. Evicting the least recently
        // seen first keeps whatever this snapshot just exposed, which is what
        // any surface is about to display.
        if cache.targets.len() > MAX_RETAINED_TOKENS {
            let mut by_age = cache
                .targets
                .iter()
                .map(|(token, target)| (target.last_seen_unix_ms, token.clone()))
                .collect::<Vec<_>>();
            by_age.sort_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(&right.1)));
            for (_, token) in by_age
                .into_iter()
                .take(cache.targets.len() - MAX_RETAINED_TOKENS)
            {
                cache.targets.remove(&token);
            }
            cache
                .tokens_by_occurrence
                .retain(|_, token| cache.targets.contains_key(token));
        }
        (selection, overlapping_selections, next_selection)
    }
}

impl WorkCalendarSelection {
    fn from_event(
        event: EventSelection,
        join_token: Option<String>,
        source_scope: Option<&str>,
    ) -> Self {
        let meeting_provider = event
            .meeting_provider
            .or_else(|| classify_meeting_provider(event.meeting_url.as_deref()));
        let workspace_key = event_workspace_key(
            source_scope,
            &event.series_uid,
            event.recurring,
            event.private,
        );
        Self {
            subject: event.subject,
            start: event.start,
            end: event.end,
            all_day: event.all_day,
            classification: event.classification,
            meeting_link_present: event.meeting_link_present,
            meeting_provider,
            join_token,
            event_token: None,
            event_workspace: None,
            workspace_key,
        }
    }
}

fn classify_meeting_provider(meeting_url: Option<&str>) -> Option<MeetingProvider> {
    let host = meeting_url
        .and_then(|value| reqwest::Url::parse(value).ok())
        .and_then(|url| url.host_str().map(str::to_ascii_lowercase))?;
    match host.as_str() {
        "teams.microsoft.com" | "teams.live.com" | "teams.cloud.microsoft" => {
            Some(MeetingProvider::Teams)
        }
        "zoom.us" => Some(MeetingProvider::Zoom),
        _ if host.ends_with(".zoom.us") => Some(MeetingProvider::Zoom),
        _ => None,
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
    let source_scope = calendar_source_scope(&published_url);
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
        return snapshot_from_probe(
            state,
            probe,
            get_configuration().configured,
            Some(&source_scope),
        );
    }

    let write_result = credential_store::write(&published_url);
    zero_string(&mut published_url);
    match write_result {
        Ok(()) => snapshot_from_probe(state, probe, true, Some(&source_scope)),
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
                day_selections: Vec::new(),
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
        Err(_) => return busy_snapshot(get_configuration()),
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
                day_selections: Vec::new(),
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
                day_selections: Vec::new(),
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

    let source_scope = calendar_source_scope(&published_url);
    let probe = published_ics::get_semantic_probe_with_deadline(published_url, true).await;
    drop(guard);
    snapshot_from_probe(state, probe, true, Some(&source_scope))
}

fn busy_snapshot(configuration: WorkCalendarConfiguration) -> WorkCalendarSnapshot {
    WorkCalendarSnapshot {
        status: WorkCalendarStatus::Busy,
        configured: configuration.configured,
        storage_available: configuration.storage_available,
        source_identity_state: SOURCE_IDENTITY_STATE,
        captured_at_unix_ms: now_unix_ms(),
        selection: None,
        overlapping_selections: Vec::new(),
        next_selection: None,
        day_selections: Vec::new(),
        stop_reason: None,
        request_ms: 0,
        parse_ms: 0,
        diagnostics: vec![
            "Another bounded work-calendar request is already in progress.".to_owned(),
        ],
    }
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
    let selection_provider = snapshot
        .selection
        .as_ref()
        .and_then(|event| event.meeting_provider);
    let next_provider = snapshot
        .next_selection
        .as_ref()
        .and_then(|event| event.meeting_provider);
    eprintln!(
        "work calendar {action}: status={:?}, configured={}, storage_available={}, selection_present={}, selection_provider={selection_provider:?}, next_selection_present={}, next_provider={next_provider:?}, stop_reason={:?}, timing_ms={}/{}",
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
    join_url_at(state, join_token, now_unix_ms())
}

fn join_url_at(
    state: &WorkCalendarState,
    join_token: &str,
    now_unix_ms: u64,
) -> Result<String, String> {
    if join_token.len() > 64 || !join_token.starts_with("join-") {
        return Err("The meeting link token is invalid or expired.".to_owned());
    }
    // Expiry is checked when the token is redeemed, not only when a snapshot
    // prunes: a machine that slept, or a source that stopped refreshing, must
    // not leave a stale token redeemable indefinitely.
    state
        .join_targets
        .lock()
        .map_err(|_| "The work-calendar link cache is temporarily unavailable.".to_owned())?
        .targets
        .get(join_token)
        .filter(|target| now_unix_ms.saturating_sub(target.last_seen_unix_ms) < JOIN_TOKEN_TTL_MS)
        .map(|target| target.url.clone())
        .ok_or_else(|| {
            "The meeting link is no longer current. Wait for calendar refresh.".to_owned()
        })
}

fn snapshot_from_probe(
    state: &WorkCalendarState,
    mut probe: PublishedIcsSemanticProbe,
    configured: bool,
    source_scope: Option<&str>,
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
        probe.day_selections.clear();
    }
    let (selection, overlapping_selections, next_selection) =
        if matches!(status, WorkCalendarStatus::Observed) {
            state.expose_selections(
                probe.selection,
                probe.overlapping_selections,
                probe.next_selection,
                source_scope,
            )
        } else {
            (None, Vec::new(), None)
        };
    let day_selections = probe
        .day_selections
        .into_iter()
        .map(|event| day_selection(event, source_scope))
        .collect();
    WorkCalendarSnapshot {
        status,
        configured,
        storage_available: true,
        source_identity_state: SOURCE_IDENTITY_STATE,
        captured_at_unix_ms: probe.captured_at_unix_ms,
        selection,
        overlapping_selections,
        next_selection,
        day_selections,
        stop_reason: probe.stop_reason,
        request_ms: probe.request_ms,
        parse_ms: probe.parse_ms,
        diagnostics: probe.diagnostics,
    }
}

fn day_selection(event: DayEventSelection, source_scope: Option<&str>) -> WorkCalendarDaySelection {
    let workspace_key = (!event.cancelled)
        .then(|| {
            event_workspace_key(
                source_scope,
                &event.series_uid,
                event.recurring,
                event.private,
            )
        })
        .flatten();
    WorkCalendarDaySelection {
        subject: event.subject,
        start: event.start,
        end: event.end,
        all_day: event.all_day,
        cancelled: event.cancelled,
        recurring: event.recurring,
        event_token: None,
        event_workspace: None,
        workspace_key,
    }
}

fn event_workspace_key(
    source_scope: Option<&str>,
    series_uid: &str,
    recurring: bool,
    private: bool,
) -> Option<String> {
    if private {
        return None;
    }
    source_scope.map(|scope| {
        if recurring {
            recurring_series_key(scope, series_uid)
        } else {
            single_event_key(scope, series_uid)
        }
    })
}

fn calendar_source_scope(published_url: &str) -> String {
    hex_digest([
        b"attention-hub-calendar-source-v1\0".as_slice(),
        published_url.as_bytes(),
    ])
}

fn recurring_series_key(source_scope: &str, series_uid: &str) -> String {
    hex_digest([
        b"attention-hub-recurring-series-v1\0".as_slice(),
        source_scope.as_bytes(),
        b"\0".as_slice(),
        series_uid.as_bytes(),
    ])
}

fn single_event_key(source_scope: &str, event_uid: &str) -> String {
    hex_digest([
        b"attention-hub-calendar-event-v1\0".as_slice(),
        source_scope.as_bytes(),
        b"\0".as_slice(),
        event_uid.as_bytes(),
    ])
}

fn hex_digest<const N: usize>(parts: [&[u8]; N]) -> String {
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update(part);
    }
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
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
        state.join_targets.lock().unwrap().targets.insert(
            "join-1".into(),
            JoinTarget {
                last_seen_unix_ms: now_unix_ms(),
                url: "https://teams.microsoft.com/meet/1".into(),
            },
        );
        let probe = PublishedIcsSemanticProbe::command_deadline(true);
        let snapshot = snapshot_from_probe(&state, probe, true, None);

        assert!(matches!(snapshot.status, WorkCalendarStatus::Unavailable));
        assert!(snapshot.selection.is_none());
        assert!(snapshot.next_selection.is_none());
        assert!(snapshot.configured);
        assert_eq!(
            join_url(&state, "join-1").unwrap(),
            "https://teams.microsoft.com/meet/1"
        );
    }

    #[test]
    fn busy_snapshot_keeps_existing_join_targets() {
        let state = WorkCalendarState::new();
        state.join_targets.lock().unwrap().targets.insert(
            "join-1".into(),
            JoinTarget {
                last_seen_unix_ms: now_unix_ms(),
                url: "https://teams.microsoft.com/meet/1".into(),
            },
        );

        let snapshot = busy_snapshot(WorkCalendarConfiguration {
            configured: true,
            storage_available: true,
            source_identity_state: SOURCE_IDENTITY_STATE,
            diagnostics: Vec::new(),
        });

        assert!(matches!(snapshot.status, WorkCalendarStatus::Busy));
        assert_eq!(
            snapshot.diagnostics,
            vec!["Another bounded work-calendar request is already in progress."]
        );
        assert_eq!(
            join_url(&state, "join-1").unwrap(),
            "https://teams.microsoft.com/meet/1"
        );
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
            day_selections: Vec::new(),
            stop_reason: None,
            diagnostics: Vec::new(),
        };
        let snapshot = snapshot_from_probe(&state, probe, true, None);

        assert!(matches!(snapshot.status, WorkCalendarStatus::Unavailable));
        assert!(snapshot.selection.is_none());
    }

    fn joinable_event(url: &str, uid: &str, start: &str) -> EventSelection {
        EventSelection {
            subject: "Joinable meeting".into(),
            start: start.into(),
            end: "2026-08-17T13:00:00Z".into(),
            all_day: false,
            classification: EventClassification::Upcoming,
            meeting_link_present: Some(true),
            meeting_provider: Some(MeetingProvider::Teams),
            meeting_url: Some(url.into()),
            series_uid: uid.into(),
            recurring: false,
            private: false,
        }
    }

    fn expose_one(
        state: &WorkCalendarState,
        now: u64,
        url: &str,
        uid: &str,
        start: &str,
        scope: Option<&str>,
    ) -> String {
        state
            .expose_selections_at(
                now,
                Some(joinable_event(url, uid, start)),
                vec![],
                None,
                scope,
            )
            .0
            .and_then(|selection| selection.join_token)
            .expect("a joinable event exposes a token")
    }

    /// Advanced and the widget refresh independently, so the widget can be
    /// displaying a token an earlier snapshot issued. Retiring tokens by
    /// counting snapshots made that visible Join button's lifetime depend on how
    /// often *another* window polled: two Advanced refreshes broke it, and
    /// counting further generations would only have moved the failure.
    #[test]
    fn a_join_token_outlives_any_number_of_refreshes_while_its_meeting_remains() {
        let state = WorkCalendarState::new();
        const URL: &str = "https://teams.microsoft.com/l/meetup-join/standup";
        let first = expose_one(&state, 1_000, URL, "standup", START, Some("source-a"));

        // Advanced refreshes far more often, and for far longer than the TTL.
        for step in 1..=20 {
            let again = expose_one(
                &state,
                1_000 + step * WIDGET_CALENDAR_POLL_INTERVAL_MS,
                URL,
                "standup",
                START,
                Some("source-a"),
            );
            assert_eq!(
                again, first,
                "an occurrence that is still in the feed must keep its token"
            );
        }
        let last_refresh = 1_000 + 20 * WIDGET_CALENDAR_POLL_INTERVAL_MS;
        assert_eq!(
            join_url_at(&state, &first, last_refresh).unwrap(),
            URL,
            "the still-visible Join button must keep working"
        );
    }

    const START: &str = "2026-08-17T12:00:00Z";

    /// Recurring meetings share one joining URL across every occurrence, so the
    /// URL alone cannot identify which lesson a token belongs to.
    #[test]
    fn occurrences_of_one_series_receive_distinct_tokens() {
        let state = WorkCalendarState::new();
        const URL: &str = "https://teams.microsoft.com/l/meetup-join/weekly";
        let monday = expose_one(&state, 1_000, URL, "weekly", START, Some("source-a"));
        let thursday = expose_one(
            &state,
            1_000,
            URL,
            "weekly",
            "2026-08-20T12:00:00Z",
            Some("source-a"),
        );
        assert_ne!(monday, thursday);
        assert_eq!(join_url_at(&state, &monday, 1_000).unwrap(), URL);
        assert_eq!(join_url_at(&state, &thursday, 1_000).unwrap(), URL);
    }

    /// Tokens are still ephemeral — but they expire on elapsed time, not on a
    /// snapshot count, and a meeting that is gone takes its token with it.
    #[test]
    fn a_join_token_expires_once_its_meeting_stops_appearing() {
        let state = WorkCalendarState::new();
        let gone = expose_one(
            &state,
            1_000,
            "https://teams.microsoft.com/l/meetup-join/one",
            "one",
            START,
            Some("source-a"),
        );
        // Other meetings come and go; the absent one ages out on the clock.
        let kept = expose_one(
            &state,
            1_000 + JOIN_TOKEN_TTL_MS - 1,
            "https://teams.microsoft.com/l/meetup-join/two",
            "two",
            START,
            Some("source-a"),
        );
        assert!(
            join_url_at(&state, &gone, 1_000 + JOIN_TOKEN_TTL_MS - 1).is_ok(),
            "a token must stay redeemable for its whole window"
        );
        assert!(
            join_url_at(&state, &gone, 1_000 + JOIN_TOKEN_TTL_MS).is_err(),
            "redemption must check expiry even when no snapshot has pruned yet"
        );
        assert!(join_url_at(&state, &kept, 1_000 + JOIN_TOKEN_TTL_MS).is_ok());

        // Removing or reconfiguring the source still discards everything.
        state.clear_join_targets();
        assert!(
            join_url_at(&state, &kept, 1_000 + JOIN_TOKEN_TTL_MS).is_err(),
            "clearing the cache must invalidate every token"
        );
    }

    #[test]
    fn a_changed_source_invalidates_tokens_immediately() {
        let state = WorkCalendarState::new();
        const URL: &str = "https://teams.microsoft.com/l/meetup-join/one";
        let before = expose_one(&state, 1_000, URL, "one", START, Some("source-a"));
        let after = expose_one(&state, 1_001, URL, "one", START, Some("source-b"));
        assert_ne!(before, after, "a new source must not inherit tokens");
        assert!(
            join_url_at(&state, &before, 1_001).is_err(),
            "the previous source's links must not stay redeemable for its TTL"
        );
        assert!(join_url_at(&state, &after, 1_001).is_ok());
    }

    /// The calendar stays authoritative for where a meeting is joined, so a
    /// reused token must follow the feed rather than pin the first URL seen.
    #[test]
    fn a_reused_token_follows_the_current_joining_link() {
        let state = WorkCalendarState::new();
        let token = expose_one(
            &state,
            1_000,
            "https://teams.microsoft.com/l/meetup-join/old",
            "one",
            START,
            Some("source-a"),
        );
        let again = expose_one(
            &state,
            2_000,
            "https://teams.microsoft.com/l/meetup-join/new",
            "one",
            START,
            Some("source-a"),
        );
        assert_eq!(again, token);
        assert_eq!(
            join_url_at(&state, &token, 2_000).unwrap(),
            "https://teams.microsoft.com/l/meetup-join/new"
        );
    }

    #[test]
    fn the_token_cache_stays_bounded_and_keeps_the_newest_entries() {
        let state = WorkCalendarState::new();
        let mut newest = String::new();
        for index in 0..(MAX_RETAINED_TOKENS * 2) {
            newest = expose_one(
                &state,
                1_000 + index as u64,
                &format!("https://teams.microsoft.com/l/meetup-join/{index}"),
                &format!("uid-{index}"),
                START,
                Some("source-a"),
            );
        }
        let cache = state.join_targets.lock().unwrap();
        assert!(cache.targets.len() <= MAX_RETAINED_TOKENS);
        assert_eq!(
            cache.tokens_by_occurrence.len(),
            cache.targets.len(),
            "the reverse index must not outlive the tokens it points at"
        );
        assert!(
            cache.targets.contains_key(&newest),
            "eviction must drop the least recently seen, not the newest"
        );
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
            meeting_provider: Some(MeetingProvider::Teams),
            meeting_url: Some("https://teams.microsoft.com/l/meetup-join/opaque-token".into()),
            series_uid: "joinable-meeting".into(),
            recurring: false,
            private: false,
        };
        let overlapping_event = EventSelection {
            subject: "Overlapping meeting".into(),
            start: "2026-08-17T11:30:00Z".into(),
            end: "2026-08-17T12:30:00Z".into(),
            all_day: false,
            classification: EventClassification::Active,
            meeting_link_present: Some(true),
            meeting_provider: Some(MeetingProvider::Teams),
            meeting_url: Some(
                "https://teams.microsoft.com/l/meetup-join/second-opaque-token".into(),
            ),
            series_uid: "overlapping-meeting".into(),
            recurring: false,
            private: false,
        };

        let (selection, overlapping, next) =
            state.expose_selections(Some(event), vec![overlapping_event], None, Some("source-a"));
        assert_eq!(overlapping.len(), 1);
        assert!(next.is_none());
        let selection = selection.unwrap();
        assert!(selection.workspace_key.is_some());
        assert_eq!(selection.meeting_provider, Some(MeetingProvider::Teams));
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
        assert!(serialized.contains("\"meetingProvider\":\"teams\""));
        assert!(!serialized.contains("meetup-join"));
        assert!(!serialized.contains("opaque-token"));
        assert!(!serialized.contains("workspaceKey"));
        assert!(overlapping_serialized.contains(overlapping_token));
        assert!(!overlapping_serialized.contains("meetup-join"));
        assert!(!overlapping_serialized.contains("second-opaque-token"));
    }

    #[test]
    fn classifies_only_teams_and_zoom_meeting_providers() {
        assert_eq!(
            classify_meeting_provider(Some("https://teams.microsoft.com/l/meetup-join/opaque")),
            Some(MeetingProvider::Teams)
        );
        assert_eq!(
            classify_meeting_provider(Some("https://acme.zoom.us/j/123456789")),
            Some(MeetingProvider::Zoom)
        );
        assert_eq!(
            classify_meeting_provider(Some("https://meet.google.com/abc-defg-hij")),
            None
        );
        assert_eq!(classify_meeting_provider(None), None);
    }

    #[test]
    fn recurring_workspace_identity_is_source_scoped_and_private_safe() {
        let recurring = DayEventSelection {
            subject: "Weekly sync".into(),
            start: "2026-08-18T13:00:00Z".into(),
            end: "2026-08-18T14:00:00Z".into(),
            all_day: false,
            cancelled: false,
            series_uid: "series-uid".into(),
            recurring: true,
            private: false,
        };
        let first = day_selection(recurring.clone(), Some("source-a"));
        let same = day_selection(recurring.clone(), Some("source-a"));
        let other_source = day_selection(recurring, Some("source-b"));
        assert_eq!(first.workspace_key, same.workspace_key);
        assert_ne!(first.workspace_key, other_source.workspace_key);
        assert_eq!(first.workspace_key.as_deref().unwrap().len(), 64);

        let private = day_selection(
            DayEventSelection {
                subject: "Private event".into(),
                start: "2026-08-18T13:00:00Z".into(),
                end: "2026-08-18T14:00:00Z".into(),
                all_day: false,
                cancelled: false,
                series_uid: "private-series".into(),
                recurring: true,
                private: true,
            },
            Some("source-a"),
        );
        assert!(private.workspace_key.is_none());

        let one_off = day_selection(
            DayEventSelection {
                subject: "One-off".into(),
                start: "2026-08-18T15:00:00Z".into(),
                end: "2026-08-18T16:00:00Z".into(),
                all_day: false,
                cancelled: false,
                series_uid: "one-off-uid".into(),
                recurring: false,
                private: false,
            },
            Some("source-a"),
        );
        assert!(one_off.workspace_key.is_some());
        assert_ne!(one_off.workspace_key, first.workspace_key);

        let cancelled = day_selection(
            DayEventSelection {
                subject: "Cancelled one-off".into(),
                start: "2026-08-18T16:00:00Z".into(),
                end: "2026-08-18T17:00:00Z".into(),
                all_day: false,
                cancelled: true,
                series_uid: "cancelled-one-off".into(),
                recurring: false,
                private: false,
            },
            Some("source-a"),
        );
        assert!(cancelled.workspace_key.is_none());
    }
}
