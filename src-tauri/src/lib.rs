mod attention_signals;
mod notifications;
mod published_ics;
pub mod teams_mirror;
mod uia_gate;
mod work_calendar;

use attention_signals::AttentionSignalSnapshot;
use notifications::{
    ListenerStartReport, NotificationAccessReport, NotificationListenerState, NotificationSnapshot,
};
use tauri::{Emitter, Manager};
use teams_mirror::{TaskbarMirrorSource, TaskbarMirrorState, TaskbarMirrorStatus};
use work_calendar::{WorkCalendarConfiguration, WorkCalendarSnapshot, WorkCalendarState};

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
fn get_work_calendar_configuration() -> WorkCalendarConfiguration {
    work_calendar::get_configuration()
}

#[tauri::command]
async fn save_work_calendar_source(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkCalendarState>,
    published_url: String,
    title_capability_confirmed: bool,
) -> Result<WorkCalendarSnapshot, ()> {
    let snapshot =
        work_calendar::save_source(state.inner(), published_url, title_capability_confirmed).await;
    work_calendar::log_snapshot("save", &snapshot);
    let _ = app.emit("work-calendar-changed", ());
    Ok(snapshot)
}

#[tauri::command]
async fn get_work_calendar_snapshot(
    state: tauri::State<'_, WorkCalendarState>,
) -> Result<WorkCalendarSnapshot, ()> {
    let snapshot = work_calendar::get_snapshot(state.inner()).await;
    work_calendar::log_snapshot("refresh", &snapshot);
    Ok(snapshot)
}

#[tauri::command]
async fn remove_work_calendar_source(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkCalendarState>,
) -> Result<WorkCalendarConfiguration, ()> {
    let configuration = work_calendar::remove_source(state.inner()).await;
    let _ = app.emit("work-calendar-changed", ());
    Ok(configuration)
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
        .manage(WorkCalendarState::new())
        .invoke_handler(tauri::generate_handler![
            get_attention_signal_snapshot,
            get_work_calendar_configuration,
            save_work_calendar_source,
            get_work_calendar_snapshot,
            remove_work_calendar_source,
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
