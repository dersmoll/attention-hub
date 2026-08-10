mod attention_signals;
mod calendar;
mod graph_calendar;
mod notifications;
pub mod teams_mirror;
mod uia_gate;

use attention_signals::AttentionSignalSnapshot;
use calendar::{CalendarAccessReport, CalendarSnapshot};
use graph_calendar::GraphEnvironmentReport;
use notifications::{
    ListenerStartReport, NotificationAccessReport, NotificationListenerState, NotificationSnapshot,
};
use tauri::Manager;
use teams_mirror::{TeamsMirrorState, TeamsMirrorStatus};

#[tauri::command]
async fn get_attention_signal_snapshot() -> AttentionSignalSnapshot {
    let snapshot = attention_signals::get_snapshot().await;
    let summary = snapshot
        .signals
        .iter()
        .map(|signal| {
            format!(
                "{}:{} count={:?} needs_attention={:?}",
                signal.source_key, signal.kind, signal.count, signal.needs_attention
            )
        })
        .collect::<Vec<_>>();
    eprintln!(
        "attention signal snapshot: count={}, signals={summary:?}, diagnostics={:?}",
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
fn get_teams_mirror_status(state: tauri::State<'_, TeamsMirrorState>) -> TeamsMirrorStatus {
    state.status()
}

#[tauri::command]
fn start_teams_mirror(
    app: tauri::AppHandle,
    state: tauri::State<'_, TeamsMirrorState>,
) -> Result<TeamsMirrorStatus, String> {
    #[cfg(target_os = "windows")]
    {
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "Attention Hub main window is unavailable.".to_owned())?;
        let owner = window
            .hwnd()
            .map_err(|error| format!("Could not access the Attention Hub window: {error}"))?;
        state.start(owner.0 as isize)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        state.start(0)
    }
}

#[tauri::command]
fn stop_teams_mirror(state: tauri::State<'_, TeamsMirrorState>) -> TeamsMirrorStatus {
    state.stop()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(NotificationListenerState::new())
        .manage(TeamsMirrorState::new())
        .invoke_handler(tauri::generate_handler![
            get_attention_signal_snapshot,
            get_calendar_access_status,
            request_calendar_read_access,
            get_calendar_snapshot,
            get_graph_calendar_environment,
            get_notification_access_status,
            request_notification_access,
            get_notification_snapshot,
            start_notification_listener,
            get_teams_mirror_status,
            start_teams_mirror,
            stop_teams_mirror
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
