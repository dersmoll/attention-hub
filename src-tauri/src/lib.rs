mod attention_signals;
mod calendar;
mod graph_calendar;
mod notifications;

use attention_signals::AttentionSignalSnapshot;
use calendar::{CalendarAccessReport, CalendarSnapshot};
use graph_calendar::GraphEnvironmentReport;
use notifications::{
    ListenerStartReport, NotificationAccessReport, NotificationListenerState, NotificationSnapshot,
};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(NotificationListenerState::new())
        .invoke_handler(tauri::generate_handler![
            get_attention_signal_snapshot,
            get_calendar_access_status,
            request_calendar_read_access,
            get_calendar_snapshot,
            get_graph_calendar_environment,
            get_notification_access_status,
            request_notification_access,
            get_notification_snapshot,
            start_notification_listener
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
