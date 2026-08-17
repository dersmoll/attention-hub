mod attention_signals;
mod later_inbox;
mod notifications;
mod published_ics;
pub mod teams_mirror;
mod uia_gate;
mod work_calendar;

use attention_signals::AttentionSignalSnapshot;
use later_inbox::{LaterInboxInput, LaterInboxSnapshot, LaterInboxState};
use notifications::{
    ListenerStartReport, NotificationAccessReport, NotificationListenerState, NotificationSnapshot,
};
use serde::Deserialize;
use tauri::{Emitter, Manager};
use teams_mirror::{
    AttentionAppSource, TaskbarMirrorSource, TaskbarMirrorState, TaskbarMirrorStatus,
};
use work_calendar::{WorkCalendarConfiguration, WorkCalendarSnapshot, WorkCalendarState};

#[tauri::command]
async fn get_attention_signal_snapshot(
    source_keys: Vec<String>,
) -> Result<AttentionSignalSnapshot, String> {
    let snapshot = attention_signals::get_snapshot(source_keys).await?;
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
    Ok(snapshot)
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
fn open_work_calendar_join_url(
    state: tauri::State<'_, WorkCalendarState>,
    join_token: String,
) -> Result<(), String> {
    let url = work_calendar::join_url(state.inner(), &join_token)?;
    later_inbox::open_external_url(&url)
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
fn get_taskbar_mirror_status(
    state: tauri::State<'_, TaskbarMirrorState>,
    source_key: String,
) -> Result<TaskbarMirrorStatus, String> {
    let source = TaskbarMirrorSource::from_key(&source_key)
        .ok_or_else(|| format!("Unsupported visual source: {source_key}"))?;
    Ok(state.status(source))
}

#[tauri::command]
fn start_taskbar_mirror(
    app: tauri::AppHandle,
    state: tauri::State<'_, TaskbarMirrorState>,
    source_key: String,
) -> Result<TaskbarMirrorStatus, String> {
    let source = TaskbarMirrorSource::from_key(&source_key)
        .ok_or_else(|| format!("Unsupported visual source: {source_key}"))?;
    #[cfg(target_os = "windows")]
    {
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "Attention Hub widget window is unavailable.".to_owned())?;
        let owner = window
            .hwnd()
            .map_err(|error| format!("Could not access the Attention Hub widget: {error}"))?;
        state.start(source, owner.0 as isize)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        state.start(source, 0)
    }
}

#[tauri::command]
fn stop_taskbar_mirror(
    state: tauri::State<'_, TaskbarMirrorState>,
    source_key: String,
) -> Result<TaskbarMirrorStatus, String> {
    let source = TaskbarMirrorSource::from_key(&source_key)
        .ok_or_else(|| format!("Unsupported visual source: {source_key}"))?;
    Ok(state.stop(source))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskbarMirrorSlot {
    source_key: String,
    slot: i32,
}

#[tauri::command]
fn set_fixed_taskbar_mirror_layout(
    state: tauri::State<'_, TaskbarMirrorState>,
    source_slots: Vec<TaskbarMirrorSlot>,
    visible_source_count: i32,
) -> Result<(), String> {
    if !(0..=6).contains(&visible_source_count) {
        return Err("Visible source count must be from 0 through 6.".into());
    }
    let mut seen_sources = Vec::new();
    let mut seen_slots = Vec::new();
    for item in source_slots {
        let source = TaskbarMirrorSource::from_key(&item.source_key)
            .ok_or_else(|| format!("Unsupported visual source: {}", item.source_key))?;
        if item.slot < 0
            || item.slot >= visible_source_count
            || seen_sources.contains(&source)
            || seen_slots.contains(&item.slot)
        {
            return Err("Visual source slots must be unique visible app positions.".into());
        }
        seen_sources.push(source);
        seen_slots.push(item.slot);
        state.set_layout(source, Some(item.slot), visible_source_count);
    }
    Ok(())
}

#[tauri::command]
fn set_taskbar_mirror_layout(
    state: tauri::State<'_, TaskbarMirrorState>,
    teams_slot: Option<i32>,
    telegram_slot: Option<i32>,
    visible_source_count: i32,
) -> Result<(), String> {
    let valid_slot = |slot: i32| (0..=2).contains(&slot);
    if !(0..=3).contains(&visible_source_count)
        || teams_slot.is_some_and(|slot| !valid_slot(slot))
        || telegram_slot.is_some_and(|slot| !valid_slot(slot))
        || teams_slot.is_some_and(|slot| slot >= visible_source_count)
        || telegram_slot.is_some_and(|slot| slot >= visible_source_count)
        || teams_slot.is_some() && teams_slot == telegram_slot
    {
        return Err(
            "Visible taskbar mirror slots must be distinct app positions from 0 through 2.".into(),
        );
    }
    state.set_layout(TaskbarMirrorSource::Teams, teams_slot, visible_source_count);
    state.set_layout(
        TaskbarMirrorSource::Telegram,
        telegram_slot,
        visible_source_count,
    );
    Ok(())
}

#[tauri::command]
fn activate_attention_source(source_key: String) -> Result<(), String> {
    let source = AttentionAppSource::from_key(&source_key)
        .ok_or_else(|| format!("Unsupported attention source: {source_key}"))?;
    teams_mirror::activate_source(source)
}

#[tauri::command]
fn quit_application(app: tauri::AppHandle) {
    app.exit(0);
}

fn emit_later_inbox_changed(app: &tauri::AppHandle) {
    let _ = app.emit("later-inbox-changed", ());
}

#[tauri::command]
fn get_later_inbox_snapshot(
    app: tauri::AppHandle,
    state: tauri::State<'_, LaterInboxState>,
) -> Result<LaterInboxSnapshot, String> {
    later_inbox::get_snapshot(&app, state.inner())
}

#[tauri::command]
fn create_later_inbox_item(
    app: tauri::AppHandle,
    state: tauri::State<'_, LaterInboxState>,
    input: LaterInboxInput,
) -> Result<LaterInboxSnapshot, String> {
    let snapshot = later_inbox::create_item(&app, state.inner(), input)?;
    emit_later_inbox_changed(&app);
    Ok(snapshot)
}

#[tauri::command]
fn update_later_inbox_item(
    app: tauri::AppHandle,
    state: tauri::State<'_, LaterInboxState>,
    item_id: String,
    input: LaterInboxInput,
) -> Result<LaterInboxSnapshot, String> {
    let snapshot = later_inbox::update_item(&app, state.inner(), &item_id, input)?;
    emit_later_inbox_changed(&app);
    Ok(snapshot)
}

#[tauri::command]
fn complete_later_inbox_item(
    app: tauri::AppHandle,
    state: tauri::State<'_, LaterInboxState>,
    item_id: String,
) -> Result<LaterInboxSnapshot, String> {
    let snapshot = later_inbox::complete_item(&app, state.inner(), &item_id)?;
    emit_later_inbox_changed(&app);
    Ok(snapshot)
}

#[tauri::command]
fn restore_later_inbox_item(
    app: tauri::AppHandle,
    state: tauri::State<'_, LaterInboxState>,
    item_id: String,
) -> Result<LaterInboxSnapshot, String> {
    let snapshot = later_inbox::restore_item(&app, state.inner(), &item_id)?;
    emit_later_inbox_changed(&app);
    Ok(snapshot)
}

#[tauri::command]
fn delete_completed_later_inbox_items(
    app: tauri::AppHandle,
    state: tauri::State<'_, LaterInboxState>,
) -> Result<LaterInboxSnapshot, String> {
    let snapshot = later_inbox::delete_completed(&app, state.inner())?;
    emit_later_inbox_changed(&app);
    Ok(snapshot)
}

#[tauri::command]
fn delete_all_later_inbox_items(
    app: tauri::AppHandle,
    state: tauri::State<'_, LaterInboxState>,
) -> Result<LaterInboxSnapshot, String> {
    let snapshot = later_inbox::delete_all(&app, state.inner())?;
    emit_later_inbox_changed(&app);
    Ok(snapshot)
}

#[tauri::command]
fn notify_due_later_inbox_items(
    app: tauri::AppHandle,
    state: tauri::State<'_, LaterInboxState>,
) -> Result<LaterInboxSnapshot, String> {
    later_inbox::notify_due(&app, state.inner())
}

#[tauri::command]
fn open_later_inbox_item_url(
    app: tauri::AppHandle,
    state: tauri::State<'_, LaterInboxState>,
    item_id: String,
) -> Result<(), String> {
    let url = later_inbox::item_url(&app, state.inner(), &item_id)?;
    later_inbox::open_external_url(&url)
}

#[tauri::command]
fn open_later_inbox_note_url(
    app: tauri::AppHandle,
    state: tauri::State<'_, LaterInboxState>,
    item_id: String,
    url: String,
) -> Result<(), String> {
    let url = later_inbox::item_note_url(&app, state.inner(), &item_id, &url)?;
    later_inbox::open_external_url(&url)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(NotificationListenerState::new())
        .manage(LaterInboxState::new())
        .manage(TaskbarMirrorState::new())
        .manage(WorkCalendarState::new())
        .invoke_handler(tauri::generate_handler![
            get_attention_signal_snapshot,
            get_work_calendar_configuration,
            save_work_calendar_source,
            get_work_calendar_snapshot,
            remove_work_calendar_source,
            open_work_calendar_join_url,
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
            get_taskbar_mirror_status,
            start_taskbar_mirror,
            stop_taskbar_mirror,
            set_fixed_taskbar_mirror_layout,
            set_taskbar_mirror_layout,
            activate_attention_source,
            get_later_inbox_snapshot,
            create_later_inbox_item,
            update_later_inbox_item,
            complete_later_inbox_item,
            restore_later_inbox_item,
            delete_completed_later_inbox_items,
            delete_all_later_inbox_items,
            notify_due_later_inbox_items,
            open_later_inbox_item_url,
            open_later_inbox_note_url,
            quit_application
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
