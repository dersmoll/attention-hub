use std::{
    collections::HashSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};

use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

const SCHEMA_VERSION: u32 = 3;
const MAX_ITEMS: usize = 1_000;
const MAX_FILE_BYTES: u64 = 1_048_576;
const MAX_TITLE_CHARS: usize = 160;
const MAX_NOTE_CHARS: usize = 4_000;
const MAX_NOTE_SEGMENTS: usize = 256;
const MAX_NOTE_LINKS: usize = 25;
const MAX_URL_CHARS: usize = 2_048;
static ITEM_COUNTER: AtomicU64 = AtomicU64::new(0);

pub struct LaterInboxState {
    gate: Mutex<()>,
}

impl LaterInboxState {
    pub fn new() -> Self {
        Self {
            gate: Mutex::new(()),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LaterInboxItem {
    pub id: String,
    pub scope: LaterInboxScope,
    pub title: String,
    pub notes: Vec<LaterInboxNoteSegment>,
    pub url: Option<String>,
    pub follow_up_at: Option<String>,
    pub notified_follow_up_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaterInboxInput {
    pub scope: LaterInboxScope,
    pub title: String,
    #[serde(default)]
    pub notes: Vec<LaterInboxNoteSegment>,
    pub url: Option<String>,
    pub follow_up_at: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LaterInboxScope {
    Work,
    Private,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LaterInboxNoteSegment {
    pub text: String,
    pub href: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaterInboxSnapshot {
    pub schema_version: u32,
    pub captured_at: String,
    pub storage_path: String,
    pub recovered_from_backup: bool,
    pub items: Vec<LaterInboxItem>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LaterInboxStore {
    schema_version: u32,
    items: Vec<LaterInboxItem>,
}

impl LaterInboxStore {
    fn empty() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            items: Vec::new(),
        }
    }
}

#[derive(Debug)]
enum StoreReadError {
    OldVersion,
    FutureVersion(u64),
    Invalid,
    Unavailable,
}

#[derive(Debug)]
struct LoadedStore {
    store: LaterInboxStore,
    recovered_from_backup: bool,
}

pub fn get_snapshot(
    app: &AppHandle,
    state: &LaterInboxState,
) -> Result<LaterInboxSnapshot, String> {
    let _guard = state
        .gate
        .lock()
        .map_err(|_| "Later Inbox storage is temporarily unavailable.".to_owned())?;
    let path = storage_path(app)?;
    let loaded = load_store(&path)?;
    Ok(snapshot(path, loaded))
}

pub fn create_item(
    app: &AppHandle,
    state: &LaterInboxState,
    input: LaterInboxInput,
) -> Result<LaterInboxSnapshot, String> {
    mutate(app, state, |store| {
        if store.items.len() >= MAX_ITEMS {
            return Err("Later Inbox has reached its 1,000-item safety limit.".to_owned());
        }
        let input = normalize_input(input)?;
        let now = timestamp_now();
        store.items.push(LaterInboxItem {
            id: next_item_id(),
            scope: input.scope,
            title: input.title,
            notes: input.notes,
            url: input.url,
            follow_up_at: input.follow_up_at,
            notified_follow_up_at: None,
            created_at: now.clone(),
            updated_at: now,
            completed_at: None,
        });
        Ok(())
    })
}

pub fn update_item(
    app: &AppHandle,
    state: &LaterInboxState,
    item_id: &str,
    input: LaterInboxInput,
) -> Result<LaterInboxSnapshot, String> {
    mutate(app, state, |store| {
        let input = normalize_input(input)?;
        let item = store
            .items
            .iter_mut()
            .find(|item| item.id == item_id)
            .ok_or_else(|| "The Later Inbox item no longer exists.".to_owned())?;
        let follow_up_changed = item.follow_up_at != input.follow_up_at;
        item.scope = input.scope;
        item.title = input.title;
        item.notes = input.notes;
        item.url = input.url;
        item.follow_up_at = input.follow_up_at;
        if follow_up_changed {
            item.notified_follow_up_at = None;
        }
        item.updated_at = timestamp_now();
        Ok(())
    })
}

pub fn complete_item(
    app: &AppHandle,
    state: &LaterInboxState,
    item_id: &str,
) -> Result<LaterInboxSnapshot, String> {
    mutate(app, state, |store| {
        let item = store
            .items
            .iter_mut()
            .find(|item| item.id == item_id)
            .ok_or_else(|| "The Later Inbox item no longer exists.".to_owned())?;
        let now = timestamp_now();
        item.completed_at = Some(now.clone());
        item.updated_at = now;
        Ok(())
    })
}

pub fn restore_item(
    app: &AppHandle,
    state: &LaterInboxState,
    item_id: &str,
) -> Result<LaterInboxSnapshot, String> {
    mutate(app, state, |store| {
        let item = store
            .items
            .iter_mut()
            .find(|item| item.id == item_id)
            .ok_or_else(|| "The Later Inbox item no longer exists.".to_owned())?;
        item.completed_at = None;
        item.updated_at = timestamp_now();
        Ok(())
    })
}

pub fn delete_completed(
    app: &AppHandle,
    state: &LaterInboxState,
) -> Result<LaterInboxSnapshot, String> {
    mutate_with_backup(app, state, false, |store| {
        store.items.retain(|item| item.completed_at.is_none());
        Ok(())
    })
}

pub fn delete_all(app: &AppHandle, state: &LaterInboxState) -> Result<LaterInboxSnapshot, String> {
    mutate_with_backup(app, state, false, |store| {
        store.items.clear();
        Ok(())
    })
}

pub fn notify_due(app: &AppHandle, state: &LaterInboxState) -> Result<LaterInboxSnapshot, String> {
    let _guard = state
        .gate
        .lock()
        .map_err(|_| "Later Inbox storage is temporarily unavailable.".to_owned())?;
    let path = storage_path(app)?;
    let mut loaded = load_store(&path)?;
    let now = Utc::now();
    let due_indices = loaded
        .store
        .items
        .iter()
        .enumerate()
        .filter_map(|(index, item)| item_due_for_notification(item, now).then_some(index))
        .collect::<Vec<_>>();

    if due_indices.is_empty() {
        return Ok(snapshot(path, loaded));
    }

    let body = if due_indices.len() == 1 {
        let item = &loaded.store.items[due_indices[0]];
        match item.scope {
            LaterInboxScope::Work => format!("Follow up: {}", item.title),
            LaterInboxScope::Private => "A private item is due.".to_owned(),
        }
    } else {
        format!("{} items are due.", due_indices.len())
    };

    for index in due_indices {
        let item = &mut loaded.store.items[index];
        item.notified_follow_up_at.clone_from(&item.follow_up_at);
    }
    write_store(&path, &loaded.store, true)?;
    loaded.recovered_from_backup = false;

    app.notification()
        .builder()
        .title("Later Inbox")
        .body(body)
        .show()
        .map_err(|_| "Windows could not show the Later Inbox notification.".to_owned())?;

    Ok(snapshot(path, loaded))
}

fn item_due_for_notification(item: &LaterInboxItem, now: DateTime<Utc>) -> bool {
    if item.completed_at.is_some() || item.follow_up_at.is_none() {
        return false;
    }
    let follow_up = item
        .follow_up_at
        .as_deref()
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.with_timezone(&Utc));
    follow_up.is_some_and(|value| value <= now) && item.notified_follow_up_at != item.follow_up_at
}

pub fn item_url(app: &AppHandle, state: &LaterInboxState, item_id: &str) -> Result<String, String> {
    let _guard = state
        .gate
        .lock()
        .map_err(|_| "Later Inbox storage is temporarily unavailable.".to_owned())?;
    let path = storage_path(app)?;
    let loaded = load_store(&path)?;
    let url = loaded
        .store
        .items
        .iter()
        .find(|item| item.id == item_id)
        .and_then(|item| item.url.clone())
        .ok_or_else(|| "This Later Inbox item has no saved link.".to_owned())?;
    normalize_url(&url)
}

pub fn item_note_url(
    app: &AppHandle,
    state: &LaterInboxState,
    item_id: &str,
    requested_url: &str,
) -> Result<String, String> {
    let requested_url = normalize_url(requested_url)?;
    let _guard = state
        .gate
        .lock()
        .map_err(|_| "Later Inbox storage is temporarily unavailable.".to_owned())?;
    let path = storage_path(app)?;
    let loaded = load_store(&path)?;
    let item = loaded
        .store
        .items
        .iter()
        .find(|item| item.id == item_id)
        .ok_or_else(|| "The Later Inbox item no longer exists.".to_owned())?;
    item_contains_note_url(item, &requested_url)
        .then_some(requested_url)
        .ok_or_else(|| "This link is not present in the saved Later Inbox note.".to_owned())
}

fn item_contains_note_url(item: &LaterInboxItem, requested_url: &str) -> bool {
    item.notes
        .iter()
        .filter_map(|segment| segment.href.as_deref())
        .any(|href| normalize_url(href).is_ok_and(|href| href == requested_url))
}

#[cfg(target_os = "windows")]
pub fn open_external_url(url: &str) -> Result<(), String> {
    use windows::{
        core::PCWSTR,
        Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
    };

    let action = "open\0".encode_utf16().collect::<Vec<_>>();
    let target = format!("{url}\0").encode_utf16().collect::<Vec<_>>();
    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(action.as_ptr()),
            PCWSTR(target.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    if result.0 as isize > 32 {
        Ok(())
    } else {
        Err("Windows could not open the validated link.".to_owned())
    }
}

#[cfg(not(target_os = "windows"))]
pub fn open_external_url(_url: &str) -> Result<(), String> {
    Err("Opening Later Inbox links is supported only on Windows.".to_owned())
}

fn mutate<F>(
    app: &AppHandle,
    state: &LaterInboxState,
    action: F,
) -> Result<LaterInboxSnapshot, String>
where
    F: FnOnce(&mut LaterInboxStore) -> Result<(), String>,
{
    mutate_with_backup(app, state, true, action)
}

fn mutate_with_backup<F>(
    app: &AppHandle,
    state: &LaterInboxState,
    preserve_backup: bool,
    action: F,
) -> Result<LaterInboxSnapshot, String>
where
    F: FnOnce(&mut LaterInboxStore) -> Result<(), String>,
{
    let _guard = state
        .gate
        .lock()
        .map_err(|_| "Later Inbox storage is temporarily unavailable.".to_owned())?;
    let path = storage_path(app)?;
    let mut loaded = load_store(&path)?;
    action(&mut loaded.store)?;
    write_store(&path, &loaded.store, preserve_backup)?;
    loaded.recovered_from_backup = false;
    Ok(snapshot(path, loaded))
}

fn snapshot(path: PathBuf, loaded: LoadedStore) -> LaterInboxSnapshot {
    LaterInboxSnapshot {
        schema_version: SCHEMA_VERSION,
        captured_at: timestamp_now(),
        storage_path: path.to_string_lossy().into_owned(),
        recovered_from_backup: loaded.recovered_from_backup,
        items: loaded.store.items,
    }
}

fn storage_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join("later-inbox.json"))
        .map_err(|_| "Attention Hub could not resolve its local data directory.".to_owned())
}

fn backup_path(path: &Path) -> PathBuf {
    path.with_file_name("later-inbox.backup.json")
}

fn temporary_path(path: &Path) -> PathBuf {
    path.with_file_name("later-inbox.pending.json")
}

fn load_store(path: &Path) -> Result<LoadedStore, String> {
    if !path.exists() {
        let pending = temporary_path(path);
        if pending.exists() {
            if let Ok(store) = read_store(&pending) {
                return Ok(LoadedStore {
                    store,
                    recovered_from_backup: true,
                });
            }
        }
        let backup = backup_path(path);
        if backup.exists() {
            return match read_store(&backup) {
                Ok(store) => Ok(LoadedStore {
                    store,
                    recovered_from_backup: true,
                }),
                Err(StoreReadError::OldVersion) => Ok(LoadedStore {
                    store: LaterInboxStore::empty(),
                    recovered_from_backup: false,
                }),
                Err(error) => Err(store_error_message(error)),
            };
        }
        return Ok(LoadedStore {
            store: LaterInboxStore::empty(),
            recovered_from_backup: false,
        });
    }

    match read_store(path) {
        Ok(store) => Ok(LoadedStore {
            store,
            recovered_from_backup: false,
        }),
        Err(StoreReadError::FutureVersion(version)) => Err(format!(
            "Later Inbox uses newer schema version {version}; this build will not overwrite it."
        )),
        Err(StoreReadError::OldVersion) => Ok(LoadedStore {
            store: LaterInboxStore::empty(),
            recovered_from_backup: false,
        }),
        Err(StoreReadError::Invalid | StoreReadError::Unavailable) => {
            let backup = backup_path(path);
            match read_store(&backup) {
                Ok(store) => Ok(LoadedStore {
                    store,
                    recovered_from_backup: true,
                }),
                Err(StoreReadError::OldVersion) => Ok(LoadedStore {
                    store: LaterInboxStore::empty(),
                    recovered_from_backup: false,
                }),
                Err(_) => Err(
                    "Later Inbox data could not be read, and no valid local backup is available."
                        .to_owned(),
                ),
            }
        }
    }
}

fn read_store(path: &Path) -> Result<LaterInboxStore, StoreReadError> {
    let metadata = fs::metadata(path).map_err(|_| StoreReadError::Unavailable)?;
    if metadata.len() > MAX_FILE_BYTES {
        return Err(StoreReadError::Invalid);
    }
    let bytes = fs::read(path).map_err(|_| StoreReadError::Unavailable)?;
    let value: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|_| StoreReadError::Invalid)?;
    let version = value
        .get("schemaVersion")
        .and_then(serde_json::Value::as_u64)
        .ok_or(StoreReadError::Invalid)?;
    if version > u64::from(SCHEMA_VERSION) {
        return Err(StoreReadError::FutureVersion(version));
    }
    if version < u64::from(SCHEMA_VERSION) {
        return Err(StoreReadError::OldVersion);
    }
    let store = serde_json::from_value(value).map_err(|_| StoreReadError::Invalid)?;
    if !valid_loaded_store(&store) {
        return Err(StoreReadError::Invalid);
    }
    Ok(store)
}

fn valid_loaded_store(store: &LaterInboxStore) -> bool {
    if store.schema_version != SCHEMA_VERSION || store.items.len() > MAX_ITEMS {
        return false;
    }
    let mut ids = HashSet::new();
    store.items.iter().all(|item| {
        !item.id.is_empty()
            && item.id.chars().count() <= 128
            && ids.insert(item.id.as_str())
            && !item.title.trim().is_empty()
            && item.title.chars().count() <= MAX_TITLE_CHARS
            && valid_note_segments(&item.notes)
            && item
                .url
                .as_ref()
                .is_none_or(|value| normalize_url(value).is_ok())
            && item
                .follow_up_at
                .as_ref()
                .is_none_or(|value| DateTime::parse_from_rfc3339(value).is_ok())
            && item
                .notified_follow_up_at
                .as_ref()
                .is_none_or(|value| item.follow_up_at.as_ref() == Some(value))
            && DateTime::parse_from_rfc3339(&item.created_at).is_ok()
            && DateTime::parse_from_rfc3339(&item.updated_at).is_ok()
            && item
                .completed_at
                .as_ref()
                .is_none_or(|value| DateTime::parse_from_rfc3339(value).is_ok())
    })
}

fn valid_note_segments(notes: &[LaterInboxNoteSegment]) -> bool {
    if notes.len() > MAX_NOTE_SEGMENTS {
        return false;
    }
    let mut characters = 0_usize;
    let mut links = 0_usize;
    for segment in notes {
        if segment.text.is_empty() {
            return false;
        }
        characters = characters.saturating_add(segment.text.chars().count());
        if let Some(href) = &segment.href {
            links = links.saturating_add(1);
            if normalize_url(href).is_err() {
                return false;
            }
        }
    }
    characters <= MAX_NOTE_CHARS && links <= MAX_NOTE_LINKS
}

fn write_store(
    path: &Path,
    store: &LaterInboxStore,
    preserve_previous: bool,
) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or_else(|| "Later Inbox storage path is invalid.".to_owned())?;
    fs::create_dir_all(directory)
        .map_err(|_| "Later Inbox could not create its local data directory.".to_owned())?;

    let bytes = serde_json::to_vec_pretty(store)
        .map_err(|_| "Later Inbox data could not be serialized.".to_owned())?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("Later Inbox has reached its 1 MiB safety limit.".to_owned());
    }

    let pending = temporary_path(path);
    let mut file = fs::File::create(&pending)
        .map_err(|_| "Later Inbox could not create a pending local write.".to_owned())?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "Later Inbox could not finish its pending local write.".to_owned())?;
    drop(file);

    let current_store_is_valid = path.exists() && read_store(path).is_ok();
    if preserve_previous && current_store_is_valid {
        fs::copy(path, backup_path(path))
            .map_err(|_| "Later Inbox could not update its local backup.".to_owned())?;
    } else if !preserve_previous || path.exists() {
        let backup = backup_path(path);
        if backup.exists() {
            fs::remove_file(backup).map_err(|_| {
                "Later Inbox could not remove the prior local backup before destructive cleanup."
                    .to_owned()
            })?;
        }
    }
    replace_file(&pending, path)
}

#[cfg(target_os = "windows")]
fn replace_file(pending: &Path, path: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::{
        core::PCWSTR,
        Win32::Storage::FileSystem::{
            MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
        },
    };

    let pending_wide = pending
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let path_wide = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    unsafe {
        MoveFileExW(
            PCWSTR(pending_wide.as_ptr()),
            PCWSTR(path_wide.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    }
    .map_err(|_| "Later Inbox could not atomically commit its pending local write.".to_owned())
}

#[cfg(not(target_os = "windows"))]
fn replace_file(pending: &Path, path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_file(path)
            .map_err(|_| "Later Inbox could not replace its local data file.".to_owned())?;
    }
    fs::rename(pending, path)
        .map_err(|_| "Later Inbox could not commit its pending local write.".to_owned())
}

fn normalize_input(input: LaterInboxInput) -> Result<LaterInboxInput, String> {
    let title = input.title.trim().to_owned();
    if title.is_empty() {
        return Err("Title is required.".to_owned());
    }
    validate_length(&title, MAX_TITLE_CHARS, "Title")?;

    let notes = normalize_notes(input.notes)?;

    let url = normalize_optional(input.url)
        .map(|value| normalize_url(&value))
        .transpose()?;
    let follow_up_at = normalize_optional(input.follow_up_at)
        .map(|value| normalize_follow_up(&value))
        .transpose()?;

    Ok(LaterInboxInput {
        scope: input.scope,
        title,
        notes,
        url,
        follow_up_at,
    })
}

fn normalize_notes(
    notes: Vec<LaterInboxNoteSegment>,
) -> Result<Vec<LaterInboxNoteSegment>, String> {
    if notes.len() > MAX_NOTE_SEGMENTS {
        return Err(format!(
            "Notes must contain {MAX_NOTE_SEGMENTS} text segments or fewer."
        ));
    }
    let mut normalized: Vec<LaterInboxNoteSegment> = Vec::with_capacity(notes.len());
    for segment in notes {
        if segment.text.is_empty() {
            continue;
        }
        let href = segment
            .href
            .map(|value| normalize_url(&value))
            .transpose()?;
        if let Some(previous) = normalized.last_mut() {
            if previous.href == href {
                previous.text.push_str(&segment.text);
                continue;
            }
        }
        normalized.push(LaterInboxNoteSegment {
            text: segment.text,
            href,
        });
    }
    if normalized
        .iter()
        .map(|segment| segment.text.as_str())
        .collect::<String>()
        .trim()
        .is_empty()
    {
        normalized.clear();
    }
    let characters = normalized
        .iter()
        .map(|segment| segment.text.chars().count())
        .sum::<usize>();
    if characters > MAX_NOTE_CHARS {
        return Err(format!(
            "Notes or context must be {MAX_NOTE_CHARS} characters or fewer."
        ));
    }
    let links = normalized
        .iter()
        .filter(|segment| segment.href.is_some())
        .count();
    if links > MAX_NOTE_LINKS {
        return Err(format!(
            "Notes may contain {MAX_NOTE_LINKS} linked text segments or fewer."
        ));
    }
    Ok(normalized)
}

fn normalize_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn validate_length(value: &str, limit: usize, label: &str) -> Result<(), String> {
    if value.chars().count() > limit {
        Err(format!("{label} must be {limit} characters or fewer."))
    } else {
        Ok(())
    }
}

fn normalize_url(value: &str) -> Result<String, String> {
    validate_length(value, MAX_URL_CHARS, "URL")?;
    let parsed = reqwest::Url::parse(value)
        .map_err(|_| "URL must be a complete HTTP or HTTPS address.".to_owned())?;
    if !matches!(parsed.scheme(), "http" | "https")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err(
            "URL must use HTTP or HTTPS and must not contain embedded credentials.".to_owned(),
        );
    }
    Ok(parsed.to_string())
}

fn normalize_follow_up(value: &str) -> Result<String, String> {
    DateTime::parse_from_rfc3339(value)
        .map(|value| {
            value
                .with_timezone(&Utc)
                .to_rfc3339_opts(SecondsFormat::Secs, true)
        })
        .map_err(|_| "Follow-up time must include a valid date, time, and timezone.".to_owned())
}

fn timestamp_now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn next_item_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let counter = ITEM_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{nanos:x}-{counter:x}")
}

fn store_error_message(error: StoreReadError) -> String {
    match error {
        StoreReadError::FutureVersion(version) => format!(
            "Later Inbox uses newer schema version {version}; this build will not overwrite it."
        ),
        StoreReadError::OldVersion => {
            "Older disposable Later Inbox test data was not loaded.".to_owned()
        }
        StoreReadError::Invalid | StoreReadError::Unavailable => {
            "Later Inbox local backup could not be read.".to_owned()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(title: &str) -> LaterInboxInput {
        LaterInboxInput {
            scope: LaterInboxScope::Work,
            title: title.to_owned(),
            notes: Vec::new(),
            url: None,
            follow_up_at: None,
        }
    }

    fn test_path(name: &str) -> PathBuf {
        let directory = std::env::temp_dir().join(format!(
            "attention-hub-later-inbox-{name}-{}-{}.json",
            std::process::id(),
            ITEM_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&directory).unwrap();
        directory.join("later-inbox.json")
    }

    #[test]
    fn validates_and_normalizes_user_fields() {
        let normalized = normalize_input(LaterInboxInput {
            scope: LaterInboxScope::Private,
            title: "  Review proposal  ".into(),
            notes: vec![
                LaterInboxNoteSegment {
                    text: "Review ".into(),
                    href: None,
                },
                LaterInboxNoteSegment {
                    text: "brief".into(),
                    href: Some("https://example.com/brief".into()),
                },
            ],
            url: Some("https://example.com/task".into()),
            follow_up_at: Some("2026-08-14T15:30:00+03:00".into()),
        })
        .unwrap();
        assert_eq!(normalized.title, "Review proposal");
        assert_eq!(normalized.scope, LaterInboxScope::Private);
        assert_eq!(normalized.notes.len(), 2);
        assert_eq!(normalized.notes[1].text, "brief");
        assert_eq!(
            normalized.notes[1].href.as_deref(),
            Some("https://example.com/brief")
        );
        assert_eq!(normalized.url.as_deref(), Some("https://example.com/task"));
        assert_eq!(
            normalized.follow_up_at.as_deref(),
            Some("2026-08-14T12:30:00Z")
        );
    }

    #[test]
    fn rejects_unsafe_urls_and_empty_titles() {
        assert!(normalize_input(input("   ")).is_err());
        let mut unsafe_input = input("Task");
        unsafe_input.url = Some("file:///C:/secret.txt".into());
        assert!(normalize_input(unsafe_input).is_err());
        let mut credential_input = input("Task");
        credential_input.url = Some("https://person:secret@example.com/task".into());
        assert!(normalize_input(credential_input).is_err());
        let mut unsafe_note = input("Task");
        unsafe_note.notes.push(LaterInboxNoteSegment {
            text: "secret".into(),
            href: Some("file:///C:/secret.txt".into()),
        });
        assert!(normalize_input(unsafe_note).is_err());
    }

    #[test]
    fn preserves_previous_valid_file_as_backup() {
        let path = test_path("backup");
        let mut store = LaterInboxStore::empty();
        store.items.push(LaterInboxItem {
            id: "one".into(),
            scope: LaterInboxScope::Work,
            title: "First".into(),
            notes: Vec::new(),
            url: None,
            follow_up_at: None,
            notified_follow_up_at: None,
            created_at: timestamp_now(),
            updated_at: timestamp_now(),
            completed_at: None,
        });
        write_store(&path, &store, true).unwrap();
        store.items[0].title = "Second".into();
        write_store(&path, &store, true).unwrap();
        let backup = read_store(&backup_path(&path)).unwrap();
        assert_eq!(backup.items[0].title, "First");
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn recovers_from_backup_but_refuses_future_schema() {
        let path = test_path("recovery");
        let store = LaterInboxStore::empty();
        write_store(&path, &store, true).unwrap();
        fs::copy(&path, backup_path(&path)).unwrap();
        fs::write(&path, b"not json").unwrap();
        let recovered = load_store(&path).unwrap();
        assert!(recovered.recovered_from_backup);

        fs::write(&path, br#"{"schemaVersion":99,"items":[]}"#).unwrap();
        assert!(load_store(&path)
            .unwrap_err()
            .contains("newer schema version 99"));
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn old_schema_starts_a_clean_store_without_migration() {
        let path = test_path("old-schema-reset");
        fs::write(
            &path,
            br#"{
              "schemaVersion": 2,
              "items": [{
                "id": "test-only",
                "title": "Disposable test task",
                "notes": [],
                "url": null,
                "followUpAt": null,
                "createdAt": "2026-08-14T08:00:00Z",
                "updatedAt": "2026-08-14T08:00:00Z",
                "completedAt": null
              }]
            }"#,
        )
        .unwrap();

        assert!(matches!(read_store(&path), Err(StoreReadError::OldVersion)));
        assert!(load_store(&path).unwrap().store.items.is_empty());
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn accepts_multiline_notes_up_to_the_bounded_limit() {
        let mut bounded = input("Task");
        bounded.notes = vec![LaterInboxNoteSegment {
            text: format!("{}\n{}", "a".repeat(2_000), "b".repeat(1_999)),
            href: None,
        }];
        assert_eq!(
            normalize_input(bounded)
                .unwrap()
                .notes
                .iter()
                .map(|segment| segment.text.chars().count())
                .sum::<usize>(),
            MAX_NOTE_CHARS
        );

        let mut oversized = input("Task");
        oversized.notes = vec![LaterInboxNoteSegment {
            text: "x".repeat(MAX_NOTE_CHARS + 1),
            href: None,
        }];
        assert!(normalize_input(oversized).is_err());
    }

    #[test]
    fn destructive_write_does_not_retain_deleted_content_in_backup() {
        let path = test_path("destructive");
        let mut store = LaterInboxStore::empty();
        store.items.push(LaterInboxItem {
            id: "sensitive".into(),
            scope: LaterInboxScope::Private,
            title: "Delete me".into(),
            notes: vec![LaterInboxNoteSegment {
                text: "private context".into(),
                href: None,
            }],
            url: None,
            follow_up_at: None,
            notified_follow_up_at: None,
            created_at: timestamp_now(),
            updated_at: timestamp_now(),
            completed_at: None,
        });
        write_store(&path, &store, true).unwrap();
        store.items.clear();
        write_store(&path, &store, false).unwrap();

        assert!(read_store(&path).unwrap().items.is_empty());
        assert!(!backup_path(&path).exists());
        assert!(!temporary_path(&path).exists());
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn note_link_activation_is_bounded_to_the_saved_item() {
        let item = LaterInboxItem {
            id: "linked".into(),
            scope: LaterInboxScope::Work,
            title: "Linked task".into(),
            notes: vec![LaterInboxNoteSegment {
                text: "brief".into(),
                href: Some("https://example.com/brief".into()),
            }],
            url: None,
            follow_up_at: None,
            notified_follow_up_at: None,
            created_at: timestamp_now(),
            updated_at: timestamp_now(),
            completed_at: None,
        };

        assert!(item_contains_note_url(&item, "https://example.com/brief"));
        assert!(!item_contains_note_url(&item, "https://example.com/other"));
    }

    #[test]
    fn due_notification_state_is_one_shot_per_follow_up_value() {
        let follow_up = "2026-08-17T12:00:00Z".to_owned();
        let mut item = LaterInboxItem {
            id: "due".into(),
            scope: LaterInboxScope::Work,
            title: "Follow up".into(),
            notes: Vec::new(),
            url: None,
            follow_up_at: Some(follow_up.clone()),
            notified_follow_up_at: None,
            created_at: "2026-08-17T10:00:00Z".into(),
            updated_at: "2026-08-17T10:00:00Z".into(),
            completed_at: None,
        };
        let now = DateTime::parse_from_rfc3339("2026-08-17T12:00:01Z")
            .unwrap()
            .with_timezone(&Utc);

        assert!(item_due_for_notification(&item, now));
        item.notified_follow_up_at = Some(follow_up);
        assert!(!item_due_for_notification(&item, now));
    }
}
