mod attention_signals;
mod notifications;

use attention_signals::AttentionSignalSnapshot;
use attention_signals::TeamsAccessibilityProbeSnapshot;
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
async fn get_teams_accessibility_probe() -> TeamsAccessibilityProbeSnapshot {
    let snapshot = attention_signals::get_teams_accessibility_probe().await;
    eprintln!(
        "Teams accessibility probe: process_found={}, windows={}, elements={}, candidates={}, returned={}, truncated={}, diagnostics={:?}",
        snapshot.process_found,
        snapshot.windows_scanned,
        snapshot.elements_scanned,
        snapshot.total_candidates,
        snapshot.candidates.len(),
        snapshot.candidates_truncated,
        snapshot.diagnostics
    );
    snapshot
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
            get_teams_accessibility_probe,
            get_notification_access_status,
            request_notification_access,
            get_notification_snapshot,
            start_notification_listener
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
