use crate::work_calendar::{EventWorkspaceSummary, WorkCalendarSnapshot};
use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex, MutexGuard,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const SCHEMA_VERSION: u32 = 2;
const MAX_PROJECTS: usize = 200;
const MAX_BINDINGS: usize = 1_000;
const MAX_FILE_BYTES: u64 = 1_048_576;
const MAX_PROJECT_NAME_CHARS: usize = 80;
const MAX_NOTE_CHARS: usize = 4_000;
const MAX_NOTE_SEGMENTS: usize = 256;
const MAX_NOTE_LINKS: usize = 25;
const MAX_URL_CHARS: usize = 2_048;
const MAX_EVENT_TOKENS: usize = 1_024;
static PROJECT_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug)]
struct EventTarget {
    workspace_key: String,
    subject: String,
    start: String,
    end: String,
}

#[derive(Default)]
struct EventTokenCache {
    next_token: u64,
    workspace_tokens: HashMap<String, String>,
    targets: HashMap<String, EventTarget>,
}

pub struct MeetingWorkspaceState {
    gate: Mutex<()>,
    event_tokens: Mutex<EventTokenCache>,
}

impl MeetingWorkspaceState {
    pub fn new() -> Self {
        Self {
            gate: Mutex::new(()),
            event_tokens: Mutex::new(EventTokenCache::default()),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MeetingNoteSegment {
    pub text: String,
    pub href: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MeetingProject {
    pub id: String,
    pub name: String,
    pub notes: Vec<MeetingNoteSegment>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct MeetingBinding {
    event_key: String,
    project_id: Option<String>,
    link_url: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MeetingWorkspaceStore {
    schema_version: u32,
    projects: Vec<MeetingProject>,
    bindings: Vec<MeetingBinding>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyWorkspaceStoreV1 {
    projects: Vec<MeetingProject>,
    bindings: Vec<LegacyBindingV1>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyBindingV1 {
    series_key: String,
    project_id: String,
    task_url: String,
    created_at: String,
    updated_at: String,
}

impl MeetingWorkspaceStore {
    fn empty() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            projects: Vec::new(),
            bindings: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingEventContext {
    pub event_token: String,
    pub subject: String,
    pub start: String,
    pub end: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingBindingContext {
    pub project_id: Option<String>,
    pub link_url: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingProjectContext {
    #[serde(flatten)]
    pub project: MeetingProject,
    pub binding_count: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingWorkspaceSnapshot {
    pub schema_version: u32,
    pub event: MeetingEventContext,
    pub binding: Option<MeetingBindingContext>,
    pub projects: Vec<MeetingProjectContext>,
    pub recovered_from_backup: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingWorkspaceInput {
    pub project_id: Option<String>,
    pub project_name: String,
    pub link_url: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStashSnapshot {
    pub schema_version: u32,
    pub project: MeetingProjectContext,
    pub recovered_from_backup: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStashInput {
    #[serde(default)]
    pub notes: Vec<MeetingNoteSegment>,
}

#[derive(Debug)]
enum StoreReadError {
    FutureVersion(u64),
    Invalid,
    Unavailable,
}

#[derive(Debug)]
struct LoadedStore {
    store: MeetingWorkspaceStore,
    recovered_from_backup: bool,
}

pub fn enrich_calendar_snapshot(
    app: &AppHandle,
    state: &MeetingWorkspaceState,
    snapshot: &mut WorkCalendarSnapshot,
) -> Result<(), String> {
    let _guard = lock(&state.gate)?;
    let path = storage_path(app)?;
    let loaded = load_store(&path)?;
    let mut tokens = lock(&state.event_tokens)?;

    for event in &mut snapshot.day_selections {
        let Some(workspace_key) = event.workspace_key.clone() else {
            continue;
        };
        let token = if let Some(token) = tokens.workspace_tokens.get(&workspace_key) {
            token.clone()
        } else {
            if tokens.targets.len() >= MAX_EVENT_TOKENS {
                tokens.workspace_tokens.clear();
                tokens.targets.clear();
            }
            tokens.next_token = tokens.next_token.wrapping_add(1);
            let token = format!("meeting-{}", tokens.next_token);
            tokens
                .workspace_tokens
                .insert(workspace_key.clone(), token.clone());
            token
        };
        tokens.targets.insert(
            token.clone(),
            EventTarget {
                workspace_key: workspace_key.clone(),
                subject: event.subject.clone(),
                start: event.start.clone(),
                end: event.end.clone(),
            },
        );
        event.event_token = Some(token);
        event.event_workspace = binding_summary(&loaded.store, &workspace_key);
    }
    Ok(())
}

pub fn get_snapshot(
    app: &AppHandle,
    state: &MeetingWorkspaceState,
    event_token: &str,
) -> Result<MeetingWorkspaceSnapshot, String> {
    let target = event_target(state, event_token)?;
    let _guard = lock(&state.gate)?;
    let path = storage_path(app)?;
    let loaded = load_store(&path)?;
    Ok(snapshot(event_token, target, loaded))
}

pub fn save(
    app: &AppHandle,
    state: &MeetingWorkspaceState,
    event_token: &str,
    input: MeetingWorkspaceInput,
) -> Result<MeetingWorkspaceSnapshot, String> {
    let target = event_target(state, event_token)?;
    let input = normalize_input(input)?;
    let _guard = lock(&state.gate)?;
    let path = storage_path(app)?;
    let mut loaded = load_store(&path)?;
    let now = timestamp_now();

    let project_id = if let Some(project_id) = input.project_id {
        loaded
            .store
            .projects
            .iter()
            .any(|project| project.id == project_id)
            .then_some(project_id)
            .ok_or_else(|| "The selected project stash no longer exists.".to_owned())?
            .into()
    } else if !input.project_name.is_empty() {
        if loaded.store.projects.len() >= MAX_PROJECTS {
            return Err("Meeting projects have reached the 200-project safety limit.".to_owned());
        }
        if loaded
            .store
            .projects
            .iter()
            .any(|project| project.name.eq_ignore_ascii_case(&input.project_name))
        {
            return Err(
                "A project with this name already exists. Choose it from the list instead."
                    .to_owned(),
            );
        }
        let project_id = next_id();
        loaded.store.projects.push(MeetingProject {
            id: project_id.clone(),
            name: input.project_name,
            notes: Vec::new(),
            created_at: now.clone(),
            updated_at: now.clone(),
        });
        Some(project_id)
    } else {
        None
    };

    if project_id.is_none() && input.link_url.is_none() {
        return Err("Choose a project stash, add a link, or use Unlink event.".to_owned());
    }

    if let Some(binding) = loaded
        .store
        .bindings
        .iter_mut()
        .find(|binding| binding.event_key == target.workspace_key)
    {
        binding.project_id = project_id;
        binding.link_url = input.link_url;
        binding.updated_at = now;
    } else {
        if loaded.store.bindings.len() >= MAX_BINDINGS {
            return Err(
                "Recurring meeting links have reached the 1,000-binding safety limit.".to_owned(),
            );
        }
        loaded.store.bindings.push(MeetingBinding {
            event_key: target.workspace_key.clone(),
            project_id,
            link_url: input.link_url,
            created_at: now.clone(),
            updated_at: now,
        });
    }

    write_store(&path, &loaded.store, true)?;
    loaded.recovered_from_backup = false;
    Ok(snapshot(event_token, target, loaded))
}

pub fn unlink(
    app: &AppHandle,
    state: &MeetingWorkspaceState,
    event_token: &str,
) -> Result<MeetingWorkspaceSnapshot, String> {
    let target = event_target(state, event_token)?;
    let _guard = lock(&state.gate)?;
    let path = storage_path(app)?;
    let mut loaded = load_store(&path)?;
    let before = loaded.store.bindings.len();
    loaded
        .store
        .bindings
        .retain(|binding| binding.event_key != target.workspace_key);
    if loaded.store.bindings.len() == before {
        return Err("This event has no saved settings.".to_owned());
    }
    write_store(&path, &loaded.store, false)?;
    loaded.recovered_from_backup = false;
    Ok(snapshot(event_token, target, loaded))
}

pub fn delete_project(
    app: &AppHandle,
    state: &MeetingWorkspaceState,
    event_token: &str,
    project_id: &str,
) -> Result<MeetingWorkspaceSnapshot, String> {
    let target = event_target(state, event_token)?;
    let _guard = lock(&state.gate)?;
    let path = storage_path(app)?;
    let mut loaded = load_store(&path)?;
    let before = loaded.store.projects.len();
    loaded
        .store
        .projects
        .retain(|project| project.id != project_id);
    if loaded.store.projects.len() == before {
        return Err("The selected meeting project no longer exists.".to_owned());
    }
    loaded
        .store
        .bindings
        .retain(|binding| binding.project_id.as_deref() != Some(project_id));
    write_store(&path, &loaded.store, false)?;
    loaded.recovered_from_backup = false;
    Ok(snapshot(event_token, target, loaded))
}

pub fn link_url(
    app: &AppHandle,
    state: &MeetingWorkspaceState,
    event_token: &str,
) -> Result<String, String> {
    let target = event_target(state, event_token)?;
    let _guard = lock(&state.gate)?;
    let path = storage_path(app)?;
    let loaded = load_store(&path)?;
    let url = loaded
        .store
        .bindings
        .iter()
        .find(|binding| binding.event_key == target.workspace_key)
        .and_then(|binding| binding.link_url.clone())
        .ok_or_else(|| "This event has no saved link.".to_owned())?;
    normalize_url(&url, "Link")
}

pub fn note_url(
    app: &AppHandle,
    state: &MeetingWorkspaceState,
    project_id: &str,
    requested_url: &str,
) -> Result<String, String> {
    let requested_url = normalize_url(requested_url, "Project-note link")?;
    let _guard = lock(&state.gate)?;
    let path = storage_path(app)?;
    let loaded = load_store(&path)?;
    let project = loaded
        .store
        .projects
        .iter()
        .find(|project| project.id == project_id)
        .ok_or_else(|| "The selected meeting project no longer exists.".to_owned())?;
    project
        .notes
        .iter()
        .filter_map(|segment| segment.href.as_deref())
        .any(|href| {
            normalize_url(href, "Project-note link").is_ok_and(|href| href == requested_url)
        })
        .then_some(requested_url)
        .ok_or_else(|| "This link is not present in the saved project notes.".to_owned())
}

pub fn get_project_stash(
    app: &AppHandle,
    state: &MeetingWorkspaceState,
    project_id: &str,
) -> Result<ProjectStashSnapshot, String> {
    let _guard = lock(&state.gate)?;
    let path = storage_path(app)?;
    let loaded = load_store(&path)?;
    project_stash_snapshot(project_id, loaded)
}

pub fn save_project_stash(
    app: &AppHandle,
    state: &MeetingWorkspaceState,
    project_id: &str,
    input: ProjectStashInput,
) -> Result<ProjectStashSnapshot, String> {
    let notes = normalize_notes(input.notes)?;
    let _guard = lock(&state.gate)?;
    let path = storage_path(app)?;
    let mut loaded = load_store(&path)?;
    let project = loaded
        .store
        .projects
        .iter_mut()
        .find(|project| project.id == project_id)
        .ok_or_else(|| "The selected project stash no longer exists.".to_owned())?;
    project.notes = notes;
    project.updated_at = timestamp_now();
    write_store(&path, &loaded.store, true)?;
    loaded.recovered_from_backup = false;
    project_stash_snapshot(project_id, loaded)
}

fn snapshot(
    event_token: &str,
    target: EventTarget,
    mut loaded: LoadedStore,
) -> MeetingWorkspaceSnapshot {
    let binding = loaded
        .store
        .bindings
        .iter()
        .find(|binding| binding.event_key == target.workspace_key)
        .map(|binding| MeetingBindingContext {
            project_id: binding.project_id.clone(),
            link_url: binding.link_url.clone(),
        });
    loaded
        .store
        .projects
        .sort_by_key(|project| project.name.to_lowercase());
    let projects = loaded
        .store
        .projects
        .into_iter()
        .map(|project| {
            let binding_count = loaded
                .store
                .bindings
                .iter()
                .filter(|binding| binding.project_id.as_deref() == Some(project.id.as_str()))
                .count();
            MeetingProjectContext {
                project,
                binding_count,
            }
        })
        .collect();
    MeetingWorkspaceSnapshot {
        schema_version: SCHEMA_VERSION,
        event: MeetingEventContext {
            event_token: event_token.to_owned(),
            subject: target.subject,
            start: target.start,
            end: target.end,
        },
        binding,
        projects,
        recovered_from_backup: loaded.recovered_from_backup,
    }
}

fn project_stash_snapshot(
    project_id: &str,
    loaded: LoadedStore,
) -> Result<ProjectStashSnapshot, String> {
    let project = loaded
        .store
        .projects
        .iter()
        .find(|project| project.id == project_id)
        .cloned()
        .ok_or_else(|| "The selected project stash no longer exists.".to_owned())?;
    let binding_count = loaded
        .store
        .bindings
        .iter()
        .filter(|binding| binding.project_id.as_deref() == Some(project.id.as_str()))
        .count();
    Ok(ProjectStashSnapshot {
        schema_version: SCHEMA_VERSION,
        project: MeetingProjectContext {
            project,
            binding_count,
        },
        recovered_from_backup: loaded.recovered_from_backup,
    })
}

fn binding_summary(
    store: &MeetingWorkspaceStore,
    workspace_key: &str,
) -> Option<EventWorkspaceSummary> {
    let binding = store
        .bindings
        .iter()
        .find(|binding| binding.event_key == workspace_key)?;
    let project = binding.project_id.as_deref().and_then(|project_id| {
        store
            .projects
            .iter()
            .find(|project| project.id == project_id)
    });
    Some(EventWorkspaceSummary {
        project_id: project.map(|project| project.id.clone()),
        project_name: project.map(|project| project.name.clone()),
        notes_present: project.is_some_and(|project| !project.notes.is_empty()),
        link_url_present: binding.link_url.is_some(),
        link_url: binding.link_url.clone(),
    })
}

fn event_target(state: &MeetingWorkspaceState, event_token: &str) -> Result<EventTarget, String> {
    if event_token.len() > 64 || !event_token.starts_with("meeting-") {
        return Err("The recurring meeting token is invalid or expired.".to_owned());
    }
    lock(&state.event_tokens)?
        .targets
        .get(event_token)
        .cloned()
        .ok_or_else(|| {
            "The recurring meeting is no longer current. Reopen Today and try again.".to_owned()
        })
}

fn lock<T>(mutex: &Mutex<T>) -> Result<MutexGuard<'_, T>, String> {
    mutex
        .lock()
        .map_err(|_| "Meeting workspace storage is temporarily unavailable.".to_owned())
}

fn normalize_input(input: MeetingWorkspaceInput) -> Result<MeetingWorkspaceInput, String> {
    let project_name = input.project_name.trim().to_owned();
    if !project_name.is_empty() {
        validate_length(&project_name, MAX_PROJECT_NAME_CHARS, "Project name")?;
    }
    let link_url = input
        .link_url
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|value| normalize_url(value.trim(), "Link"))
        .transpose()?;
    Ok(MeetingWorkspaceInput {
        project_id: input.project_id,
        project_name,
        link_url,
    })
}

fn normalize_notes(notes: Vec<MeetingNoteSegment>) -> Result<Vec<MeetingNoteSegment>, String> {
    if notes.len() > MAX_NOTE_SEGMENTS {
        return Err(format!(
            "Project notes must contain {MAX_NOTE_SEGMENTS} text segments or fewer."
        ));
    }
    let mut normalized: Vec<MeetingNoteSegment> = Vec::with_capacity(notes.len());
    for segment in notes {
        if segment.text.is_empty() {
            continue;
        }
        let href = segment
            .href
            .map(|value| normalize_url(&value, "Project-note link"))
            .transpose()?;
        if let Some(previous) = normalized.last_mut() {
            if previous.href == href {
                previous.text.push_str(&segment.text);
                continue;
            }
        }
        normalized.push(MeetingNoteSegment {
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
            "Project notes must be {MAX_NOTE_CHARS} characters or fewer."
        ));
    }
    if normalized
        .iter()
        .filter(|segment| segment.href.is_some())
        .count()
        > MAX_NOTE_LINKS
    {
        return Err(format!(
            "Project notes may contain {MAX_NOTE_LINKS} linked text segments or fewer."
        ));
    }
    Ok(normalized)
}

fn validate_length(value: &str, limit: usize, label: &str) -> Result<(), String> {
    if value.chars().count() > limit {
        Err(format!("{label} must be {limit} characters or fewer."))
    } else {
        Ok(())
    }
}

fn normalize_url(value: &str, label: &str) -> Result<String, String> {
    if value.is_empty() {
        return Err(format!("{label} is required."));
    }
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

fn storage_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join("meeting-workspaces.json"))
        .map_err(|_| "Attention Hub could not resolve its local data directory.".to_owned())
}

fn backup_path(path: &Path) -> PathBuf {
    path.with_file_name("meeting-workspaces.backup.json")
}

fn temporary_path(path: &Path) -> PathBuf {
    path.with_file_name("meeting-workspaces.pending.json")
}

fn load_store(path: &Path) -> Result<LoadedStore, String> {
    if !path.exists() {
        for candidate in [temporary_path(path), backup_path(path)] {
            if candidate.exists() {
                match read_store(&candidate) {
                    Ok(store) => {
                        return Ok(LoadedStore {
                            store,
                            recovered_from_backup: true,
                        });
                    }
                    Err(StoreReadError::FutureVersion(version)) => {
                        return Err(format!(
                            "Meeting workspaces use newer schema version {version}; this build will not overwrite them."
                        ));
                    }
                    Err(StoreReadError::Invalid | StoreReadError::Unavailable) => {}
                }
            }
        }
        return Ok(LoadedStore {
            store: MeetingWorkspaceStore::empty(),
            recovered_from_backup: false,
        });
    }
    match read_store(path) {
        Ok(store) => Ok(LoadedStore { store, recovered_from_backup: false }),
        Err(StoreReadError::FutureVersion(version)) => Err(format!(
            "Meeting workspaces use newer schema version {version}; this build will not overwrite them."
        )),
        Err(StoreReadError::Invalid | StoreReadError::Unavailable) => {
            match read_store(&backup_path(path)) {
                Ok(store) => Ok(LoadedStore { store, recovered_from_backup: true }),
                Err(_) => Err("Meeting workspace data could not be read, and no valid local backup is available.".to_owned()),
            }
        }
    }
}

fn read_store(path: &Path) -> Result<MeetingWorkspaceStore, StoreReadError> {
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
    let store = if version == 1 {
        migrate_v1(value)?
    } else if version == u64::from(SCHEMA_VERSION) {
        serde_json::from_value(value).map_err(|_| StoreReadError::Invalid)?
    } else {
        return Err(StoreReadError::Invalid);
    };
    valid_loaded_store(&store)
        .then_some(store)
        .ok_or(StoreReadError::Invalid)
}

fn migrate_v1(value: serde_json::Value) -> Result<MeetingWorkspaceStore, StoreReadError> {
    let legacy: LegacyWorkspaceStoreV1 =
        serde_json::from_value(value).map_err(|_| StoreReadError::Invalid)?;
    Ok(MeetingWorkspaceStore {
        schema_version: SCHEMA_VERSION,
        projects: legacy.projects,
        bindings: legacy
            .bindings
            .into_iter()
            .map(|binding| MeetingBinding {
                event_key: binding.series_key,
                project_id: Some(binding.project_id),
                link_url: Some(binding.task_url),
                created_at: binding.created_at,
                updated_at: binding.updated_at,
            })
            .collect(),
    })
}

fn valid_loaded_store(store: &MeetingWorkspaceStore) -> bool {
    if store.schema_version != SCHEMA_VERSION
        || store.projects.len() > MAX_PROJECTS
        || store.bindings.len() > MAX_BINDINGS
    {
        return false;
    }
    let mut project_ids = HashSet::new();
    let mut project_names = HashSet::new();
    if !store.projects.iter().all(|project| {
        !project.id.is_empty()
            && project.id.chars().count() <= 128
            && project_ids.insert(project.id.as_str())
            && !project.name.trim().is_empty()
            && project.name.chars().count() <= MAX_PROJECT_NAME_CHARS
            && project_names.insert(project.name.to_lowercase())
            && valid_notes(&project.notes)
            && chrono::DateTime::parse_from_rfc3339(&project.created_at).is_ok()
            && chrono::DateTime::parse_from_rfc3339(&project.updated_at).is_ok()
    }) {
        return false;
    }
    let mut event_keys = HashSet::new();
    store.bindings.iter().all(|binding| {
        binding.event_key.len() == 64
            && binding
                .event_key
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
            && event_keys.insert(binding.event_key.as_str())
            && binding
                .project_id
                .as_deref()
                .is_none_or(|project_id| project_ids.contains(project_id))
            && binding
                .link_url
                .as_deref()
                .is_none_or(|link_url| normalize_url(link_url, "Link").is_ok())
            && (binding.project_id.is_some() || binding.link_url.is_some())
            && chrono::DateTime::parse_from_rfc3339(&binding.created_at).is_ok()
            && chrono::DateTime::parse_from_rfc3339(&binding.updated_at).is_ok()
    })
}

fn valid_notes(notes: &[MeetingNoteSegment]) -> bool {
    notes.len() <= MAX_NOTE_SEGMENTS
        && notes.iter().all(|segment| {
            !segment.text.is_empty()
                && segment
                    .href
                    .as_ref()
                    .is_none_or(|href| normalize_url(href, "Project-note link").is_ok())
        })
        && notes
            .iter()
            .map(|segment| segment.text.chars().count())
            .sum::<usize>()
            <= MAX_NOTE_CHARS
        && notes
            .iter()
            .filter(|segment| segment.href.is_some())
            .count()
            <= MAX_NOTE_LINKS
}

fn write_store(
    path: &Path,
    store: &MeetingWorkspaceStore,
    preserve_previous: bool,
) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or_else(|| "Meeting workspace storage path is invalid.".to_owned())?;
    fs::create_dir_all(directory).map_err(|_| {
        "Meeting workspaces could not create their local data directory.".to_owned()
    })?;
    let bytes = serde_json::to_vec_pretty(store)
        .map_err(|_| "Meeting workspace data could not be serialized.".to_owned())?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("Meeting workspaces have reached their 1 MiB safety limit.".to_owned());
    }
    let pending = temporary_path(path);
    let mut file = fs::File::create(&pending)
        .map_err(|_| "Meeting workspaces could not create a pending local write.".to_owned())?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "Meeting workspaces could not finish their pending local write.".to_owned())?;
    drop(file);
    let current_store_is_valid = path.exists() && read_store(path).is_ok();
    if preserve_previous && current_store_is_valid {
        fs::copy(path, backup_path(path))
            .map_err(|_| "Meeting workspaces could not update their local backup.".to_owned())?;
    } else if !preserve_previous || path.exists() {
        let backup = backup_path(path);
        if backup.exists() {
            fs::remove_file(backup).map_err(|_| {
                "Meeting workspaces could not remove their prior local backup.".to_owned()
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
    .map_err(|_| {
        "Meeting workspaces could not atomically commit their pending local write.".to_owned()
    })
}

#[cfg(not(target_os = "windows"))]
fn replace_file(pending: &Path, path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_file(path).map_err(|_| {
            "Meeting workspaces could not replace their local data file.".to_owned()
        })?;
    }
    fs::rename(pending, path)
        .map_err(|_| "Meeting workspaces could not commit their pending local write.".to_owned())
}

fn timestamp_now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn next_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let counter = PROJECT_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("project-{nanos:x}-{counter:x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input() -> MeetingWorkspaceInput {
        MeetingWorkspaceInput {
            project_id: None,
            project_name: "  Atlas  ".into(),
            link_url: Some("https://example.teamwork.com/app/tasks/123".into()),
        }
    }

    fn test_path(name: &str) -> PathBuf {
        let directory = std::env::temp_dir().join(format!(
            "attention-hub-meeting-workspace-{name}-{}-{}",
            std::process::id(),
            PROJECT_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&directory).unwrap();
        directory.join("meeting-workspaces.json")
    }

    fn store_with_project() -> MeetingWorkspaceStore {
        let now = timestamp_now();
        MeetingWorkspaceStore {
            schema_version: SCHEMA_VERSION,
            projects: vec![MeetingProject {
                id: "project-one".into(),
                name: "Atlas".into(),
                notes: vec![MeetingNoteSegment {
                    text: "Keep this context".into(),
                    href: None,
                }],
                created_at: now.clone(),
                updated_at: now,
            }],
            bindings: Vec::new(),
        }
    }

    #[test]
    fn normalizes_bounded_project_input() {
        let normalized = normalize_input(input()).unwrap();
        assert_eq!(normalized.project_name, "Atlas");
        assert_eq!(
            normalized.link_url.as_deref(),
            Some("https://example.teamwork.com/app/tasks/123")
        );
        let optional_link = normalize_input(MeetingWorkspaceInput {
            project_id: Some("project-one".into()),
            project_name: String::new(),
            link_url: None,
        })
        .unwrap();
        assert!(optional_link.link_url.is_none());
    }

    #[test]
    fn rejects_unsafe_or_credentialed_links() {
        let mut unsafe_input = input();
        unsafe_input.link_url = Some("file:///C:/secret.txt".into());
        assert!(normalize_input(unsafe_input).is_err());
        let mut credentialed = input();
        credentialed.link_url = Some("https://user:secret@example.teamwork.com/task".into());
        assert!(normalize_input(credentialed).is_err());
    }

    #[test]
    fn validates_optional_binding_fields_and_unique_event_keys() {
        let now = timestamp_now();
        let project = MeetingProject {
            id: "project-one".into(),
            name: "Atlas".into(),
            notes: Vec::new(),
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let binding = MeetingBinding {
            event_key: "a".repeat(64),
            project_id: Some(project.id.clone()),
            link_url: Some("https://example.teamwork.com/app/tasks/123".into()),
            created_at: now.clone(),
            updated_at: now,
        };
        let mut store = MeetingWorkspaceStore {
            schema_version: SCHEMA_VERSION,
            projects: vec![project],
            bindings: vec![binding.clone()],
        };
        assert!(valid_loaded_store(&store));
        store.bindings.push(binding);
        assert!(!valid_loaded_store(&store));
    }

    #[test]
    fn migrates_existing_v1_project_notes_and_links() {
        let now = timestamp_now();
        let value = serde_json::json!({
            "schemaVersion": 1,
            "projects": [{
                "id": "project-one",
                "name": "Atlas",
                "notes": [{"text": "Keep this context", "href": null}],
                "createdAt": now,
                "updatedAt": now,
            }],
            "bindings": [{
                "seriesKey": "a".repeat(64),
                "projectId": "project-one",
                "taskUrl": "https://example.teamwork.com/app/tasks/123",
                "createdAt": now,
                "updatedAt": now,
            }]
        });
        let store = migrate_v1(value).unwrap();
        assert_eq!(store.schema_version, 2);
        assert_eq!(store.projects[0].notes[0].text, "Keep this context");
        assert_eq!(store.bindings[0].project_id.as_deref(), Some("project-one"));
        assert_eq!(
            store.bindings[0].link_url.as_deref(),
            Some("https://example.teamwork.com/app/tasks/123")
        );
    }

    #[test]
    fn preserves_previous_valid_workspace_as_backup() {
        let path = test_path("backup");
        let mut store = store_with_project();
        write_store(&path, &store, true).unwrap();
        store.projects[0].name = "Atlas renamed".into();
        write_store(&path, &store, true).unwrap();
        let backup = read_store(&backup_path(&path)).unwrap();
        assert_eq!(backup.projects[0].name, "Atlas");
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn destructive_workspace_write_removes_deleted_notes_from_backup() {
        let path = test_path("destructive");
        let mut store = store_with_project();
        write_store(&path, &store, true).unwrap();
        store.projects.clear();
        write_store(&path, &store, false).unwrap();
        assert!(read_store(&path).unwrap().projects.is_empty());
        assert!(!backup_path(&path).exists());
        assert!(!temporary_path(&path).exists());
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }
}
