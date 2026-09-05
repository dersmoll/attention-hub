mod attention_signals;
mod external_url;
mod local_store;
mod medicine;
mod published_ics;
pub mod teams_mirror;
mod uia_gate;
mod work_calendar;
mod workspace;
mod zoom_meeting;

use attention_signals::AttentionSignalSnapshot;
use medicine::{
    MedicineDeleteImpact, MedicineInput, MedicineSnapshot, MedicineState, TreatmentInput,
};
use serde::Deserialize;
use tauri::{Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use teams_mirror::{
    AttentionAppSource, TaskbarMirrorSource, TaskbarMirrorState, TaskbarMirrorStatus,
};
use work_calendar::{WorkCalendarConfiguration, WorkCalendarSnapshot, WorkCalendarState};
use workspace::{
    ActionItemInput, EventWorkspaceInput, EventWorkspaceSnapshot, OwnerKind, ProjectLinkInput,
    WorkspaceImportPreview, WorkspaceSnapshot, WorkspaceState,
};

fn emit_workspace_changed(app: &tauri::AppHandle) {
    let _ = app.emit("workspace-changed", ());
}

fn emit_medicine_changed(app: &tauri::AppHandle) {
    let _ = app.emit("medicine-changed", ());
}

#[tauri::command]
fn get_medicine_snapshot(
    app: tauri::AppHandle,
    state: tauri::State<'_, MedicineState>,
) -> Result<MedicineSnapshot, String> {
    medicine::get_snapshot(&app, state.inner())
}

#[tauri::command]
fn create_treatment(
    app: tauri::AppHandle,
    state: tauri::State<'_, MedicineState>,
    input: TreatmentInput,
) -> Result<MedicineSnapshot, String> {
    let snapshot = medicine::create_treatment(&app, state.inner(), input)?;
    emit_medicine_changed(&app);
    Ok(snapshot)
}

#[tauri::command]
fn update_treatment(
    app: tauri::AppHandle,
    state: tauri::State<'_, MedicineState>,
    treatment_id: String,
    input: TreatmentInput,
) -> Result<MedicineSnapshot, String> {
    let snapshot = medicine::update_treatment(&app, state.inner(), &treatment_id, input)?;
    emit_medicine_changed(&app);
    Ok(snapshot)
}

#[tauri::command]
fn create_medicine(
    app: tauri::AppHandle,
    state: tauri::State<'_, MedicineState>,
    input: MedicineInput,
) -> Result<MedicineSnapshot, String> {
    let snapshot = medicine::create_medicine(&app, state.inner(), input)?;
    emit_medicine_changed(&app);
    Ok(snapshot)
}

#[tauri::command]
fn update_medicine(
    app: tauri::AppHandle,
    state: tauri::State<'_, MedicineState>,
    medicine_id: String,
    input: MedicineInput,
) -> Result<MedicineSnapshot, String> {
    let snapshot = medicine::update_medicine(&app, state.inner(), &medicine_id, input)?;
    emit_medicine_changed(&app);
    Ok(snapshot)
}

#[tauri::command]
fn set_medicine_dose_taken(
    app: tauri::AppHandle,
    state: tauri::State<'_, MedicineState>,
    medicine_id: String,
    slot_day: String,
    slot_time: String,
    taken: bool,
) -> Result<MedicineSnapshot, String> {
    let snapshot = medicine::set_dose_taken(
        &app,
        state.inner(),
        &medicine_id,
        &slot_day,
        &slot_time,
        taken,
    )?;
    emit_medicine_changed(&app);
    Ok(snapshot)
}

#[tauri::command]
fn set_medicine_dose_skipped(
    app: tauri::AppHandle,
    state: tauri::State<'_, MedicineState>,
    medicine_id: String,
    slot_day: String,
    slot_time: String,
    skipped: bool,
) -> Result<MedicineSnapshot, String> {
    let snapshot = medicine::set_dose_skipped(
        &app,
        state.inner(),
        &medicine_id,
        &slot_day,
        &slot_time,
        skipped,
    )?;
    emit_medicine_changed(&app);
    Ok(snapshot)
}

#[tauri::command]
fn set_treatment_archived(
    app: tauri::AppHandle,
    state: tauri::State<'_, MedicineState>,
    treatment_id: String,
    archived: bool,
) -> Result<MedicineSnapshot, String> {
    let snapshot = medicine::set_treatment_archived(&app, state.inner(), &treatment_id, archived)?;
    emit_medicine_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn set_treatment_completed(
    app: tauri::AppHandle,
    state: tauri::State<'_, MedicineState>,
    treatment_id: String,
    completed: bool,
) -> Result<MedicineSnapshot, String> {
    let snapshot =
        medicine::set_treatment_completed(&app, state.inner(), &treatment_id, completed)?;
    emit_medicine_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn save_treatment_notes(
    app: tauri::AppHandle,
    state: tauri::State<'_, MedicineState>,
    treatment_id: String,
    notes: Vec<workspace::NoteSegment>,
    expected_notes_revision: u64,
) -> Result<MedicineSnapshot, String> {
    let snapshot = medicine::save_treatment_notes(
        &app,
        state.inner(),
        &treatment_id,
        notes,
        expected_notes_revision,
    )?;
    emit_medicine_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn get_medicine_delete_impact(
    app: tauri::AppHandle,
    state: tauri::State<'_, MedicineState>,
    entity: String,
    id: Option<String>,
) -> Result<MedicineDeleteImpact, String> {
    medicine::delete_impact(&app, state.inner(), &entity, id.as_deref())
}
#[tauri::command]
fn delete_treatment(
    app: tauri::AppHandle,
    state: tauri::State<'_, MedicineState>,
    treatment_id: String,
    expected_revision: u64,
) -> Result<MedicineSnapshot, String> {
    let snapshot =
        medicine::delete_treatment(&app, state.inner(), &treatment_id, expected_revision)?;
    emit_medicine_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn delete_medicine(
    app: tauri::AppHandle,
    state: tauri::State<'_, MedicineState>,
    medicine_id: String,
    expected_revision: u64,
) -> Result<MedicineSnapshot, String> {
    let snapshot = medicine::delete_medicine(&app, state.inner(), &medicine_id, expected_revision)?;
    emit_medicine_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn delete_all_medicine_data(
    app: tauri::AppHandle,
    state: tauri::State<'_, MedicineState>,
    expected_revision: u64,
) -> Result<MedicineSnapshot, String> {
    let snapshot = medicine::delete_all(&app, state.inner(), expected_revision)?;
    emit_medicine_changed(&app);
    Ok(snapshot)
}

#[tauri::command]
fn get_workspace_snapshot(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
) -> Result<WorkspaceSnapshot, String> {
    workspace::get_snapshot(&app, state.inner())
}
#[tauri::command]
fn export_workspace_data(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    destination_path: String,
) -> Result<String, String> {
    workspace::export_workspace(&app, state.inner(), destination_path)
}
#[tauri::command]
fn preview_workspace_import(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    source_path: String,
) -> Result<WorkspaceImportPreview, String> {
    workspace::preview_workspace_import(&app, state.inner(), source_path)
}
#[tauri::command]
fn import_workspace_data(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    source_path: String,
    expected_revision: u64,
    expected_digest: String,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot = workspace::import_workspace(
        &app,
        state.inner(),
        source_path,
        expected_revision,
        expected_digest,
    )?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn create_personal_category(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    name: String,
) -> Result<WorkspaceSnapshot, String> {
    let s = workspace::create_category(&app, state.inner(), name)?;
    emit_workspace_changed(&app);
    Ok(s)
}
#[tauri::command]
fn create_project(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    name: String,
) -> Result<WorkspaceSnapshot, String> {
    let s = workspace::create_project(&app, state.inner(), name)?;
    emit_workspace_changed(&app);
    Ok(s)
}
#[tauri::command]
fn create_action_item(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    input: ActionItemInput,
) -> Result<WorkspaceSnapshot, String> {
    let s = workspace::create_action_item(&app, state.inner(), input)?;
    emit_workspace_changed(&app);
    Ok(s)
}
#[tauri::command]
fn set_project_archived(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    project_id: String,
    archived: bool,
) -> Result<WorkspaceSnapshot, String> {
    let s = workspace::set_project_archived(&app, state.inner(), &project_id, archived)?;
    emit_workspace_changed(&app);
    Ok(s)
}
#[tauri::command]
fn save_project_notes(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    project_id: String,
    notes: Vec<workspace::NoteSegment>,
    expected_notes_revision: u64,
) -> Result<WorkspaceSnapshot, String> {
    let s = workspace::save_project_notes(
        &app,
        state.inner(),
        &project_id,
        notes,
        expected_notes_revision,
    )?;
    emit_workspace_changed(&app);
    Ok(s)
}
#[tauri::command]
fn open_project_note_url(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    project_id: String,
    url: String,
) -> Result<(), String> {
    external_url::open_external_url(&workspace::project_note_url(
        &app,
        state.inner(),
        &project_id,
        &url,
    )?)
}
#[tauri::command]
fn get_delete_impact(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    entity: String,
    id: Option<String>,
) -> Result<workspace::DeleteImpact, String> {
    workspace::delete_impact(&app, state.inner(), &entity, id.as_deref())
}
#[tauri::command]
fn delete_all_workspace_data(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    expected_revision: u64,
) -> Result<WorkspaceSnapshot, String> {
    let s = workspace::delete_all(&app, state.inner(), expected_revision)?;
    emit_workspace_changed(&app);
    Ok(s)
}

#[tauri::command]
fn create_list(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    category_id: Option<String>,
    name: String,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot = workspace::create_list(&app, state.inner(), category_id.as_deref(), name)?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn rename_personal_category(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    category_id: String,
    name: String,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot = workspace::rename_category(&app, state.inner(), &category_id, name)?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn rename_list(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    list_id: String,
    name: String,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot = workspace::rename_list(&app, state.inner(), &list_id, name)?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn rename_project(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    project_id: String,
    name: String,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot = workspace::rename_project(&app, state.inner(), &project_id, name)?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn update_action_item(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    item_id: String,
    input: ActionItemInput,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot = workspace::update_action_item(&app, state.inner(), &item_id, input)?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn complete_action_item(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    item_id: String,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot = workspace::set_action_item_completed(&app, state.inner(), &item_id, true)?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn restore_action_item(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    item_id: String,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot = workspace::set_action_item_completed(&app, state.inner(), &item_id, false)?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn delete_action_item(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    item_id: String,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot = workspace::delete_action_item(&app, state.inner(), &item_id)?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn delete_personal_category(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    category_id: String,
    expected_revision: u64,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot =
        workspace::delete_category(&app, state.inner(), &category_id, expected_revision)?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn delete_list(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    list_id: String,
    expected_revision: u64,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot = workspace::delete_list(&app, state.inner(), &list_id, expected_revision)?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn delete_project(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    project_id: String,
    expected_revision: u64,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot = workspace::delete_project(&app, state.inner(), &project_id, expected_revision)?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn create_project_link(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    project_id: String,
    input: ProjectLinkInput,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot = workspace::create_project_link(&app, state.inner(), &project_id, input)?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn update_project_link(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    link_id: String,
    input: ProjectLinkInput,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot = workspace::update_project_link(&app, state.inner(), &link_id, input)?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn delete_project_link(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    link_id: String,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot = workspace::delete_project_link(&app, state.inner(), &link_id)?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn open_project_link(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    link_id: String,
) -> Result<(), String> {
    external_url::open_external_url(&workspace::project_link_url(&app, state.inner(), &link_id)?)
}
#[tauri::command]
fn move_personal_category(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    category_id: String,
    sort_index: i32,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot = workspace::move_category(&app, state.inner(), &category_id, sort_index)?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn move_list(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    list_id: String,
    sort_index: i32,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot = workspace::move_list(&app, state.inner(), &list_id, sort_index)?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn set_list_category(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    list_id: String,
    category_id: Option<String>,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot =
        workspace::set_list_category(&app, state.inner(), &list_id, category_id.as_deref())?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn move_project(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    project_id: String,
    sort_index: i32,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot = workspace::move_project(&app, state.inner(), &project_id, sort_index)?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn move_project_link(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    link_id: String,
    sort_index: i32,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot = workspace::move_project_link(&app, state.inner(), &link_id, sort_index)?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn move_action_item(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    item_id: String,
    owner_kind: OwnerKind,
    owner_id: String,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot =
        workspace::move_action_item(&app, state.inner(), &item_id, owner_kind, &owner_id)?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn delete_completed_action_items(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    owner_kind: Option<OwnerKind>,
    owner_id: Option<String>,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot =
        workspace::delete_completed_action_items(&app, state.inner(), owner_kind, owner_id)?;
    emit_workspace_changed(&app);
    Ok(snapshot)
}
#[tauri::command]
fn notify_due_action_items(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
) -> Result<WorkspaceSnapshot, String> {
    let before = workspace::get_snapshot(&app, state.inner())?;
    let notification_body = workspace::due_notification_body(&before);
    let snapshot = workspace::notify_due_action_items(&app, state.inner())?;
    if snapshot.revision != before.revision {
        if let Some(body) = notification_body {
            app.notification()
                .builder()
                .title("Attention Hub To-dos")
                .body(body)
                .show()
                .map_err(|_| {
                    "Windows could not show the to-do reminder notification.".to_owned()
                })?;
        }
        emit_workspace_changed(&app);
    }
    Ok(snapshot)
}
#[tauri::command]
fn open_action_item_note_url(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    item_id: String,
    url: String,
) -> Result<(), String> {
    external_url::open_external_url(&workspace::action_item_note_url(
        &app,
        state.inner(),
        &item_id,
        &url,
    )?)
}
#[tauri::command]
fn get_event_workspace(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    event_token: String,
) -> Result<EventWorkspaceSnapshot, String> {
    workspace::get_event_workspace(&app, state.inner(), &event_token)
}
#[tauri::command]
fn save_event_workspace(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    event_token: String,
    input: EventWorkspaceInput,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot = workspace::save_event_workspace(&app, state.inner(), &event_token, input)?;
    emit_workspace_changed(&app);
    let _ = app.emit("work-calendar-changed", ());
    Ok(snapshot)
}
#[tauri::command]
fn unlink_event_workspace(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    event_token: String,
) -> Result<WorkspaceSnapshot, String> {
    let snapshot = workspace::unlink_event_workspace(&app, state.inner(), &event_token)?;
    emit_workspace_changed(&app);
    let _ = app.emit("work-calendar-changed", ());
    Ok(snapshot)
}
#[tauri::command]
fn open_event_workspace_link_from_workspace(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    event_token: String,
) -> Result<(), String> {
    external_url::open_external_url(&workspace::event_workspace_link_url(
        &app,
        state.inner(),
        &event_token,
    )?)
}

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
    workspace_state: tauri::State<'_, WorkspaceState>,
    published_url: String,
    title_capability_confirmed: bool,
) -> Result<WorkCalendarSnapshot, ()> {
    let mut snapshot =
        work_calendar::save_source(state.inner(), published_url, title_capability_confirmed).await;
    let _ = workspace::enrich_calendar_snapshot(&app, workspace_state.inner(), &mut snapshot);
    work_calendar::log_snapshot("save", &snapshot);
    let _ = app.emit("work-calendar-changed", ());
    Ok(snapshot)
}

#[tauri::command]
async fn get_work_calendar_snapshot(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkCalendarState>,
    workspace_state: tauri::State<'_, WorkspaceState>,
) -> Result<WorkCalendarSnapshot, ()> {
    let mut snapshot = work_calendar::get_snapshot(state.inner()).await;
    if let Err(error) =
        workspace::enrich_calendar_snapshot(&app, workspace_state.inner(), &mut snapshot)
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
    external_url::open_external_url(&url)
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
struct TaskbarMirrorRect {
    source_key: String,
    left: i32,
    top: i32,
    width: i32,
    height: i32,
}

#[tauri::command]
fn set_taskbar_mirror_layout(
    state: tauri::State<'_, TaskbarMirrorState>,
    source_rects: Vec<TaskbarMirrorRect>,
) -> Result<(), String> {
    let mut seen_sources = Vec::new();
    for item in source_rects {
        let source = TaskbarMirrorSource::from_key(&item.source_key)
            .ok_or_else(|| format!("Unsupported visual source: {}", item.source_key))?;
        if seen_sources.contains(&source) {
            return Err("Visual source rectangles must have unique sources.".into());
        }
        if !(0..=4_096).contains(&item.left)
            || !(0..=1_024).contains(&item.top)
            || !(1..=512).contains(&item.width)
            || !(1..=512).contains(&item.height)
        {
            return Err("Visual source rectangles must be visible logical bounds.".into());
        }
        seen_sources.push(source);
        state.set_layout(source, item.left, item.top, item.width, item.height);
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
fn get_zoom_meeting_snapshot() -> Result<zoom_meeting::ZoomMeetingSnapshot, String> {
    zoom_meeting::snapshot()
}

#[tauri::command]
fn activate_zoom_meeting() -> Result<(), String> {
    zoom_meeting::activate()
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(WorkspaceState::new())
        .manage(MedicineState::new())
        .manage(TaskbarMirrorState::new())
        .manage(WorkCalendarState::new())
        .invoke_handler(tauri::generate_handler![
            get_attention_signal_snapshot,
            get_workspace_snapshot,
            get_medicine_snapshot,
            create_treatment,
            update_treatment,
            create_medicine,
            update_medicine,
            set_medicine_dose_taken,
            set_medicine_dose_skipped,
            set_treatment_archived,
            set_treatment_completed,
            save_treatment_notes,
            get_medicine_delete_impact,
            delete_treatment,
            delete_medicine,
            delete_all_medicine_data,
            export_workspace_data,
            preview_workspace_import,
            import_workspace_data,
            create_personal_category,
            create_project,
            create_action_item,
            set_project_archived,
            save_project_notes,
            open_project_note_url,
            get_delete_impact,
            delete_all_workspace_data,
            create_list,
            rename_personal_category,
            rename_list,
            rename_project,
            update_action_item,
            complete_action_item,
            restore_action_item,
            delete_action_item,
            delete_personal_category,
            delete_list,
            delete_project,
            create_project_link,
            update_project_link,
            delete_project_link,
            open_project_link,
            move_personal_category,
            move_list,
            set_list_category,
            move_project,
            move_project_link,
            move_action_item,
            delete_completed_action_items,
            notify_due_action_items,
            open_action_item_note_url,
            get_event_workspace,
            save_event_workspace,
            unlink_event_workspace,
            open_event_workspace_link_from_workspace,
            get_work_calendar_configuration,
            save_work_calendar_source,
            get_work_calendar_snapshot,
            remove_work_calendar_source,
            open_work_calendar_join_url,
            get_teams_mirror_status,
            get_taskbar_mirror_status,
            start_taskbar_mirror,
            stop_taskbar_mirror,
            reposition_taskbar_mirrors,
            set_taskbar_mirror_layout,
            activate_attention_source,
            get_zoom_meeting_snapshot,
            activate_zoom_meeting,
            play_meeting_start_sound,
            open_main_panel_devtools,
            quit_application
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
