mod attention_signals;
mod later_inbox;
mod meeting_workspace;
mod published_ics;
pub mod teams_mirror;
mod uia_gate;
mod work_calendar;

use attention_signals::AttentionSignalSnapshot;
use later_inbox::{LaterInboxInput, LaterInboxSnapshot, LaterInboxState};
use meeting_workspace::{
    MeetingWorkspaceInput, MeetingWorkspaceSnapshot, MeetingWorkspaceState, ProjectStashInput,
    ProjectStashSnapshot,
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
    meeting_state: tauri::State<'_, MeetingWorkspaceState>,
    published_url: String,
    title_capability_confirmed: bool,
) -> Result<WorkCalendarSnapshot, ()> {
    let mut snapshot =
        work_calendar::save_source(state.inner(), published_url, title_capability_confirmed).await;
    let _ = meeting_workspace::enrich_calendar_snapshot(&app, meeting_state.inner(), &mut snapshot);
    work_calendar::log_snapshot("save", &snapshot);
    let _ = app.emit("work-calendar-changed", ());
    Ok(snapshot)
}

#[tauri::command]
async fn get_work_calendar_snapshot(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkCalendarState>,
    meeting_state: tauri::State<'_, MeetingWorkspaceState>,
) -> Result<WorkCalendarSnapshot, ()> {
    let mut snapshot = work_calendar::get_snapshot(state.inner()).await;
    if let Err(error) =
        meeting_workspace::enrich_calendar_snapshot(&app, meeting_state.inner(), &mut snapshot)
    {
        snapshot
            .diagnostics
            .push(format!("Meeting workspace unavailable: {error}"));
    }
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
fn get_meeting_workspace(
    app: tauri::AppHandle,
    state: tauri::State<'_, MeetingWorkspaceState>,
    event_token: String,
) -> Result<MeetingWorkspaceSnapshot, String> {
    meeting_workspace::get_snapshot(&app, state.inner(), &event_token)
}

fn emit_meeting_workspace_changed(app: &tauri::AppHandle) {
    let _ = app.emit("meeting-workspace-changed", ());
    let _ = app.emit("work-calendar-changed", ());
}

#[tauri::command]
fn save_meeting_workspace(
    app: tauri::AppHandle,
    state: tauri::State<'_, MeetingWorkspaceState>,
    event_token: String,
    input: MeetingWorkspaceInput,
) -> Result<MeetingWorkspaceSnapshot, String> {
    let snapshot = meeting_workspace::save(&app, state.inner(), &event_token, input)?;
    emit_meeting_workspace_changed(&app);
    Ok(snapshot)
}

#[tauri::command]
fn unlink_meeting_workspace(
    app: tauri::AppHandle,
    state: tauri::State<'_, MeetingWorkspaceState>,
    event_token: String,
) -> Result<MeetingWorkspaceSnapshot, String> {
    let snapshot = meeting_workspace::unlink(&app, state.inner(), &event_token)?;
    emit_meeting_workspace_changed(&app);
    Ok(snapshot)
}

#[tauri::command]
fn delete_meeting_project(
    app: tauri::AppHandle,
    state: tauri::State<'_, MeetingWorkspaceState>,
    event_token: String,
    project_id: String,
) -> Result<MeetingWorkspaceSnapshot, String> {
    let snapshot =
        meeting_workspace::delete_project(&app, state.inner(), &event_token, &project_id)?;
    emit_meeting_workspace_changed(&app);
    Ok(snapshot)
}

#[tauri::command]
fn open_event_workspace_link(
    app: tauri::AppHandle,
    state: tauri::State<'_, MeetingWorkspaceState>,
    event_token: String,
) -> Result<(), String> {
    let url = meeting_workspace::link_url(&app, state.inner(), &event_token)?;
    later_inbox::open_external_url(&url)
}

#[tauri::command]
fn open_project_stash_note_url(
    app: tauri::AppHandle,
    state: tauri::State<'_, MeetingWorkspaceState>,
    project_id: String,
    url: String,
) -> Result<(), String> {
    let url = meeting_workspace::note_url(&app, state.inner(), &project_id, &url)?;
    later_inbox::open_external_url(&url)
}

#[tauri::command]
fn get_project_stash(
    app: tauri::AppHandle,
    state: tauri::State<'_, MeetingWorkspaceState>,
    project_id: String,
) -> Result<ProjectStashSnapshot, String> {
    meeting_workspace::get_project_stash(&app, state.inner(), &project_id)
}

#[tauri::command]
fn save_project_stash(
    app: tauri::AppHandle,
    state: tauri::State<'_, MeetingWorkspaceState>,
    project_id: String,
    input: ProjectStashInput,
) -> Result<ProjectStashSnapshot, String> {
    let snapshot = meeting_workspace::save_project_stash(&app, state.inner(), &project_id, input)?;
    emit_meeting_workspace_changed(&app);
    Ok(snapshot)
}

#[tauri::command]
fn get_teams_mirror_status(state: tauri::State<'_, TaskbarMirrorState>) -> TaskbarMirrorStatus {
    state.status(TaskbarMirrorSource::Teams)
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

#[tauri::command]
fn reposition_taskbar_mirrors(
    app: tauri::AppHandle,
    state: tauri::State<'_, TaskbarMirrorState>,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "Attention Hub widget window is unavailable.".to_owned())?;
        let owner = window
            .hwnd()
            .map_err(|error| format!("Could not access the Attention Hub widget: {error}"))?;
        state.reposition_all(owner.0 as isize)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        state.reposition_all(0)
    }
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
    compact_mode: bool,
    slim_mode: bool,
    vertical_offset: i32,
) -> Result<(), String> {
    if !(0..=6).contains(&visible_source_count) {
        return Err("Visible source count must be from 0 through 6.".into());
    }
    if !(0..=512).contains(&vertical_offset) {
        return Err("Visual source vertical offset must be from 0 through 512.".into());
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
        state.set_layout(
            source,
            Some(item.slot),
            visible_source_count,
            compact_mode,
            slim_mode,
            vertical_offset,
        );
    }
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

#[tauri::command]
fn open_main_panel_devtools(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        window.open_devtools();
        Ok(())
    }

    #[cfg(not(debug_assertions))]
    {
        let _ = window;
        Err("Developer tools are only available in development builds.".to_string())
    }
}

#[tauri::command]
fn play_meeting_start_sound(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use tauri::path::BaseDirectory;
        use windows::{
            core::PCWSTR,
            Win32::Media::Audio::{PlaySoundW, SND_ASYNC, SND_FILENAME, SND_NODEFAULT, SND_SYSTEM},
        };

        let sound_path = app
            .path()
            .resolve("sounds/meeting-start.wav", BaseDirectory::Resource)
            .map_err(|_| "Attention Hub could not resolve its bundled meeting sound.".to_owned())?;
        if !sound_path.is_file() {
            return Err("The bundled meeting-start sound is unavailable.".to_owned());
        }
        let sound_path = sound_path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>();
        unsafe {
            PlaySoundW(
                PCWSTR(sound_path.as_ptr()),
                None,
                SND_FILENAME | SND_ASYNC | SND_NODEFAULT | SND_SYSTEM,
            )
        }
        .ok()
        .map_err(|_| "Windows could not play the bundled meeting-start sound.".to_owned())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("Meeting-start sound is available only on Windows.".to_owned())
    }
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
fn delete_later_inbox_item(
    app: tauri::AppHandle,
    state: tauri::State<'_, LaterInboxState>,
    item_id: String,
) -> Result<LaterInboxSnapshot, String> {
    let snapshot = later_inbox::delete_item(&app, state.inner(), &item_id)?;
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(LaterInboxState::new())
        .manage(MeetingWorkspaceState::new())
        .manage(TaskbarMirrorState::new())
        .manage(WorkCalendarState::new())
        .invoke_handler(tauri::generate_handler![
            get_attention_signal_snapshot,
            get_work_calendar_configuration,
            save_work_calendar_source,
            get_work_calendar_snapshot,
            remove_work_calendar_source,
            open_work_calendar_join_url,
            get_meeting_workspace,
            save_meeting_workspace,
            unlink_meeting_workspace,
            delete_meeting_project,
            open_event_workspace_link,
            open_project_stash_note_url,
            get_project_stash,
            save_project_stash,
            get_teams_mirror_status,
            get_taskbar_mirror_status,
            start_taskbar_mirror,
            stop_taskbar_mirror,
            reposition_taskbar_mirrors,
            set_fixed_taskbar_mirror_layout,
            activate_attention_source,
            get_later_inbox_snapshot,
            create_later_inbox_item,
            update_later_inbox_item,
            complete_later_inbox_item,
            restore_later_inbox_item,
            delete_later_inbox_item,
            delete_completed_later_inbox_items,
            delete_all_later_inbox_items,
            notify_due_later_inbox_items,
            open_later_inbox_item_url,
            open_later_inbox_note_url,
            play_meeting_start_sound,
            open_main_panel_devtools,
            quit_application
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
