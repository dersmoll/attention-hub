mod attention_signals;
mod calendar;
mod graph_calendar;
mod notifications;
mod outlook_my_day;
mod published_ics;
pub mod teams_mirror;
mod uia_gate;

use attention_signals::AttentionSignalSnapshot;
use calendar::{CalendarAccessReport, CalendarSnapshot};
use graph_calendar::GraphEnvironmentReport;
use notifications::{
    ListenerStartReport, NotificationAccessReport, NotificationListenerState, NotificationSnapshot,
};
use outlook_my_day::OutlookMyDayStructureProbe;
use published_ics::PublishedIcsStructureProbe;
use tauri::Manager;
use teams_mirror::{TaskbarMirrorSource, TaskbarMirrorState, TaskbarMirrorStatus};

#[tauri::command]
async fn get_attention_signal_snapshot() -> AttentionSignalSnapshot {
    let snapshot = attention_signals::get_snapshot().await;
    let summary = snapshot
        .sources
        .iter()
        .map(|source| {
            format!(
                "{}:{:?} signals={}",
                source.source_key,
                source.state,
                source.signals.len()
            )
        })
        .collect::<Vec<_>>();
    eprintln!(
        "attention signal snapshot: count={}, sources={summary:?}, diagnostics={:?}",
        snapshot.signals.len(),
        snapshot.diagnostics
    );
    snapshot
}

#[tauri::command]
async fn get_calendar_access_status() -> CalendarAccessReport {
    let report = calendar::get_access_status().await;
    eprintln!("calendar access status: {report:?}");
    report
}

#[tauri::command]
async fn request_calendar_read_access() -> CalendarAccessReport {
    let report = calendar::request_read_access().await;
    eprintln!("calendar read-access request result: {report:?}");
    report
}

#[tauri::command]
async fn get_calendar_snapshot() -> CalendarSnapshot {
    let snapshot = calendar::get_snapshot().await;
    eprintln!(
        "calendar snapshot: status={:?}, calendars={}, appointments={}, diagnostics={:?}",
        snapshot.access_status,
        snapshot.calendars.len(),
        snapshot.appointments.len(),
        snapshot.diagnostics
    );
    snapshot
}

#[tauri::command]
async fn get_graph_calendar_environment() -> GraphEnvironmentReport {
    let report = graph_calendar::get_environment().await;
    eprintln!("Graph calendar helper environment: {report:?}");
    report
}

#[tauri::command]
async fn get_outlook_my_day_structure_probe() -> OutlookMyDayStructureProbe {
    let probe = outlook_my_day::get_structure_probe().await;
    eprintln!(
        "Outlook My Day sanitized structure probe: status={:?}, windows={}, elements={}, candidates={}, right_pane_candidates={}, markers={}/{}, selected_calendar_markers={}, stop_reason={:?}, timing_ms={}/{}",
        probe.status,
        probe.outlook_window_count,
        probe.element_count,
        probe.structural_candidate_count,
        probe.right_pane_candidate_count,
        probe.english_my_day_marker_count,
        probe.english_calendar_marker_count,
        probe.selected_english_calendar_marker_count,
        probe.stop_reason,
        probe.gate_wait_ms,
        probe.scan_ms,
    );
    probe
}

#[tauri::command]
async fn get_published_ics_structure_probe(published_url: String) -> PublishedIcsStructureProbe {
    let probe = published_ics::get_structure_probe(published_url).await;
    eprintln!(
        "Published ICS sanitized structure probe: status={:?}, http_status={:?}, bytes={}, calendars={}, events={}, recurrence_rules={}, timezone_definitions={}, stop_reason={:?}, timing_ms={}/{}",
        probe.status,
        probe.http_status,
        probe.response_bytes,
        probe.calendar_count,
        probe.event_count,
        probe.recurrence_rule_count,
        probe.timezone_definition_count,
        probe.stop_reason,
        probe.request_ms,
        probe.parse_ms,
    );
    probe
}

#[tauri::command]
async fn get_notification_access_status(app: tauri::AppHandle) -> NotificationAccessReport {
    let report = notifications::get_access_status(app).await;
    eprintln!("notification access status: {report:?}");
    report
}

#[tauri::command]
async fn request_notification_access(app: tauri::AppHandle) -> NotificationAccessReport {
    let report = notifications::request_access(app).await;
    eprintln!("notification access request result: {report:?}");
    report
}

#[tauri::command]
async fn get_notification_snapshot(app: tauri::AppHandle) -> NotificationSnapshot {
    let snapshot = notifications::get_snapshot(app).await;
    eprintln!(
        "notification snapshot: status={:?}, count={}, diagnostics={:?}",
        snapshot.access_status,
        snapshot.notifications.len(),
        snapshot.diagnostics
    );
    snapshot
}

#[tauri::command]
async fn start_notification_listener(
    app: tauri::AppHandle,
    state: tauri::State<'_, NotificationListenerState>,
) -> Result<ListenerStartReport, String> {
    let report = notifications::start_listener(app, state.inner()).await;
    eprintln!("notification listener start: {report:?}");
    Ok(report)
}

#[tauri::command]
fn get_teams_mirror_status(state: tauri::State<'_, TaskbarMirrorState>) -> TaskbarMirrorStatus {
    state.status(TaskbarMirrorSource::Teams)
}

#[tauri::command]
fn start_teams_mirror(
    app: tauri::AppHandle,
    state: tauri::State<'_, TaskbarMirrorState>,
) -> Result<TaskbarMirrorStatus, String> {
    #[cfg(target_os = "windows")]
    {
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "Attention Hub main window is unavailable.".to_owned())?;
        let owner = window
            .hwnd()
            .map_err(|error| format!("Could not access the Attention Hub window: {error}"))?;
        state.start(TaskbarMirrorSource::Teams, owner.0 as isize)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        state.start(TaskbarMirrorSource::Teams, 0)
    }
}

#[tauri::command]
fn stop_teams_mirror(state: tauri::State<'_, TaskbarMirrorState>) -> TaskbarMirrorStatus {
    state.stop(TaskbarMirrorSource::Teams)
}

#[tauri::command]
fn get_telegram_mirror_status(state: tauri::State<'_, TaskbarMirrorState>) -> TaskbarMirrorStatus {
    state.status(TaskbarMirrorSource::Telegram)
}

#[tauri::command]
fn start_telegram_mirror(
    app: tauri::AppHandle,
    state: tauri::State<'_, TaskbarMirrorState>,
) -> Result<TaskbarMirrorStatus, String> {
    #[cfg(target_os = "windows")]
    {
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "Attention Hub widget window is unavailable.".to_owned())?;
        let owner = window
            .hwnd()
            .map_err(|error| format!("Could not access the Attention Hub widget: {error}"))?;
        state.start(TaskbarMirrorSource::Telegram, owner.0 as isize)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        state.start(TaskbarMirrorSource::Telegram, 0)
    }
}

#[tauri::command]
fn stop_telegram_mirror(state: tauri::State<'_, TaskbarMirrorState>) -> TaskbarMirrorStatus {
    state.stop(TaskbarMirrorSource::Telegram)
}

#[tauri::command]
fn quit_application(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(NotificationListenerState::new())
        .manage(TaskbarMirrorState::new())
        .invoke_handler(tauri::generate_handler![
            get_attention_signal_snapshot,
            get_calendar_access_status,
            request_calendar_read_access,
            get_calendar_snapshot,
            get_graph_calendar_environment,
            get_outlook_my_day_structure_probe,
            get_published_ics_structure_probe,
            get_notification_access_status,
            request_notification_access,
            get_notification_snapshot,
            start_notification_listener,
            get_teams_mirror_status,
            start_teams_mirror,
            stop_teams_mirror,
            get_telegram_mirror_status,
            start_telegram_mirror,
            stop_telegram_mirror,
            quit_application
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
