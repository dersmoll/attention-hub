//! A full restore spans files, Windows Credential Manager, and WebView storage.
//! The journal is durable before the frontend writes preferences. Native writes
//! begin only in finish; an interrupted commit is rolled back before stores load.
use crate::{local_store, medicine, sticky_note, work_calendar, workspace};
use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{AppHandle, Manager, State, WebviewWindow};
use uuid::Uuid;

const FORMAT: &str = "attention-hub-backup";
const VERSION: u32 = 1;
const MAX_BACKUP_BYTES: u64 = 16 * 1_024 * 1_024;
const MAX_JOURNAL_BYTES: u64 = 160 * 1_024 * 1_024;
const JOURNAL_NAME: &str = "app-restore-journal.json";
const RECOVERY_NAME: &str = "app-before-restore.json";
static RESTORE_PENDING: AtomicBool = AtomicBool::new(false);
type Preferences = BTreeMap<String, String>;

pub struct AppBackupState {
    gate: tokio::sync::Mutex<()>,
}
impl AppBackupState {
    pub fn new() -> Self {
        Self {
            gate: tokio::sync::Mutex::new(()),
        }
    }
}
pub fn restore_is_pending() -> bool {
    RESTORE_PENDING.load(Ordering::Acquire)
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeStores {
    workspace: Value,
    medicine: Value,
    sticky_note: Value,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Backup {
    format: String,
    schema_version: u32,
    exported_at: String,
    stores: NativeStores,
    preferences: Preferences,
    calendar_source_scope: Option<String>,
    calendar_connection: Option<String>,
}

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RestoreSelection {
    settings: bool,
    workspace: bool,
    medicine: bool,
    sticky_note: bool,
    calendar_connection: bool,
}
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Phase {
    Prepared,
    Applying,
    NativeRecovered,
    Committed,
}
fn phase_decision(phase: Phase) -> &'static str {
    if phase == Phase::Committed {
        "committed"
    } else {
        "pending"
    }
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum NativeStep {
    Workspace,
    Medicine,
    StickyNote,
    RetainedBackups,
    Calendar,
    CommitDecision,
}
fn apply_steps(
    selection: RestoreSelection,
    mut apply: impl FnMut(NativeStep) -> Result<(), String>,
) -> Result<(), String> {
    if selection.workspace {
        apply(NativeStep::Workspace)?;
    }
    if selection.medicine {
        apply(NativeStep::Medicine)?;
    }
    if selection.sticky_note {
        apply(NativeStep::StickyNote)?;
    }
    if selection.workspace || selection.medicine || selection.sticky_note {
        apply(NativeStep::RetainedBackups)?;
    }
    if selection.calendar_connection {
        apply(NativeStep::Calendar)?;
    }
    apply(NativeStep::CommitDecision)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Preimage {
    name: String,
    bytes: Option<Vec<u8>>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Journal {
    schema_version: u32,
    transaction_id: String,
    phase: Phase,
    selection: RestoreSelection,
    preferences_before: Preferences,
    preferences_after: Preferences,
    candidates: NativeStores,
    files: Vec<Preimage>,
    calendar_previous_exists: bool,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupCounts {
    projects: usize,
    lists: usize,
    todos: usize,
    treatments: usize,
    medicines: usize,
    doses: usize,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPreview {
    digest: String,
    current_fingerprint: String,
    exported_at: String,
    counts: BackupCounts,
    has_calendar_connection: bool,
    preferences: Preferences,
    source_matches_current: bool,
    unmatched_calendar_bindings: usize,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePreferences {
    transaction_id: String,
    preferences: Preferences,
    recovery_path: Option<String>,
}

fn preference_key_allowed(key: &str) -> bool {
    matches!(
        key,
        "attention-hub.widget.v1"
            | "attention-hub.medicine-preferences.v1"
            | "attention-hub.todo-preferences.v1"
            | "attention-hub.calendar-skips.v1"
            | "attention-hub.focus-timer.v1"
            | "attention-hub.later-inbox-preferences.v1"
            | "attention-hub.widget.medicine-panel-upgrade.v1"
    ) || key
        .strip_prefix("attention-hub.floating-window.v1.")
        .is_some_and(|suffix| {
            matches!(
                suffix,
                "manager"
                    | "medicine"
                    | "sticky-note"
                    | "event-settings"
                    | "project-panel"
                    | "project-panel-notes"
                    | "project-panel-todos"
                    | "project-panel-todo"
            )
        })
}
fn validate_raw_preferences(preferences: &Preferences) -> Result<(), String> {
    let mut total = 0usize;
    for (key, raw) in preferences {
        total = total.saturating_add(raw.len());
        if !preference_key_allowed(key) || raw.len() > 512 * 1_024 || total > 1_024 * 1_024 {
            return Err("Backup settings contain unsupported or oversized data.".into());
        }
    }
    Ok(())
}
fn validate_preferences(preferences: &Preferences) -> Result<(), String> {
    validate_raw_preferences(preferences)?;
    for (key, raw) in preferences {
        if key == "attention-hub.widget.medicine-panel-upgrade.v1" {
            if raw != "1" {
                return Err("Backup settings contain an unsupported migration state.".into());
            }
            continue;
        }
        if key == "attention-hub.later-inbox-preferences.v1" {
            return Err("Export backup settings using the current To-do preferences.".into());
        }
        let value: Value = serde_json::from_str(raw)
            .map_err(|_| "Backup settings are not valid JSON.".to_owned())?;
        let valid_shape = if key == "attention-hub.calendar-skips.v1" {
            value.as_array().is_some_and(|records| {
                records.len() <= 10_000
                    && records.iter().all(|record| {
                        record
                            .get("occurrenceId")
                            .and_then(Value::as_str)
                            .is_some_and(|id| id.len() <= 256)
                            && record.get("expiresAt").and_then(Value::as_u64).is_some()
                    })
            })
        } else {
            value.is_object()
        };
        if !valid_shape {
            return Err("Backup settings have an unsupported structure.".into());
        }
    }
    Ok(())
}
fn validate_stores(stores: &NativeStores) -> Result<(), String> {
    workspace::validate_backup_value(&stores.workspace)?;
    medicine::validate_backup_value(&stores.medicine)?;
    sticky_note::validate_backup_value(&stores.sticky_note)
}
fn validate_backup(backup: &Backup) -> Result<(), String> {
    if backup.format != FORMAT
        || backup.schema_version != VERSION
        || DateTime::parse_from_rfc3339(&backup.exported_at).is_err()
    {
        return Err("Choose a supported Attention Hub full backup.".into());
    }
    validate_stores(&backup.stores)?;
    validate_preferences(&backup.preferences)?;
    if let Some(scope) = &backup.calendar_source_scope {
        if scope.len() != 64 || !scope.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err("Backup calendar identity is invalid.".into());
        }
    }
    if let Some(url) = &backup.calendar_connection {
        work_calendar::validate_backup_connection(url)?;
        if backup.calendar_source_scope.as_deref()
            != Some(work_calendar::backup_source_scope(url).as_str())
        {
            return Err("Backup calendar identity does not match its connection.".into());
        }
    }
    Ok(())
}
fn digest<T: Serialize>(value: &T) -> Result<String, String> {
    let bytes =
        serde_json::to_vec(value).map_err(|_| "Backup data could not be verified.".to_owned())?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}
fn fingerprint(
    stores: &NativeStores,
    preferences: &Preferences,
    scope: &Option<String>,
) -> Result<String, String> {
    digest(&(stores, preferences, scope))
}
fn profile(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(local_store::profile_dir)
        .map_err(|_| "Attention Hub could not resolve its backup directory.".into())
}
fn journal_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(profile(app)?.join(JOURNAL_NAME))
}
fn read_limited(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    let file = fs::File::open(path).map_err(|_| "Backup data could not be read.".to_owned())?;
    let size = file
        .metadata()
        .map_err(|_| "Backup data could not be read.".to_owned())?
        .len();
    if size > limit {
        return Err("Backup data exceeds the supported size limit.".into());
    }
    use std::io::Read;
    let mut bytes = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Backup data could not be read.".to_owned())?;
    if bytes.len() as u64 > limit {
        return Err("Backup data exceeds the supported size limit.".into());
    }
    Ok(bytes)
}
fn read_backup(path: &Path) -> Result<Backup, String> {
    let backup: Backup = serde_json::from_slice(&read_limited(path, MAX_BACKUP_BYTES)?)
        .map_err(|_| "The selected file is not a valid Attention Hub full backup.".to_owned())?;
    validate_backup(&backup)?;
    Ok(backup)
}
fn file_name_allowed(name: &str) -> bool {
    ["workspace", "medicine", "sticky-note"].iter().any(|stem| {
        name == format!("{stem}.json")
            || name == format!("{stem}.backup.json")
            || name == format!("{stem}.backup-cleanup-required.json")
    })
}
fn validate_journal(journal: &Journal) -> Result<(), String> {
    if journal.schema_version != VERSION
        || Uuid::parse_str(&journal.transaction_id).is_err()
        || journal.files.len() > 9
    {
        return Err(
            "The interrupted restore could not be verified. Local data remains protected.".into(),
        );
    }
    validate_raw_preferences(&journal.preferences_before)?;
    if journal.selection.settings {
        validate_preferences(&journal.preferences_after)?;
    } else {
        validate_raw_preferences(&journal.preferences_after)?;
    }
    validate_stores(&journal.candidates)?;
    let mut names = HashSet::new();
    for file in &journal.files {
        if !file_name_allowed(&file.name)
            || !names.insert(&file.name)
            || file
                .bytes
                .as_ref()
                .is_some_and(|bytes| bytes.len() as u64 > local_store::MAX_FILE_BYTES)
        {
            return Err("The interrupted restore contains invalid file recovery data.".into());
        }
    }
    let mut expected = HashSet::new();
    for (selected, stem) in [
        (journal.selection.workspace, "workspace"),
        (journal.selection.medicine, "medicine"),
        (journal.selection.sticky_note, "sticky-note"),
    ] {
        if selected {
            for suffix in ["json", "backup.json", "backup-cleanup-required.json"] {
                expected.insert(format!("{stem}.{suffix}"));
            }
        }
    }
    if names.iter().any(|name| !expected.contains(name.as_str())) || names.len() != expected.len() {
        return Err("The interrupted restore is missing required file recovery data.".into());
    }
    Ok(())
}
fn read_journal(app: &AppHandle) -> Result<Option<Journal>, String> {
    let path = journal_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let journal: Journal = serde_json::from_slice(&read_limited(&path, MAX_JOURNAL_BYTES)?)
        .map_err(|_| {
            "The interrupted restore journal could not be read. Local data remains protected."
                .to_owned()
        })?;
    validate_journal(&journal)?;
    Ok(Some(journal))
}
fn write_journal(app: &AppHandle, journal: &Journal) -> Result<(), String> {
    let bytes = serde_json::to_vec(journal)
        .map_err(|_| "Restore recovery data could not be prepared.".to_owned())?;
    if bytes.len() as u64 > MAX_JOURNAL_BYTES {
        return Err("Restore recovery data exceeds its supported limit.".into());
    }
    atomic_write(&journal_path(app)?, &bytes)
}
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or_else(|| "Backup destination is invalid.".to_owned())?;
    fs::create_dir_all(directory)
        .map_err(|_| "Backup recovery directory could not be prepared.".to_owned())?;
    let pending = path.with_extension(format!("pending-{}", std::process::id()));
    let result = (|| {
        let mut file = fs::File::create(&pending)
            .map_err(|_| "A pending backup write could not be created.".to_owned())?;
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(|_| "A pending backup write could not be completed.".to_owned())?;
        drop(file);
        replace_file(&pending, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&pending);
    }
    result
}
#[cfg(target_os = "windows")]
fn replace_file(pending: &Path, target: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::{
        core::PCWSTR,
        Win32::Storage::FileSystem::{
            MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
        },
    };
    let from: Vec<u16> = pending.as_os_str().encode_wide().chain(Some(0)).collect();
    let to: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe {
        MoveFileExW(
            PCWSTR(from.as_ptr()),
            PCWSTR(to.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    }
    .map_err(|_| "Backup data could not be committed safely.".into())
}
#[cfg(not(target_os = "windows"))]
fn replace_file(pending: &Path, target: &Path) -> Result<(), String> {
    fs::rename(pending, target).map_err(|_| "Backup data could not be committed safely.".into())
}
fn capture_files(paths: &[&Path]) -> Result<Vec<Preimage>, String> {
    let mut files = Vec::new();
    for path in paths {
        for candidate in [
            path.to_path_buf(),
            local_store::backup_path(path),
            local_store::backup_cleanup_marker_path(path),
        ] {
            let name = candidate
                .file_name()
                .and_then(|name| name.to_str())
                .filter(|name| file_name_allowed(name))
                .ok_or_else(|| "Restore file location is invalid.".to_owned())?
                .to_owned();
            let bytes = if candidate.exists() {
                Some(read_limited(&candidate, local_store::MAX_FILE_BYTES)?)
            } else {
                None
            };
            files.push(Preimage { name, bytes });
        }
    }
    Ok(files)
}
fn restore_files_with(
    directory: &Path,
    files: &[Preimage],
    mut restore: impl FnMut(&Path, &Option<Vec<u8>>) -> Result<(), String>,
) -> Result<(), String> {
    let mut failed = false;
    for file in files.iter().rev() {
        if restore(&directory.join(&file.name), &file.bytes).is_err() {
            failed = true;
        }
    }
    if failed {
        Err(
            "Some previous data could not be recovered. Restart Attention Hub to retry recovery."
                .into(),
        )
    } else {
        Ok(())
    }
}
fn restore_files(directory: &Path, files: &[Preimage]) -> Result<(), String> {
    restore_files_with(directory, files, |path, bytes| match bytes {
        Some(bytes) => atomic_write(path, bytes),
        None if path.exists() => {
            fs::remove_file(path).map_err(|_| "A replaced file could not be recovered.".into())
        }
        None => Ok(()),
    })
}
fn recover_native(app: &AppHandle, journal: &mut Journal) -> Result<(), String> {
    if journal.phase == Phase::Applying {
        let files = restore_files(&profile(app)?, &journal.files);
        let credential = if journal.selection.calendar_connection {
            work_calendar::recover_backup_calendar(journal.calendar_previous_exists)
        } else {
            Ok(())
        };
        files?;
        credential?;
    }
    if journal.phase != Phase::Committed {
        journal.phase = Phase::NativeRecovered;
        write_journal(app, journal)?;
    }
    Ok(())
}
fn cleanup(app: &AppHandle) -> Result<(), String> {
    work_calendar::cleanup_backup_calendar()?;
    let path = journal_path(app)?;
    if path.exists() {
        fs::remove_file(path)
            .map_err(|_| "Restore recovery cleanup is still required.".to_owned())?;
    }
    RESTORE_PENDING.store(false, Ordering::Release);
    Ok(())
}
/// Called from Tauri setup before any window can invoke a store command.
pub fn recover_before_stores(app: &AppHandle) -> Result<(), String> {
    if let Some(mut journal) = read_journal(app)? {
        RESTORE_PENDING.store(true, Ordering::Release);
        if journal.phase == Phase::Committed {
            let _ = cleanup(app);
            RESTORE_PENDING.store(false, Ordering::Release);
        } else {
            recover_native(app, &mut journal)?;
        }
    } else {
        let _ = work_calendar::cleanup_backup_calendar();
    }
    Ok(())
}
fn advanced_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "advanced" {
        Ok(())
    } else {
        Err("Open Backup & restore in Advanced to use this action.".into())
    }
}
fn no_pending(app: &AppHandle) -> Result<(), String> {
    if restore_is_pending() || journal_path(app)?.exists() {
        Err("Finish the pending restore before starting another backup action.".into())
    } else {
        Ok(())
    }
}
fn count(value: &Value, name: &str) -> usize {
    value
        .get(name)
        .and_then(Value::as_array)
        .map_or(0, Vec::len)
}

#[tauri::command]
// Tauri injects each independently gated native store as a separate State argument.
#[allow(clippy::too_many_arguments)]
pub async fn export_app_backup(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppBackupState>,
    calendar: State<'_, work_calendar::WorkCalendarState>,
    workspace: State<'_, workspace::WorkspaceState>,
    medicine: State<'_, medicine::MedicineState>,
    sticky: State<'_, sticky_note::StickyNoteState>,
    destination_path: String,
    preferences: Preferences,
    include_calendar_connection: bool,
) -> Result<String, String> {
    advanced_only(&window)?;
    validate_preferences(&preferences)?;
    let _gate = state.gate.lock().await;
    no_pending(&app)?;
    let calendar_session = work_calendar::backup_session(calendar.inner()).await?;
    let workspace_session = workspace::backup_session(&app, workspace.inner())?;
    let medicine_session = medicine::backup_session(&app, medicine.inner())?;
    let sticky_session = sticky_note::backup_session(&app, sticky.inner())?;
    let mut connection = calendar_session.connection()?;
    let scope = connection
        .as_deref()
        .map(work_calendar::backup_source_scope);
    if !include_calendar_connection {
        if let Some(value) = connection.as_mut() {
            work_calendar::erase_backup_secret(value);
        }
        connection = None;
    }
    let backup = Backup {
        format: FORMAT.into(),
        schema_version: VERSION,
        exported_at: Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
        stores: NativeStores {
            workspace: workspace_session.value()?,
            medicine: medicine_session.value()?,
            sticky_note: sticky_session.value()?,
        },
        preferences,
        calendar_source_scope: scope,
        calendar_connection: connection,
    };
    validate_backup(&backup)?;
    let path = PathBuf::from(destination_path.trim());
    let parent = path
        .parent()
        .filter(|directory| directory.is_dir())
        .ok_or_else(|| "Choose an available backup destination.".to_owned())?;
    let resolved_parent =
        fs::canonicalize(parent).map_err(|_| "Backup destination is unavailable.".to_owned())?;
    if let Ok(data_directory) = fs::canonicalize(profile(&app)?) {
        if resolved_parent.starts_with(data_directory) {
            return Err(
                "Choose a backup destination outside Attention Hub's active data directory.".into(),
            );
        }
    }
    let bytes = serde_json::to_vec_pretty(&backup)
        .map_err(|_| "Full backup could not be prepared.".to_owned())?;
    if bytes.len() as u64 > MAX_BACKUP_BYTES {
        return Err("Full backup exceeds the supported size limit.".into());
    }
    atomic_write(&path, &bytes)?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn preview_app_backup(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppBackupState>,
    calendar: State<'_, work_calendar::WorkCalendarState>,
    workspace: State<'_, workspace::WorkspaceState>,
    medicine: State<'_, medicine::MedicineState>,
    sticky: State<'_, sticky_note::StickyNoteState>,
    source_path: String,
    current_preferences: Preferences,
) -> Result<BackupPreview, String> {
    advanced_only(&window)?;
    validate_raw_preferences(&current_preferences)?;
    let _gate = state.gate.lock().await;
    no_pending(&app)?;
    let backup = read_backup(Path::new(source_path.trim()))?;
    let calendar_session = work_calendar::backup_session(calendar.inner()).await?;
    let workspace_session = workspace::backup_session(&app, workspace.inner())?;
    let medicine_session = medicine::backup_session(&app, medicine.inner())?;
    let sticky_session = sticky_note::backup_session(&app, sticky.inner())?;
    let scope = calendar_session.scope()?;
    let stores = NativeStores {
        workspace: workspace_session.value()?,
        medicine: medicine_session.value()?,
        sticky_note: sticky_session.value()?,
    };
    let source_matches_current =
        backup.calendar_source_scope.is_some() && backup.calendar_source_scope == scope;
    let counts = BackupCounts {
        projects: count(&backup.stores.workspace, "projects"),
        lists: count(&backup.stores.workspace, "lists"),
        todos: count(&backup.stores.workspace, "actionItems"),
        treatments: count(&backup.stores.medicine, "treatments"),
        medicines: count(&backup.stores.medicine, "medicines"),
        doses: count(&backup.stores.medicine, "doses"),
    };
    Ok(BackupPreview {
        digest: digest(&backup)?,
        current_fingerprint: fingerprint(&stores, &current_preferences, &scope)?,
        exported_at: backup.exported_at,
        counts,
        has_calendar_connection: backup.calendar_connection.is_some(),
        unmatched_calendar_bindings: if source_matches_current {
            0
        } else {
            count(&backup.stores.workspace, "bindings")
        },
        source_matches_current,
        preferences: backup.preferences,
    })
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn begin_app_backup_restore(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppBackupState>,
    calendar: State<'_, work_calendar::WorkCalendarState>,
    workspace: State<'_, workspace::WorkspaceState>,
    medicine: State<'_, medicine::MedicineState>,
    sticky: State<'_, sticky_note::StickyNoteState>,
    source_path: String,
    expected_digest: String,
    expected_current_fingerprint: String,
    current_preferences: Preferences,
    recovery_preferences: Preferences,
    selection: RestoreSelection,
) -> Result<RestorePreferences, String> {
    advanced_only(&window)?;
    validate_raw_preferences(&current_preferences)?;
    validate_preferences(&recovery_preferences)?;
    let _gate = state.gate.lock().await;
    no_pending(&app)?;
    if !selection.settings
        && !selection.workspace
        && !selection.medicine
        && !selection.sticky_note
        && !selection.calendar_connection
    {
        return Err("Choose at least one part of the backup to restore.".into());
    }
    if app
        .webview_windows()
        .keys()
        .any(|label| label != "main" && label != "advanced")
    {
        return Err("Close other Attention Hub windows before restoring a backup.".into());
    }
    let backup = read_backup(Path::new(source_path.trim()))?;
    if digest(&backup)? != expected_digest {
        return Err("The backup changed after preview. Select it again.".into());
    }
    let calendar_session = work_calendar::backup_session(calendar.inner()).await?;
    if selection.calendar_connection {
        let url = backup
            .calendar_connection
            .as_deref()
            .ok_or_else(|| "This backup does not include a calendar connection.".to_owned())?;
        calendar_session.verify_connection(url).await?;
    }
    let workspace_session = workspace::backup_session(&app, workspace.inner())?;
    let medicine_session = medicine::backup_session(&app, medicine.inner())?;
    let sticky_session = sticky_note::backup_session(&app, sticky.inner())?;
    let current = NativeStores {
        workspace: workspace_session.value()?,
        medicine: medicine_session.value()?,
        sticky_note: sticky_session.value()?,
    };
    let scope = calendar_session.scope()?;
    if fingerprint(&current, &current_preferences, &scope)? != expected_current_fingerprint {
        return Err(
            "Local data changed after preview. Review the backup again before restoring.".into(),
        );
    }
    // One importable pre-restore copy survives successful journal cleanup. Its
    // settings are normalized by the frontend; exact raw strings remain in the
    // transaction journal for rollback. Publication URLs never enter this copy.
    let recovery_path = profile(&app)?.join(RECOVERY_NAME);
    let recovery = Backup {
        format: FORMAT.into(),
        schema_version: VERSION,
        exported_at: Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
        stores: current.clone(),
        preferences: recovery_preferences,
        calendar_source_scope: scope,
        calendar_connection: None,
    };
    validate_backup(&recovery)?;
    let recovery_bytes = serde_json::to_vec_pretty(&recovery)
        .map_err(|_| "The pre-restore recovery backup could not be prepared.".to_owned())?;
    if recovery_bytes.len() as u64 > MAX_BACKUP_BYTES {
        return Err("The recovery backup exceeds its supported size limit.".into());
    }
    atomic_write(&recovery_path, &recovery_bytes)?;
    let candidates = NativeStores {
        workspace: if selection.workspace {
            workspace_session.prepare_import(&backup.stores.workspace)?
        } else {
            current.workspace
        },
        medicine: if selection.medicine {
            medicine_session.prepare_import(&backup.stores.medicine)?
        } else {
            current.medicine
        },
        sticky_note: if selection.sticky_note {
            sticky_session.prepare_import(&backup.stores.sticky_note)?
        } else {
            current.sticky_note
        },
    };
    let mut paths: Vec<&Path> = Vec::new();
    if selection.workspace {
        paths.push(workspace_session.path());
    }
    if selection.medicine {
        paths.push(medicine_session.path());
    }
    if selection.sticky_note {
        paths.push(sticky_session.path());
    }
    let files = capture_files(&paths)?;
    if app
        .webview_windows()
        .keys()
        .any(|label| label != "main" && label != "advanced")
    {
        return Err(
            "Another Attention Hub window opened during preview. Close it before restoring.".into(),
        );
    }
    let preferences_after = if selection.settings {
        backup.preferences
    } else {
        current_preferences.clone()
    };
    let transaction_id = Uuid::new_v4().to_string();
    let mut journal = Journal {
        schema_version: VERSION,
        transaction_id: transaction_id.clone(),
        phase: Phase::Prepared,
        selection,
        preferences_before: current_preferences,
        preferences_after: preferences_after.clone(),
        candidates,
        files,
        calendar_previous_exists: false,
    };
    // Set while all existing store gates are held. Waiters recheck after locking.
    RESTORE_PENDING.store(true, Ordering::Release);
    let staged = (|| {
        if selection.calendar_connection {
            journal.calendar_previous_exists = calendar_session
                .stage_connection(backup.calendar_connection.as_deref().unwrap())?;
        }
        write_journal(&app, &journal)
    })();
    if let Err(error) = staged {
        let _ = work_calendar::cleanup_backup_calendar();
        RESTORE_PENDING.store(false, Ordering::Release);
        return Err(error);
    }
    Ok(RestorePreferences {
        transaction_id,
        preferences: preferences_after,
        recovery_path: Some(recovery_path.to_string_lossy().into_owned()),
    })
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn finish_app_backup_restore(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppBackupState>,
    calendar: State<'_, work_calendar::WorkCalendarState>,
    workspace: State<'_, workspace::WorkspaceState>,
    medicine: State<'_, medicine::MedicineState>,
    sticky: State<'_, sticky_note::StickyNoteState>,
    transaction_id: String,
    commit: bool,
) -> Result<(), String> {
    if window.label() != "advanced" && window.label() != "main" {
        return Err("Restore completion is unavailable in this window.".into());
    }
    if commit {
        advanced_only(&window)?;
    }
    let _gate = state.gate.lock().await;
    let mut journal =
        read_journal(&app)?.ok_or_else(|| "There is no pending restore.".to_owned())?;
    if journal.transaction_id != transaction_id {
        return Err("This restore transaction is no longer current.".into());
    }
    if journal.phase == Phase::Committed {
        RESTORE_PENDING.store(false, Ordering::Release);
        return if commit {
            Ok(())
        } else {
            Err("This restore was already committed.".into())
        };
    }
    RESTORE_PENDING.store(true, Ordering::Release);
    let calendar_session = work_calendar::backup_session(calendar.inner()).await?;
    let mut workspace_session = workspace::backup_session(&app, workspace.inner())?;
    let mut medicine_session = medicine::backup_session(&app, medicine.inner())?;
    let mut sticky_session = sticky_note::backup_session(&app, sticky.inner())?;
    if !commit {
        recover_native(&app, &mut journal)?;
        calendar_session.invalidate_on_restore();
        return cleanup(&app);
    }
    if journal.phase != Phase::Prepared {
        return Err(
            "This restore was rolled back. Restore the previous settings before continuing.".into(),
        );
    }
    if app
        .webview_windows()
        .keys()
        .any(|label| label != "main" && label != "advanced")
    {
        return Err("Close other Attention Hub windows before committing the restore.".into());
    }
    journal.phase = Phase::Applying;
    write_journal(&app, &journal)?;
    let applied = apply_steps(journal.selection, |step| match step {
        NativeStep::Workspace => workspace_session.commit(&journal.candidates.workspace),
        NativeStep::Medicine => medicine_session.commit(&journal.candidates.medicine),
        NativeStep::StickyNote => sticky_session.commit(&journal.candidates.sticky_note),
        NativeStep::RetainedBackups => {
            // The full recovery copy owns the previous active data. Existing
            // per-domain backup files retain their pre-restore contents too.
            let retained: Vec<Preimage> = journal
                .files
                .iter()
                .filter(|file| file.name.ends_with(".backup.json"))
                .map(|file| Preimage {
                    name: file.name.clone(),
                    bytes: file.bytes.clone(),
                })
                .collect();
            restore_files(&profile(&app)?, &retained)
        }
        NativeStep::Calendar => calendar_session.commit_connection(),
        NativeStep::CommitDecision => {
            journal.phase = Phase::Committed;
            write_journal(&app, &journal)
        }
    });
    if applied.is_err() {
        journal.phase = Phase::Applying;
        recover_native(&app, &mut journal)?;
        calendar_session.invalidate_on_restore();
        return Err("The restore could not finish. Previous native data was recovered; restore the previous settings to finish rollback.".into());
    }
    // Retain the durable decision until the frontend acknowledges it. A lost
    // IPC reply can then be distinguished from a failed native commit.
    calendar_session.invalidate_on_restore();
    RESTORE_PENDING.store(false, Ordering::Release);
    Ok(())
}

#[tauri::command]
pub async fn recover_app_backup_restore(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppBackupState>,
) -> Result<Option<RestorePreferences>, String> {
    if window.label() != "main" {
        return Err("Startup recovery is available only in the main window.".into());
    }
    let _gate = state.gate.lock().await;
    let Some(mut journal) = read_journal(&app)? else {
        return Ok(None);
    };
    RESTORE_PENDING.store(true, Ordering::Release);
    if journal.phase == Phase::Committed {
        let _ = cleanup(&app);
        RESTORE_PENDING.store(false, Ordering::Release);
        return Ok(None);
    }
    recover_native(&app, &mut journal)?;
    Ok(Some(RestorePreferences {
        transaction_id: journal.transaction_id,
        preferences: journal.preferences_before,
        recovery_path: None,
    }))
}

#[tauri::command]
pub async fn get_app_backup_restore_status(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppBackupState>,
    transaction_id: String,
) -> Result<String, String> {
    if window.label() != "advanced" && window.label() != "main" {
        return Err("Restore status is unavailable in this window.".into());
    }
    let _gate = state.gate.lock().await;
    let journal = read_journal(&app)?.ok_or_else(|| "The restore decision is unavailable. Restart to reconcile recovery before changing settings.".to_owned())?;
    if journal.transaction_id != transaction_id {
        return Err("This restore transaction is no longer current.".into());
    }
    Ok(phase_decision(journal.phase).into())
}

#[tauri::command]
pub async fn ack_app_backup_restore(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppBackupState>,
    transaction_id: String,
) -> Result<(), String> {
    if window.label() != "advanced" && window.label() != "main" {
        return Err("Restore acknowledgement is unavailable in this window.".into());
    }
    let _gate = state.gate.lock().await;
    let journal = read_journal(&app)?
        .ok_or_else(|| "There is no restore decision to acknowledge.".to_owned())?;
    if journal.transaction_id != transaction_id || journal.phase != Phase::Committed {
        return Err("Only a confirmed successful restore can be acknowledged.".into());
    }
    cleanup(&app)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preference_allowlist_rejects_private_caches_and_unknown_geometry() {
        assert!(preference_key_allowed("attention-hub.widget.v1"));
        assert!(preference_key_allowed(
            "attention-hub.widget.medicine-panel-upgrade.v1"
        ));
        assert!(preference_key_allowed(
            "attention-hub.later-inbox-preferences.v1"
        ));
        assert!(preference_key_allowed(
            "attention-hub.floating-window.v1.project-panel-todo"
        ));
        for key in [
            "attention-hub.work-calendar-display-cache.v1",
            "attention-hub.update-prompt.v1",
            "attention-hub.floating-window.v1.unknown",
        ] {
            assert!(!preference_key_allowed(key));
        }
    }
    #[test]
    fn raw_settings_fingerprint_preserves_exact_preimage() {
        let a: Preferences = [("attention-hub.widget.v1".into(), "{\"x\":1}".into())].into();
        let b: Preferences = [("attention-hub.widget.v1".into(), "{ \"x\":1 }".into())].into();
        validate_preferences(&a).unwrap();
        validate_preferences(&b).unwrap();
        assert_ne!(digest(&a).unwrap(), digest(&b).unwrap());
    }
    #[test]
    fn recovery_attempts_all_preimages_after_an_injected_failure() {
        let files = vec![
            Preimage {
                name: "workspace.json".into(),
                bytes: Some(vec![1]),
            },
            Preimage {
                name: "medicine.json".into(),
                bytes: None,
            },
            Preimage {
                name: "sticky-note.json".into(),
                bytes: Some(vec![3]),
            },
        ];
        let mut calls = Vec::new();
        let result = restore_files_with(Path::new("test-profile"), &files, |path, _| {
            calls.push(path.file_name().unwrap().to_string_lossy().into_owned());
            if path.ends_with("medicine.json") {
                Err("Injected failure".into())
            } else {
                Ok(())
            }
        });
        assert!(result.is_err());
        assert_eq!(
            calls,
            ["sticky-note.json", "medicine.json", "workspace.json"]
        );
    }
    #[test]
    fn recovery_paths_cannot_escape_profile() {
        assert!(file_name_allowed("medicine.backup.json"));
        for name in [
            "../workspace.json",
            "C:\\workspace.json",
            "app-restore-journal.json",
            "other.json",
        ] {
            assert!(!file_name_allowed(name));
        }
    }
    #[test]
    fn malformed_preferences_are_recoverable_without_becoming_exportable() {
        let raw: Preferences = [(
            "attention-hub.widget.v1".into(),
            "invalid JSON before restore".into(),
        )]
        .into();
        validate_raw_preferences(&raw).unwrap();
        assert!(validate_preferences(&raw).is_err());
        let marker: Preferences = [(
            "attention-hub.widget.medicine-panel-upgrade.v1".into(),
            "1".into(),
        )]
        .into();
        validate_preferences(&marker).unwrap();
        let legacy: Preferences = [(
            "attention-hub.later-inbox-preferences.v1".into(),
            "{}".into(),
        )]
        .into();
        validate_raw_preferences(&legacy).unwrap();
        assert!(validate_preferences(&legacy).is_err());
    }
    #[test]
    fn lost_ipc_reply_can_be_reconciled_from_the_durable_commit_phase() {
        // Simulate process restart by discarding the original in-memory phase.
        let written = serde_json::to_vec(&Phase::Committed).unwrap();
        let reloaded: Phase = serde_json::from_slice(&written).unwrap();
        assert_eq!(phase_decision(reloaded), "committed");
        for phase in [Phase::Prepared, Phase::Applying, Phase::NativeRecovered] {
            let written = serde_json::to_vec(&phase).unwrap();
            let reloaded: Phase = serde_json::from_slice(&written).unwrap();
            assert_eq!(phase_decision(reloaded), "pending");
        }
    }
    #[test]
    fn failures_at_every_commit_boundary_recover_original_files_and_backups() {
        let directory =
            std::env::temp_dir().join(format!("attention-hub-restore-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let selection = RestoreSelection {
            settings: true,
            workspace: true,
            medicine: true,
            sticky_note: true,
            calendar_connection: true,
        };
        for failure in [
            NativeStep::Workspace,
            NativeStep::Medicine,
            NativeStep::StickyNote,
            NativeStep::RetainedBackups,
            NativeStep::Calendar,
            NativeStep::CommitDecision,
        ] {
            let workspace = directory.join("workspace.json");
            let medicine = directory.join("medicine.json");
            let sticky = directory.join("sticky-note.json");
            for path in [&workspace, &medicine, &sticky] {
                atomic_write(path, b"old primary").unwrap();
                atomic_write(&local_store::backup_path(path), b"old bounded backup").unwrap();
            }
            let preimages = capture_files(&[&workspace, &medicine, &sticky]).unwrap();
            let mut calendar_changed = false;
            let result = apply_steps(selection, |step| {
                if step == failure {
                    return Err("Injected commit-stage failure".into());
                }
                let path = match step {
                    NativeStep::Workspace => Some(&workspace),
                    NativeStep::Medicine => Some(&medicine),
                    NativeStep::StickyNote => Some(&sticky),
                    _ => None,
                };
                if let Some(path) = path {
                    atomic_write(&local_store::backup_path(path), b"overwritten backup")?;
                    atomic_write(path, b"new primary")?;
                }
                if step == NativeStep::Calendar {
                    calendar_changed = true;
                }
                Ok(())
            });
            assert!(result.is_err());
            restore_files(&directory, &preimages).unwrap();
            // The credential rollback adapter follows the same previous-state
            // decision; this test never reads a real Windows credential.
            if calendar_changed {
                calendar_changed = false;
            }
            assert!(!calendar_changed);
            for path in [&workspace, &medicine, &sticky] {
                assert_eq!(fs::read(path).unwrap(), b"old primary");
                assert_eq!(
                    fs::read(local_store::backup_path(path)).unwrap(),
                    b"old bounded backup"
                );
            }
        }
        for entry in fs::read_dir(&directory).unwrap() {
            fs::remove_file(entry.unwrap().path()).unwrap();
        }
        fs::remove_dir(&directory).unwrap();
    }
}
