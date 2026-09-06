use crate::{
    external_url, local_store,
    work_calendar::{EventWorkspaceSummary, WorkCalendarSnapshot},
};
use chrono::{DateTime, NaiveDate, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    sync::{Mutex, MutexGuard},
};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const SCHEMA_VERSION: u32 = 1;
const TRANSFER_FORMAT: &str = "attention-hub-workspace";
const SEED_TIMESTAMP: &str = "1970-01-01T00:00:00Z";
const STALE_DELETE: &str =
    "The workspace changed since this confirmation was shown. Review the impact and confirm again.";

fn ensure_revision(store: &Store, expected_revision: u64) -> Result<(), String> {
    (store.revision == expected_revision)
        .then_some(())
        .ok_or_else(|| STALE_DELETE.to_owned())
}

pub struct WorkspaceState {
    gate: Mutex<()>,
    event_tokens: Mutex<EventTokenCache>,
}
impl WorkspaceState {
    pub fn new() -> Self {
        Self {
            gate: Mutex::new(()),
            event_tokens: Mutex::new(EventTokenCache::default()),
        }
    }
}
#[derive(Clone)]
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

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSegment {
    pub text: String,
    pub href: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonalCategory {
    pub id: String,
    pub name: String,
    pub sort_index: i32,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub notes: Vec<NoteSegment>,
    #[serde(default)]
    pub notes_revision: u64,
    pub archived_at: Option<String>,
    pub sort_index: i32,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct List {
    pub id: String,
    #[serde(default)]
    pub category_id: Option<String>,
    pub name: String,
    pub sort_index: i32,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectLink {
    pub id: String,
    pub project_id: String,
    pub label: String,
    pub url: String,
    pub kind: String,
    pub sort_index: i32,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OwnerKind {
    Project,
    List,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionItem {
    pub id: String,
    pub owner_kind: OwnerKind,
    pub owner_id: String,
    pub title: String,
    pub notes: Vec<NoteSegment>,
    pub due_on: Option<String>,
    pub remind_at: Option<String>,
    pub notified_remind_at: Option<String>,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Binding {
    pub event_key: String,
    pub project_id: Option<String>,
    #[serde(default)]
    pub project_link_id: Option<String>,
    pub link_url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Store {
    schema_version: u32,
    revision: u64,
    #[serde(default)]
    categories: Vec<PersonalCategory>,
    projects: Vec<Project>,
    lists: Vec<List>,
    links: Vec<ProjectLink>,
    action_items: Vec<ActionItem>,
    bindings: Vec<Binding>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceTransfer {
    format: String,
    schema_version: u32,
    exported_at: String,
    workspace: Store,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTransferCounts {
    pub categories: usize,
    pub projects: usize,
    pub lists: usize,
    pub links: usize,
    pub action_items: usize,
    pub bindings: usize,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceImportPreview {
    pub schema_version: u32,
    pub exported_at: String,
    pub digest: String,
    pub workspace_revision: u64,
    pub counts: WorkspaceTransferCounts,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub schema_version: u32,
    pub revision: u64,
    pub captured_at: String,
    pub storage_path: String,
    pub recovered_from_backup: bool,
    pub categories: Vec<PersonalCategory>,
    pub projects: Vec<Project>,
    pub lists: Vec<List>,
    pub links: Vec<ProjectLink>,
    pub action_items: Vec<ActionItem>,
    pub bindings: Vec<Binding>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionItemInput {
    pub owner_kind: OwnerKind,
    pub owner_id: String,
    pub title: String,
    #[serde(default)]
    pub notes: Vec<NoteSegment>,
    pub due_on: Option<String>,
    pub remind_at: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectLinkInput {
    pub label: String,
    pub url: String,
    pub kind: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventWorkspaceInput {
    pub project_id: Option<String>,
    pub project_link_id: Option<String>,
    pub link_url: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventWorkspaceSnapshot {
    pub event_token: String,
    pub subject: String,
    pub start: String,
    pub end: String,
    pub project_id: Option<String>,
    pub project_link_id: Option<String>,
    pub link_url: Option<String>,
    pub recovered_from_backup: bool,
}

fn seed() -> Store {
    Store {
        schema_version: SCHEMA_VERSION,
        revision: 0,
        categories: vec![],
        projects: vec![],
        lists: vec![List {
            id: "list-inbox".into(),
            category_id: None,
            name: "Inbox".into(),
            sort_index: 0,
            created_at: SEED_TIMESTAMP.into(),
            updated_at: SEED_TIMESTAMP.into(),
        }],
        links: vec![],
        action_items: vec![],
        bindings: vec![],
    }
}
fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}
fn id() -> String {
    Uuid::new_v4().simple().to_string()
}
fn path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(local_store::profile_dir)
        .map(|d| d.join("workspace.json"))
        .map_err(|_| "Attention Hub could not resolve its local data directory.".into())
}
fn lock(state: &WorkspaceState) -> Result<MutexGuard<'_, ()>, String> {
    state
        .gate
        .lock()
        .map_err(|_| "Workspace storage is temporarily unavailable.".into())
}
fn event_target(state: &WorkspaceState, event_token: &str) -> Result<EventTarget, String> {
    state
        .event_tokens
        .lock()
        .map_err(|_| "Workspace event state is temporarily unavailable.".to_owned())?
        .targets
        .get(event_token)
        .cloned()
        .ok_or_else(|| {
            "The recurring meeting is no longer current. Reopen Today and try again.".to_owned()
        })
}
fn register_event_token(
    tokens: &mut EventTokenCache,
    workspace_key: &str,
    subject: &str,
    start: &str,
    end: &str,
) -> String {
    let token = tokens
        .workspace_tokens
        .get(workspace_key)
        .cloned()
        .unwrap_or_else(|| {
            if tokens.targets.len() >= 1024 {
                tokens.workspace_tokens.clear();
                tokens.targets.clear();
            }
            tokens.next_token = tokens.next_token.wrapping_add(1);
            let token = format!("workspace-{}", tokens.next_token);
            tokens
                .workspace_tokens
                .insert(workspace_key.into(), token.clone());
            token
        });
    tokens.targets.insert(
        token.clone(),
        EventTarget {
            workspace_key: workspace_key.into(),
            subject: subject.into(),
            start: start.into(),
            end: end.into(),
        },
    );
    token
}
fn valid(store: &Store) -> bool {
    let unique = |ids: Vec<&str>| ids.iter().collect::<HashSet<_>>().len() == ids.len();
    let timestamp = |value: &str| DateTime::parse_from_rfc3339(value).is_ok();
    store.schema_version == SCHEMA_VERSION
        && store.categories.len() <= 18
        && store.projects.len() <= 200
        && store.lists.len() <= 200
        && store.action_items.len() <= 2000
        && store.links.len() <= 10_000
        && unique(
            store
                .categories
                .iter()
                .map(|item| item.id.as_str())
                .collect(),
        )
        && store
            .categories
            .iter()
            .all(|item| timestamp(&item.created_at) && timestamp(&item.updated_at))
        && store.projects.iter().all(|item| {
            timestamp(&item.created_at)
                && timestamp(&item.updated_at)
                && item
                    .archived_at
                    .as_ref()
                    .is_none_or(|value| timestamp(value))
        })
        && store
            .lists
            .iter()
            .all(|item| timestamp(&item.created_at) && timestamp(&item.updated_at))
        && store
            .links
            .iter()
            .all(|item| timestamp(&item.created_at) && timestamp(&item.updated_at))
        && store
            .action_items
            .iter()
            .all(|item| timestamp(&item.created_at) && timestamp(&item.updated_at))
        && store
            .bindings
            .iter()
            .all(|item| timestamp(&item.created_at) && timestamp(&item.updated_at))
        && store.projects.iter().all(|project| {
            store
                .links
                .iter()
                .filter(|link| link.project_id == project.id)
                .count()
                <= 50
        })
        && unique(store.projects.iter().map(|item| item.id.as_str()).collect())
        && unique(store.lists.iter().map(|item| item.id.as_str()).collect())
        && unique(store.links.iter().map(|item| item.id.as_str()).collect())
        && unique(
            store
                .action_items
                .iter()
                .map(|item| item.id.as_str())
                .collect(),
        )
        && store.lists.iter().all(|list| {
            list.category_id.as_ref().is_none_or(|category_id| {
                store
                    .categories
                    .iter()
                    .any(|category| category.id == *category_id)
            })
        })
        && store.links.iter().all(|l| {
            store.projects.iter().any(|p| p.id == l.project_id)
                && external_url::normalize_url(&l.url, "URL").is_ok()
        })
        && store
            .action_items
            .iter()
            .all(|item| valid_item(store, item))
        && store.bindings.iter().all(|b| {
            let project_exists = b
                .project_id
                .as_ref()
                .is_none_or(|id| store.projects.iter().any(|p| p.id == *id));
            let referenced_link_is_valid = b.project_link_id.as_ref().is_none_or(|link_id| {
                b.project_id.as_ref().is_some_and(|project_id| {
                    store
                        .links
                        .iter()
                        .any(|link| link.id == *link_id && link.project_id == *project_id)
                })
            });
            let custom_link_is_valid = b
                .link_url
                .as_ref()
                .is_none_or(|url| external_url::normalize_url(url, "Link").is_ok());
            project_exists
                && referenced_link_is_valid
                && custom_link_is_valid
                && !(b.project_link_id.is_some() && b.link_url.is_some())
        })
}
fn valid_transfer(transfer: &WorkspaceTransfer) -> bool {
    transfer.format == TRANSFER_FORMAT
        && transfer.schema_version == SCHEMA_VERSION
        && DateTime::parse_from_rfc3339(&transfer.exported_at).is_ok()
        && valid(&transfer.workspace)
}
fn transfer_counts(store: &Store) -> WorkspaceTransferCounts {
    WorkspaceTransferCounts {
        categories: store.categories.len(),
        projects: store.projects.len(),
        lists: store.lists.len(),
        links: store.links.len(),
        action_items: store.action_items.len(),
        bindings: store.bindings.len(),
    }
}
fn transfer_digest(transfer: &WorkspaceTransfer) -> Result<String, String> {
    let bytes = serde_json::to_vec(transfer)
        .map_err(|_| "Workspace import data could not be verified.".to_owned())?;
    Ok(Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}
fn isolate_imported_note_revisions(imported: &mut Store, current: &Store) -> Result<(), String> {
    for project in &mut imported.projects {
        let current_revision = current
            .projects
            .iter()
            .find(|current_project| current_project.id == project.id)
            .map_or(0, |current_project| current_project.notes_revision);
        project.notes_revision = project
            .notes_revision
            .max(current_revision)
            .checked_add(1)
            .ok_or_else(|| {
                "A project notes revision has reached its supported limit.".to_owned()
            })?;
    }
    Ok(())
}
fn read_transfer(source: &std::path::Path) -> Result<WorkspaceTransfer, String> {
    if source.as_os_str().is_empty() {
        return Err("Choose an Attention Hub workspace export to import.".to_owned());
    }
    match local_store::read_portable(source, SCHEMA_VERSION, valid_transfer) {
        Ok(transfer) => Ok(transfer),
        Err(local_store::ReadError::FutureVersion(version)) => Err(format!(
            "This workspace export uses newer schema version {version}. Update Attention Hub before importing it."
        )),
        Err(local_store::ReadError::Invalid) => {
            Err("The selected file is not a valid Attention Hub workspace export.".to_owned())
        }
        Err(local_store::ReadError::Unavailable) => {
            Err("The selected workspace export could not be read.".to_owned())
        }
    }
}
fn comparable_path(path: &std::path::Path) -> PathBuf {
    if let Ok(canonical) = fs::canonicalize(path) {
        return canonical;
    }
    let Some(file_name) = path.file_name() else {
        return path.to_path_buf();
    };
    path.parent()
        .and_then(|parent| fs::canonicalize(parent).ok())
        .map(|parent| parent.join(file_name))
        .unwrap_or_else(|| path.to_path_buf())
}
fn same_path(first: &std::path::Path, second: &std::path::Path) -> bool {
    let first = comparable_path(first);
    let second = comparable_path(second);
    #[cfg(target_os = "windows")]
    {
        first
            .to_string_lossy()
            .eq_ignore_ascii_case(&second.to_string_lossy())
    }
    #[cfg(not(target_os = "windows"))]
    {
        first == second
    }
}
fn valid_item(store: &Store, item: &ActionItem) -> bool {
    let owner_exists = match item.owner_kind {
        OwnerKind::Project => store
            .projects
            .iter()
            .any(|project| project.id == item.owner_id),
        OwnerKind::List => store.lists.iter().any(|list| list.id == item.owner_id),
    };
    owner_exists
        && !item.title.trim().is_empty()
        && item.title.chars().count() <= 160
        && item
            .due_on
            .as_ref()
            .is_none_or(|v| NaiveDate::parse_from_str(v, "%Y-%m-%d").is_ok())
        && item
            .remind_at
            .as_ref()
            .is_none_or(|v| DateTime::parse_from_rfc3339(v).is_ok())
        && item
            .notified_remind_at
            .as_ref()
            .is_none_or(|value| item.remind_at.as_ref() == Some(value))
        && item
            .completed_at
            .as_ref()
            .is_none_or(|value| DateTime::parse_from_rfc3339(value).is_ok())
}
fn load(app: &AppHandle) -> Result<(PathBuf, Store, bool), String> {
    let p = path(app)?;
    match local_store::read(&p, SCHEMA_VERSION, valid) {
        Ok(Some(v)) => Ok((p, v.store, v.recovered_from_backup)),
        Ok(None) => Ok((p, seed(), false)),
        Err(local_store::ReadError::FutureVersion(v)) => Err(format!(
            "Workspace uses newer schema version {v}; this build will not overwrite it."
        )),
        Err(_) => {
            Err("Workspace data could not be read, and no valid local backup is available.".into())
        }
    }
}
fn snap(path: PathBuf, store: Store, recovered: bool) -> WorkspaceSnapshot {
    WorkspaceSnapshot {
        schema_version: SCHEMA_VERSION,
        revision: store.revision,
        captured_at: now(),
        storage_path: path.to_string_lossy().into_owned(),
        recovered_from_backup: recovered,
        categories: store.categories,
        projects: store.projects,
        lists: store.lists,
        links: store.links,
        action_items: store.action_items,
        bindings: store.bindings,
    }
}
pub fn get_snapshot(app: &AppHandle, state: &WorkspaceState) -> Result<WorkspaceSnapshot, String> {
    let _g = lock(state)?;
    let (p, s, r) = load(app)?;
    Ok(snap(p, s, r))
}
pub fn export_workspace(
    app: &AppHandle,
    state: &WorkspaceState,
    destination_path: String,
) -> Result<String, String> {
    let _guard = lock(state)?;
    let (workspace_path, store, _) = load(app)?;
    let mut destination = PathBuf::from(destination_path.trim());
    if destination.as_os_str().is_empty() {
        return Err("Choose a destination for the workspace export.".to_owned());
    }
    if destination.extension().is_none() {
        destination.set_extension("json");
    }
    if same_path(&destination, &workspace_path)
        || same_path(&destination, &local_store::backup_path(&workspace_path))
        || same_path(&destination, &local_store::pending_path(&workspace_path))
    {
        return Err(
            "Choose a destination outside Attention Hub's live workspace files.".to_owned(),
        );
    }
    let transfer = WorkspaceTransfer {
        format: TRANSFER_FORMAT.to_owned(),
        schema_version: SCHEMA_VERSION,
        exported_at: now(),
        workspace: store,
    };
    local_store::write_portable(&destination, &transfer)?;
    Ok(destination.to_string_lossy().into_owned())
}
pub fn preview_workspace_import(
    app: &AppHandle,
    state: &WorkspaceState,
    source_path: String,
) -> Result<WorkspaceImportPreview, String> {
    let _guard = lock(state)?;
    let (_, current, _) = load(app)?;
    let transfer = read_transfer(std::path::Path::new(source_path.trim()))?;
    Ok(WorkspaceImportPreview {
        schema_version: transfer.schema_version,
        exported_at: transfer.exported_at.clone(),
        digest: transfer_digest(&transfer)?,
        workspace_revision: current.revision,
        counts: transfer_counts(&transfer.workspace),
    })
}
pub fn import_workspace(
    app: &AppHandle,
    state: &WorkspaceState,
    source_path: String,
    expected_revision: u64,
    expected_digest: String,
) -> Result<WorkspaceSnapshot, String> {
    let _guard = lock(state)?;
    let (workspace_path, current, recovered_from_backup) = load(app)?;
    ensure_revision(&current, expected_revision)?;
    let mut transfer = read_transfer(std::path::Path::new(source_path.trim()))?;
    if transfer_digest(&transfer)? != expected_digest {
        return Err(
            "The selected export changed after preview. Select it again before importing."
                .to_owned(),
        );
    }
    isolate_imported_note_revisions(&mut transfer.workspace, &current)?;
    transfer.workspace.revision = current
        .revision
        .checked_add(1)
        .ok_or_else(|| "Workspace revision has reached its supported limit.".to_owned())?;
    local_store::write(
        &workspace_path,
        &transfer.workspace,
        true,
        recovered_from_backup,
        "Workspace",
    )?;
    Ok(snap(workspace_path, transfer.workspace, false))
}
fn mutate<F>(
    app: &AppHandle,
    state: &WorkspaceState,
    preserve: bool,
    action: F,
) -> Result<WorkspaceSnapshot, String>
where
    F: FnOnce(&mut Store) -> Result<(), String>,
{
    let _g = lock(state)?;
    let (p, mut s, recovered_from_backup) = load(app)?;
    action(&mut s)?;
    s.revision += 1;
    local_store::write(&p, &s, preserve, recovered_from_backup, "Workspace")?;
    Ok(snap(p, s, false))
}
fn name(value: String, label: &str) -> Result<String, String> {
    let value = value.trim().to_owned();
    if value.is_empty() {
        Err(format!("{label} is required."))
    } else if value.chars().count() > 80 {
        Err(format!("{label} must be 80 characters or fewer."))
    } else {
        Ok(value)
    }
}

pub(crate) fn normalize_notes(notes: Vec<NoteSegment>) -> Result<Vec<NoteSegment>, String> {
    if notes.len() > 256 {
        return Err("Notes must contain 256 text segments or fewer.".into());
    }
    let mut normalized: Vec<NoteSegment> = Vec::with_capacity(notes.len());
    for segment in notes {
        if segment.text.is_empty() {
            continue;
        }
        let href = segment
            .href
            .map(|url| external_url::normalize_url(&url, "URL"))
            .transpose()?;
        if let Some(previous) = normalized.last_mut() {
            if previous.href == href {
                previous.text.push_str(&segment.text);
                continue;
            }
        }
        normalized.push(NoteSegment {
            text: segment.text,
            href,
        });
    }
    let characters = normalized
        .iter()
        .map(|segment| segment.text.chars().count())
        .sum::<usize>();
    if characters > 4_000 {
        return Err("Notes must be 4,000 characters or fewer.".into());
    }
    if normalized
        .iter()
        .filter(|segment| segment.href.is_some())
        .count()
        > 25
    {
        return Err("Notes may contain 25 linked text segments or fewer.".into());
    }
    Ok(normalized)
}

fn due_on(value: Option<String>) -> Result<Option<String>, String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .map(|value| {
            NaiveDate::parse_from_str(&value, "%Y-%m-%d")
                .map(|_| value)
                .map_err(|_| "Due date must be a valid calendar day.".to_owned())
        })
        .transpose()
}

fn remind_at(value: Option<String>) -> Result<Option<String>, String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .map(|value| {
            DateTime::parse_from_rfc3339(&value)
                .map(|instant| {
                    instant
                        .with_timezone(&Utc)
                        .to_rfc3339_opts(SecondsFormat::Secs, true)
                })
                .map_err(|_| {
                    "Reminder time must include a valid date, time, and timezone.".to_owned()
                })
        })
        .transpose()
}
pub fn create_category(
    app: &AppHandle,
    state: &WorkspaceState,
    name_value: String,
) -> Result<WorkspaceSnapshot, String> {
    let value = name(name_value, "Category name")?;
    mutate(app, state, true, |s| {
        if s.categories.len() >= 18 {
            return Err("Personal categories have reached their 18-category safety limit.".into());
        }
        let t = now();
        let index = s
            .categories
            .iter()
            .map(|x| x.sort_index)
            .max()
            .unwrap_or(-1)
            + 1;
        s.categories.push(PersonalCategory {
            id: id(),
            name: value,
            sort_index: index,
            created_at: t.clone(),
            updated_at: t,
        });
        Ok(())
    })
}
pub fn create_project(
    app: &AppHandle,
    state: &WorkspaceState,
    name_value: String,
) -> Result<WorkspaceSnapshot, String> {
    let value = name(name_value, "Project name")?;
    mutate(app, state, true, |s| {
        if s.projects.len() >= 200 {
            return Err("Projects have reached their 200-project safety limit.".into());
        }
        let t = now();
        let index = s.projects.iter().map(|x| x.sort_index).max().unwrap_or(-1) + 1;
        s.projects.push(Project {
            id: id(),
            name: value,
            notes: vec![],
            notes_revision: 0,
            archived_at: None,
            sort_index: index,
            created_at: t.clone(),
            updated_at: t,
        });
        Ok(())
    })
}

pub fn create_list(
    app: &AppHandle,
    state: &WorkspaceState,
    category_id: Option<&str>,
    name_value: String,
) -> Result<WorkspaceSnapshot, String> {
    let value = name(name_value, "List name")?;
    mutate(app, state, true, |store| {
        if store.lists.len() >= 200 {
            return Err("Lists have reached their 200-list safety limit.".into());
        }
        if category_id.is_some_and(|category_id| {
            !store
                .categories
                .iter()
                .any(|category| category.id == category_id)
        }) {
            return Err("The selected personal category no longer exists.".into());
        }
        let timestamp = now();
        let sort_index = store
            .lists
            .iter()
            .filter(|list| list.category_id.as_deref() == category_id)
            .map(|list| list.sort_index)
            .max()
            .unwrap_or(-1)
            + 1;
        store.lists.push(List {
            id: id(),
            category_id: category_id.map(str::to_owned),
            name: value,
            sort_index,
            created_at: timestamp.clone(),
            updated_at: timestamp,
        });
        Ok(())
    })
}

pub fn rename_category(
    app: &AppHandle,
    state: &WorkspaceState,
    category_id: &str,
    name_value: String,
) -> Result<WorkspaceSnapshot, String> {
    let value = name(name_value, "Category name")?;
    mutate(app, state, true, |store| {
        let category = store
            .categories
            .iter_mut()
            .find(|category| category.id == category_id)
            .ok_or_else(|| "The selected personal category no longer exists.".to_owned())?;
        category.name = value;
        category.updated_at = now();
        Ok(())
    })
}

pub fn rename_list(
    app: &AppHandle,
    state: &WorkspaceState,
    list_id: &str,
    name_value: String,
) -> Result<WorkspaceSnapshot, String> {
    let value = name(name_value, "List name")?;
    mutate(app, state, true, |store| {
        let list = store
            .lists
            .iter_mut()
            .find(|list| list.id == list_id)
            .ok_or_else(|| "The selected list no longer exists.".to_owned())?;
        list.name = value;
        list.updated_at = now();
        Ok(())
    })
}

pub fn rename_project(
    app: &AppHandle,
    state: &WorkspaceState,
    project_id: &str,
    name_value: String,
) -> Result<WorkspaceSnapshot, String> {
    let value = name(name_value, "Project name")?;
    mutate(app, state, true, |store| {
        let project = store
            .projects
            .iter_mut()
            .find(|project| project.id == project_id)
            .ok_or_else(|| "The selected project no longer exists.".to_owned())?;
        project.name = value;
        project.updated_at = now();
        Ok(())
    })
}

pub fn move_category(
    app: &AppHandle,
    state: &WorkspaceState,
    category_id: &str,
    sort_index: i32,
) -> Result<WorkspaceSnapshot, String> {
    mutate(app, state, true, |store| {
        let category = store
            .categories
            .iter_mut()
            .find(|category| category.id == category_id)
            .ok_or_else(|| "The selected personal category no longer exists.".to_owned())?;
        category.sort_index = sort_index;
        category.updated_at = now();
        Ok(())
    })
}

pub fn move_list(
    app: &AppHandle,
    state: &WorkspaceState,
    list_id: &str,
    sort_index: i32,
) -> Result<WorkspaceSnapshot, String> {
    mutate(app, state, true, |store| {
        let list = store
            .lists
            .iter_mut()
            .find(|list| list.id == list_id)
            .ok_or_else(|| "The selected list no longer exists.".to_owned())?;
        list.sort_index = sort_index;
        list.updated_at = now();
        Ok(())
    })
}

pub fn set_list_category(
    app: &AppHandle,
    state: &WorkspaceState,
    list_id: &str,
    category_id: Option<&str>,
) -> Result<WorkspaceSnapshot, String> {
    mutate(app, state, true, |store| {
        if category_id.is_some_and(|id| !store.categories.iter().any(|category| category.id == id))
        {
            return Err("The selected personal category no longer exists.".into());
        }
        let next_index = store
            .lists
            .iter()
            .filter(|list| list.category_id.as_deref() == category_id)
            .map(|list| list.sort_index)
            .max()
            .unwrap_or(-1)
            + 1;
        let list = store
            .lists
            .iter_mut()
            .find(|list| list.id == list_id)
            .ok_or_else(|| "The selected personal list no longer exists.".to_owned())?;
        list.category_id = category_id.map(str::to_owned);
        list.sort_index = next_index;
        list.updated_at = now();
        Ok(())
    })
}

pub fn move_project(
    app: &AppHandle,
    state: &WorkspaceState,
    project_id: &str,
    sort_index: i32,
) -> Result<WorkspaceSnapshot, String> {
    mutate(app, state, true, |store| {
        let project = store
            .projects
            .iter_mut()
            .find(|project| project.id == project_id)
            .ok_or_else(|| "The selected project no longer exists.".to_owned())?;
        project.sort_index = sort_index;
        project.updated_at = now();
        Ok(())
    })
}

pub fn create_project_link(
    app: &AppHandle,
    state: &WorkspaceState,
    project_id: &str,
    input: ProjectLinkInput,
) -> Result<WorkspaceSnapshot, String> {
    let label = name(input.label, "Link label")?;
    let url = external_url::normalize_url(input.url.trim(), "URL")?;
    let kind = normalize_link_kind(input.kind)?;
    mutate(app, state, true, |store| {
        if !store
            .projects
            .iter()
            .any(|project| project.id == project_id)
        {
            return Err("The selected project no longer exists.".into());
        }
        if store
            .links
            .iter()
            .filter(|link| link.project_id == project_id)
            .count()
            >= 50
        {
            return Err("Project links have reached their 50-link safety limit.".into());
        }
        let timestamp = now();
        let sort_index = store
            .links
            .iter()
            .filter(|link| link.project_id == project_id)
            .map(|link| link.sort_index)
            .max()
            .unwrap_or(-1)
            + 1;
        store.links.push(ProjectLink {
            id: id(),
            project_id: project_id.into(),
            label,
            url,
            kind,
            sort_index,
            created_at: timestamp.clone(),
            updated_at: timestamp,
        });
        Ok(())
    })
}

pub fn update_project_link(
    app: &AppHandle,
    state: &WorkspaceState,
    link_id: &str,
    input: ProjectLinkInput,
) -> Result<WorkspaceSnapshot, String> {
    let label = name(input.label, "Link label")?;
    let url = external_url::normalize_url(input.url.trim(), "URL")?;
    let kind = normalize_link_kind(input.kind)?;
    mutate(app, state, true, |store| {
        let link = store
            .links
            .iter_mut()
            .find(|link| link.id == link_id)
            .ok_or_else(|| "The selected project link no longer exists.".to_owned())?;
        link.label = label;
        link.url = url;
        link.kind = kind;
        link.updated_at = now();
        Ok(())
    })
}

pub fn delete_project_link(
    app: &AppHandle,
    state: &WorkspaceState,
    link_id: &str,
) -> Result<WorkspaceSnapshot, String> {
    mutate(app, state, false, |store| {
        let before = store.links.len();
        store.links.retain(|link| link.id != link_id);
        if before == store.links.len() {
            Err("The selected project link no longer exists.".into())
        } else {
            let timestamp = now();
            for binding in store
                .bindings
                .iter_mut()
                .filter(|binding| binding.project_link_id.as_deref() == Some(link_id))
            {
                binding.project_link_id = None;
                binding.updated_at = timestamp.clone();
            }
            Ok(())
        }
    })
}

pub fn project_link_url(
    app: &AppHandle,
    state: &WorkspaceState,
    link_id: &str,
) -> Result<String, String> {
    let _guard = lock(state)?;
    let (_, store, _) = load(app)?;
    let url = store
        .links
        .iter()
        .find(|link| link.id == link_id)
        .ok_or_else(|| "The selected project link no longer exists.".to_owned())?
        .url
        .clone();
    external_url::normalize_url(&url, "URL")
}

pub fn move_project_link(
    app: &AppHandle,
    state: &WorkspaceState,
    link_id: &str,
    sort_index: i32,
) -> Result<WorkspaceSnapshot, String> {
    mutate(app, state, true, |store| {
        let link = store
            .links
            .iter_mut()
            .find(|link| link.id == link_id)
            .ok_or_else(|| "The selected project link no longer exists.".to_owned())?;
        link.sort_index = sort_index;
        link.updated_at = now();
        Ok(())
    })
}

fn normalize_link_kind(value: String) -> Result<String, String> {
    let value = value.trim().to_ascii_lowercase();
    matches!(
        value.as_str(),
        "staging" | "production" | "design" | "docs" | "board" | "repo" | "other"
    )
    .then_some(value)
    .ok_or_else(|| "Project link kind is invalid.".to_owned())
}
pub fn create_action_item(
    app: &AppHandle,
    state: &WorkspaceState,
    input: ActionItemInput,
) -> Result<WorkspaceSnapshot, String> {
    let title = input.title.trim().to_owned();
    if title.is_empty() || title.chars().count() > 160 {
        return Err("To-do title must be 1 to 160 characters.".into());
    }
    let input = ActionItemInput {
        title,
        notes: normalize_notes(input.notes)?,
        due_on: due_on(input.due_on)?,
        remind_at: remind_at(input.remind_at)?,
        ..input
    };
    mutate(app, state, true, |s| {
        if s.action_items.len() >= 2000 {
            return Err("To-dos have reached their 2,000-item safety limit.".into());
        }
        let owner_ok = match input.owner_kind {
            OwnerKind::Project => s.projects.iter().any(|p| p.id == input.owner_id),
            OwnerKind::List => s.lists.iter().any(|l| l.id == input.owner_id),
        };
        if !owner_ok {
            return Err("The selected to-do owner no longer exists.".into());
        }
        let t = now();
        s.action_items.push(ActionItem {
            id: id(),
            owner_kind: input.owner_kind,
            owner_id: input.owner_id,
            title: input.title,
            notes: input.notes,
            due_on: input.due_on,
            remind_at: input.remind_at,
            notified_remind_at: None,
            completed_at: None,
            created_at: t.clone(),
            updated_at: t,
        });
        Ok(())
    })
}

pub fn update_action_item(
    app: &AppHandle,
    state: &WorkspaceState,
    item_id: &str,
    input: ActionItemInput,
) -> Result<WorkspaceSnapshot, String> {
    let title = input.title.trim().to_owned();
    if title.is_empty() || title.chars().count() > 160 {
        return Err("To-do title must be 1 to 160 characters.".into());
    }
    let normalized_notes = normalize_notes(input.notes)?;
    let due = due_on(input.due_on)?;
    let reminder = remind_at(input.remind_at)?;
    mutate(app, state, true, |store| {
        let owner_exists = match input.owner_kind {
            OwnerKind::Project => store
                .projects
                .iter()
                .any(|project| project.id == input.owner_id),
            OwnerKind::List => store.lists.iter().any(|list| list.id == input.owner_id),
        };
        if !owner_exists {
            return Err("The selected to-do owner no longer exists.".into());
        }
        let item = store
            .action_items
            .iter_mut()
            .find(|item| item.id == item_id)
            .ok_or_else(|| "The selected to-do no longer exists.".to_owned())?;
        item.owner_kind = input.owner_kind;
        item.owner_id = input.owner_id;
        item.title = title;
        item.notes = normalized_notes;
        item.due_on = due;
        item.remind_at = reminder.clone();
        if item.notified_remind_at != reminder {
            item.notified_remind_at = None;
        }
        item.updated_at = now();
        Ok(())
    })
}

pub fn set_action_item_completed(
    app: &AppHandle,
    state: &WorkspaceState,
    item_id: &str,
    completed: bool,
) -> Result<WorkspaceSnapshot, String> {
    mutate(app, state, true, |store| {
        let item = store
            .action_items
            .iter_mut()
            .find(|item| item.id == item_id)
            .ok_or_else(|| "The selected to-do no longer exists.".to_owned())?;
        item.completed_at = completed.then(now);
        item.updated_at = now();
        Ok(())
    })
}

pub fn move_action_item(
    app: &AppHandle,
    state: &WorkspaceState,
    item_id: &str,
    owner_kind: OwnerKind,
    owner_id: &str,
) -> Result<WorkspaceSnapshot, String> {
    mutate(app, state, true, |store| {
        let owner_exists = match owner_kind {
            OwnerKind::Project => store.projects.iter().any(|project| project.id == owner_id),
            OwnerKind::List => store.lists.iter().any(|list| list.id == owner_id),
        };
        if !owner_exists {
            return Err("The selected to-do owner no longer exists.".into());
        }
        let item = store
            .action_items
            .iter_mut()
            .find(|item| item.id == item_id)
            .ok_or_else(|| "The selected to-do no longer exists.".to_owned())?;
        item.owner_kind = owner_kind;
        item.owner_id = owner_id.into();
        item.updated_at = now();
        Ok(())
    })
}

pub fn delete_completed_action_items(
    app: &AppHandle,
    state: &WorkspaceState,
    owner_kind: Option<OwnerKind>,
    owner_id: Option<String>,
) -> Result<WorkspaceSnapshot, String> {
    if owner_kind.is_some() != owner_id.is_some() {
        return Err("Completed to-do cleanup requires both owner fields or neither.".into());
    }
    mutate(app, state, false, |store| {
        let before = store.action_items.len();
        store.action_items.retain(|item| {
            item.completed_at.is_none()
                || owner_kind.as_ref().is_some_and(|kind| {
                    item.owner_kind != *kind
                        || item.owner_id != owner_id.as_deref().unwrap_or_default()
                })
        });
        (before != store.action_items.len())
            .then_some(())
            .ok_or_else(|| "There are no completed to-dos to delete.".to_owned())
    })
}

pub fn notify_due_action_items(
    app: &AppHandle,
    state: &WorkspaceState,
) -> Result<WorkspaceSnapshot, String> {
    let current = Utc::now();
    let snapshot = get_snapshot(app, state)?;
    let has_due = snapshot.action_items.iter().any(|item| {
        item.completed_at.is_none()
            && item.notified_remind_at != item.remind_at
            && item
                .remind_at
                .as_ref()
                .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
                .is_some_and(|value| value.with_timezone(&Utc) <= current)
    });
    if !has_due {
        return Ok(snapshot);
    }
    mutate(app, state, true, |store| {
        for item in &mut store.action_items {
            let due = item
                .remind_at
                .as_ref()
                .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
                .is_some_and(|value| value.with_timezone(&Utc) <= current);
            if item.completed_at.is_none() && due && item.notified_remind_at != item.remind_at {
                item.notified_remind_at = item.remind_at.clone();
                item.updated_at = now();
            }
        }
        Ok(())
    })
}

pub fn due_notification_body(snapshot: &WorkspaceSnapshot) -> Option<String> {
    let current = Utc::now();
    let due = snapshot
        .action_items
        .iter()
        .filter(|item| {
            item.completed_at.is_none()
                && item.notified_remind_at != item.remind_at
                && item
                    .remind_at
                    .as_ref()
                    .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
                    .is_some_and(|value| value.with_timezone(&Utc) <= current)
        })
        .collect::<Vec<_>>();
    match due.as_slice() {
        [] => None,
        [item] if item.owner_kind == OwnerKind::Project => {
            Some(format!("Follow up: {}", item.title))
        }
        [_] => Some("A personal to-do reminder is due.".into()),
        items => Some(format!("{} to-do reminders are due.", items.len())),
    }
}

pub fn action_item_note_url(
    app: &AppHandle,
    state: &WorkspaceState,
    item_id: &str,
    requested_url: &str,
) -> Result<String, String> {
    let requested_url = external_url::normalize_url(requested_url, "To-do note link")?;
    let _guard = lock(state)?;
    let (_, store, _) = load(app)?;
    let item = store
        .action_items
        .iter()
        .find(|item| item.id == item_id)
        .ok_or_else(|| "The selected to-do no longer exists.".to_owned())?;
    item.notes
        .iter()
        .filter_map(|segment| segment.href.as_deref())
        .any(|href| {
            external_url::normalize_url(href, "To-do note link")
                .is_ok_and(|href| href == requested_url)
        })
        .then_some(requested_url)
        .ok_or_else(|| "This link is not present in the saved to-do notes.".to_owned())
}

pub fn delete_action_item(
    app: &AppHandle,
    state: &WorkspaceState,
    item_id: &str,
) -> Result<WorkspaceSnapshot, String> {
    mutate(app, state, false, |store| {
        let before = store.action_items.len();
        store.action_items.retain(|item| item.id != item_id);
        if before == store.action_items.len() {
            Err("The selected to-do no longer exists.".into())
        } else {
            Ok(())
        }
    })
}

pub fn delete_project(
    app: &AppHandle,
    state: &WorkspaceState,
    project_id: &str,
    expected_revision: u64,
) -> Result<WorkspaceSnapshot, String> {
    mutate(app, state, false, |store| {
        delete_project_from_store(store, project_id, expected_revision)
    })
}

fn delete_project_from_store(
    store: &mut Store,
    project_id: &str,
    expected_revision: u64,
) -> Result<(), String> {
    ensure_revision(store, expected_revision)?;
    let before = store.projects.len();
    store.projects.retain(|project| project.id != project_id);
    if before == store.projects.len() {
        return Err("The selected project no longer exists.".into());
    }
    store.links.retain(|link| link.project_id != project_id);
    store
        .action_items
        .retain(|item| !(item.owner_kind == OwnerKind::Project && item.owner_id == project_id));
    store
        .bindings
        .retain(|binding| binding.project_id.as_deref() != Some(project_id));
    Ok(())
}

pub fn delete_list(
    app: &AppHandle,
    state: &WorkspaceState,
    list_id: &str,
    expected_revision: u64,
) -> Result<WorkspaceSnapshot, String> {
    mutate(app, state, false, |store| {
        ensure_revision(store, expected_revision)?;
        let before = store.lists.len();
        store.lists.retain(|list| list.id != list_id);
        if before == store.lists.len() {
            return Err("The selected list no longer exists.".into());
        }
        store
            .action_items
            .retain(|item| !(item.owner_kind == OwnerKind::List && item.owner_id == list_id));
        Ok(())
    })
}

pub fn delete_category(
    app: &AppHandle,
    state: &WorkspaceState,
    category_id: &str,
    expected_revision: u64,
) -> Result<WorkspaceSnapshot, String> {
    mutate(app, state, false, |store| {
        ensure_revision(store, expected_revision)?;
        store
            .categories
            .iter()
            .find(|category| category.id == category_id)
            .ok_or_else(|| "The selected personal category no longer exists.".to_owned())?;
        let list_ids: HashSet<String> = store
            .lists
            .iter()
            .filter(|list| list.category_id.as_deref() == Some(category_id))
            .map(|list| list.id.clone())
            .collect();
        store
            .categories
            .retain(|category| category.id != category_id);
        store
            .lists
            .retain(|list| list.category_id.as_deref() != Some(category_id));
        store.action_items.retain(|item| {
            !(item.owner_kind == OwnerKind::List && list_ids.contains(&item.owner_id))
        });
        Ok(())
    })
}
pub fn set_project_archived(
    app: &AppHandle,
    state: &WorkspaceState,
    project_id: &str,
    archived: bool,
) -> Result<WorkspaceSnapshot, String> {
    mutate(app, state, true, |s| {
        let p = s
            .projects
            .iter_mut()
            .find(|p| p.id == project_id)
            .ok_or_else(|| "The selected project no longer exists.".to_owned())?;
        p.archived_at = archived.then(now);
        p.updated_at = now();
        Ok(())
    })
}
pub fn save_project_notes(
    app: &AppHandle,
    state: &WorkspaceState,
    project_id: &str,
    notes: Vec<NoteSegment>,
    expected_notes_revision: u64,
) -> Result<WorkspaceSnapshot, String> {
    let notes = normalize_notes(notes)?;
    let timestamp = now();
    mutate(app, state, true, |store| {
        save_project_notes_in_store(store, project_id, notes, expected_notes_revision, timestamp)
    })
}

fn save_project_notes_in_store(
    store: &mut Store,
    project_id: &str,
    notes: Vec<NoteSegment>,
    expected_notes_revision: u64,
    timestamp: String,
) -> Result<(), String> {
    let project = store
        .projects
        .iter_mut()
        .find(|project| project.id == project_id)
        .ok_or_else(|| "The selected project no longer exists.".to_owned())?;
    if project.notes_revision != expected_notes_revision {
        return Err(
            "This project's notes changed in another window. Choose how to resolve the conflict."
                .into(),
        );
    }
    project.notes = notes;
    project.notes_revision += 1;
    project.updated_at = timestamp;
    Ok(())
}

pub fn project_note_url(
    app: &AppHandle,
    state: &WorkspaceState,
    project_id: &str,
    requested_url: &str,
) -> Result<String, String> {
    let requested_url = external_url::normalize_url(requested_url, "Project-note link")?;
    let _guard = lock(state)?;
    let (_, store, _) = load(app)?;
    let project = store
        .projects
        .iter()
        .find(|project| project.id == project_id)
        .ok_or_else(|| "The selected project no longer exists.".to_owned())?;
    project
        .notes
        .iter()
        .filter_map(|segment| segment.href.as_deref())
        .any(|href| {
            external_url::normalize_url(href, "Project-note link")
                .is_ok_and(|href| href == requested_url)
        })
        .then_some(requested_url)
        .ok_or_else(|| "This link is not present in the saved project notes.".to_owned())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteImpact {
    pub entity: String,
    pub id: Option<String>,
    pub name: Option<String>,
    pub counts: DeleteCounts,
    pub workspace_revision: u64,
}
#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteCounts {
    pub categories: Option<usize>,
    pub projects: Option<usize>,
    pub lists: Option<usize>,
    pub links: Option<usize>,
    pub action_items: Option<usize>,
    pub bindings: Option<usize>,
}
pub fn delete_impact(
    app: &AppHandle,
    state: &WorkspaceState,
    entity: &str,
    id: Option<&str>,
) -> Result<DeleteImpact, String> {
    let _guard = lock(state)?;
    let (_, store, _) = load(app)?;
    let mut counts = DeleteCounts::default();
    let name = match entity {
        "workspace" => {
            counts.categories = Some(store.categories.len());
            counts.projects = Some(store.projects.len());
            counts.lists = Some(store.lists.len());
            counts.links = Some(store.links.len());
            counts.action_items = Some(store.action_items.len());
            counts.bindings = Some(store.bindings.len());
            None
        }
        "project" => {
            let entity_id = id.ok_or("Project id is required.")?;
            let project = store
                .projects
                .iter()
                .find(|project| project.id == entity_id)
                .ok_or("The selected project no longer exists.")?;
            counts.links = Some(
                store
                    .links
                    .iter()
                    .filter(|link| link.project_id == entity_id)
                    .count(),
            );
            counts.action_items = Some(
                store
                    .action_items
                    .iter()
                    .filter(|item| {
                        item.owner_kind == OwnerKind::Project && item.owner_id == entity_id
                    })
                    .count(),
            );
            counts.bindings = Some(
                store
                    .bindings
                    .iter()
                    .filter(|binding| binding.project_id.as_deref() == Some(entity_id))
                    .count(),
            );
            Some(project.name.clone())
        }
        "list" => {
            let entity_id = id.ok_or("List id is required.")?;
            let list = store
                .lists
                .iter()
                .find(|list| list.id == entity_id)
                .ok_or("The selected list no longer exists.")?;
            counts.action_items = Some(
                store
                    .action_items
                    .iter()
                    .filter(|item| item.owner_kind == OwnerKind::List && item.owner_id == entity_id)
                    .count(),
            );
            Some(list.name.clone())
        }
        "category" => {
            let entity_id = id.ok_or("Category id is required.")?;
            let category = store
                .categories
                .iter()
                .find(|category| category.id == entity_id)
                .ok_or("The selected personal category no longer exists.")?;
            let list_ids: HashSet<_> = store
                .lists
                .iter()
                .filter(|list| list.category_id.as_deref() == Some(entity_id))
                .map(|list| list.id.as_str())
                .collect();
            counts.lists = Some(list_ids.len());
            counts.action_items = Some(
                store
                    .action_items
                    .iter()
                    .filter(|item| {
                        item.owner_kind == OwnerKind::List
                            && list_ids.contains(item.owner_id.as_str())
                    })
                    .count(),
            );
            Some(category.name.clone())
        }
        _ => return Err("Unknown delete-impact entity.".into()),
    };
    Ok(DeleteImpact {
        entity: entity.into(),
        id: id.map(str::to_owned),
        name,
        counts,
        workspace_revision: store.revision,
    })
}
pub fn delete_all(
    app: &AppHandle,
    state: &WorkspaceState,
    expected: u64,
) -> Result<WorkspaceSnapshot, String> {
    mutate(app, state, false, |s| {
        ensure_revision(s, expected)?;
        let revision = s.revision;
        *s = seed();
        s.revision = revision;
        Ok(())
    })
}

pub fn enrich_calendar_snapshot(
    app: &AppHandle,
    state: &WorkspaceState,
    snapshot: &mut WorkCalendarSnapshot,
) -> Result<(), String> {
    let _guard = lock(state)?;
    let (_, store, _) = load(app)?;
    // The calendar layer knows a source changed but not how much is affected;
    // the store does. Every existing binding was made under the previous source.
    if let Some(source_change) = snapshot.source_change.as_mut() {
        source_change.previous_association_count = store.bindings.len();
    }
    let mut tokens = state
        .event_tokens
        .lock()
        .map_err(|_| "Workspace event state is temporarily unavailable.".to_owned())?;
    for event in snapshot
        .selection
        .iter_mut()
        .chain(snapshot.overlapping_selections.iter_mut())
        .chain(snapshot.next_selection.iter_mut())
    {
        let Some(key) = event.workspace_key.clone() else {
            continue;
        };
        event.event_token = Some(register_event_token(
            &mut tokens,
            &key,
            &event.subject,
            &event.start,
            &event.end,
        ));
        event.event_workspace = binding_summary(&store, &key);
    }
    for event in &mut snapshot.day_selections {
        let Some(key) = event.workspace_key.clone() else {
            continue;
        };
        event.event_token = Some(register_event_token(
            &mut tokens,
            &key,
            &event.subject,
            &event.start,
            &event.end,
        ));
        event.event_workspace = binding_summary(&store, &key);
    }
    Ok(())
}

/// Copy calendar associations from a previous source scope onto the keys the
/// same series have under the current one.
///
/// Deliberately additive. The previous bindings are left in place, so a user who
/// decides the new URL was a mistake has lost nothing, and an existing binding
/// under a current key is never overwritten — a key already in use belongs to
/// whatever the user most recently chose for it.
pub fn carry_over_calendar_associations(
    app: &AppHandle,
    state: &WorkspaceState,
    remap: &[(String, String)],
) -> Result<(WorkspaceSnapshot, usize), String> {
    let mut carried = 0usize;
    let snapshot = mutate(app, state, false, |store| {
        let timestamp = now();
        for (previous_key, current_key) in remap {
            if previous_key == current_key {
                continue;
            }
            if store
                .bindings
                .iter()
                .any(|binding| binding.event_key == *current_key)
            {
                continue;
            }
            let Some(source) = store
                .bindings
                .iter()
                .find(|binding| binding.event_key == *previous_key)
                .cloned()
            else {
                continue;
            };
            store.bindings.push(Binding {
                event_key: current_key.clone(),
                project_id: source.project_id,
                project_link_id: source.project_link_id,
                link_url: source.link_url,
                created_at: timestamp.clone(),
                updated_at: timestamp.clone(),
            });
            carried += 1;
        }
        Ok(())
    })?;
    Ok((snapshot, carried))
}

fn binding_summary(store: &Store, event_key: &str) -> Option<EventWorkspaceSummary> {
    let binding = store
        .bindings
        .iter()
        .find(|binding| binding.event_key == event_key)?;
    let project = binding
        .project_id
        .as_ref()
        .and_then(|id| store.projects.iter().find(|project| project.id == *id));
    let link_url = binding_project_link_url(store, binding);
    Some(EventWorkspaceSummary {
        project_id: project.map(|project| project.id.clone()),
        project_name: project.map(|project| project.name.clone()),
        notes_present: project.is_some_and(|project| !project.notes.is_empty()),
        link_url_present: link_url.is_some(),
        link_url,
    })
}

fn binding_project_link_url(store: &Store, binding: &Binding) -> Option<String> {
    binding
        .project_link_id
        .as_ref()
        .and_then(|link_id| store.links.iter().find(|link| link.id == *link_id))
        .map(|link| link.url.clone())
        .or_else(|| binding.link_url.clone())
}

pub fn get_event_workspace(
    app: &AppHandle,
    state: &WorkspaceState,
    event_token: &str,
) -> Result<EventWorkspaceSnapshot, String> {
    let target = event_target(state, event_token)?;
    let _guard = lock(state)?;
    let (_, store, recovered) = load(app)?;
    let binding = store
        .bindings
        .iter()
        .find(|binding| binding.event_key == target.workspace_key);
    Ok(EventWorkspaceSnapshot {
        event_token: event_token.into(),
        subject: target.subject,
        start: target.start,
        end: target.end,
        project_id: binding.and_then(|binding| binding.project_id.clone()),
        project_link_id: binding.and_then(|binding| binding.project_link_id.clone()),
        link_url: binding.and_then(|binding| binding.link_url.clone()),
        recovered_from_backup: recovered,
    })
}

pub fn save_event_workspace(
    app: &AppHandle,
    state: &WorkspaceState,
    event_token: &str,
    input: EventWorkspaceInput,
) -> Result<WorkspaceSnapshot, String> {
    let target = event_target(state, event_token)?;
    let project_id = input.project_id;
    let project_link_id = input.project_link_id;
    let link_url = input
        .link_url
        .map(|url| external_url::normalize_url(url.trim(), "Link"))
        .transpose()?;
    mutate(app, state, true, |store| {
        if project_id
            .as_ref()
            .is_some_and(|id| !store.projects.iter().any(|project| project.id == *id))
        {
            return Err("The selected project no longer exists.".into());
        }
        if project_link_id.is_some() && link_url.is_some() {
            return Err("Choose either a Project Hub link or a custom Today link.".into());
        }
        if project_link_id.as_ref().is_some_and(|link_id| {
            project_id.as_ref().is_none_or(|project_id| {
                !store
                    .links
                    .iter()
                    .any(|link| link.id == *link_id && link.project_id == *project_id)
            })
        }) {
            return Err("The selected Project Hub link no longer belongs to this project.".into());
        }
        let timestamp = now();
        if let Some(binding) = store
            .bindings
            .iter_mut()
            .find(|binding| binding.event_key == target.workspace_key)
        {
            binding.project_id = project_id;
            binding.project_link_id = project_link_id;
            binding.link_url = link_url;
            binding.updated_at = timestamp;
        } else {
            store.bindings.push(Binding {
                event_key: target.workspace_key,
                project_id,
                project_link_id,
                link_url,
                created_at: timestamp.clone(),
                updated_at: timestamp,
            });
        }
        Ok(())
    })
}

pub fn unlink_event_workspace(
    app: &AppHandle,
    state: &WorkspaceState,
    event_token: &str,
) -> Result<WorkspaceSnapshot, String> {
    let target = event_target(state, event_token)?;
    mutate(app, state, false, |store| {
        let before = store.bindings.len();
        store
            .bindings
            .retain(|binding| binding.event_key != target.workspace_key);
        (before != store.bindings.len())
            .then_some(())
            .ok_or_else(|| "This event has no saved settings.".to_owned())
    })
}

pub fn event_workspace_link_url(
    app: &AppHandle,
    state: &WorkspaceState,
    event_token: &str,
) -> Result<String, String> {
    let target = event_target(state, event_token)?;
    let _guard = lock(state)?;
    let (_, store, _) = load(app)?;
    let binding = store
        .bindings
        .iter()
        .find(|binding| binding.event_key == target.workspace_key)
        .ok_or_else(|| "This event has no saved link.".to_owned())?;
    let url = binding_project_link_url(&store, binding)
        .ok_or_else(|| "This event has no saved link.".to_owned())?;
    external_url::normalize_url(&url, "Link")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seed_is_stable_and_valid_without_materializing_a_file() {
        let first = seed();
        let second = seed();
        assert!(valid(&first));
        assert_eq!(
            serde_json::to_vec(&first).unwrap(),
            serde_json::to_vec(&second).unwrap()
        );
        assert!(first.categories.is_empty());
        assert_eq!(first.lists[0].created_at, SEED_TIMESTAMP);
        assert_eq!(first.lists[0].id, "list-inbox");
    }

    #[test]
    fn validation_rejects_orphans_and_bad_dates() {
        let mut store = seed();
        store.action_items.push(ActionItem {
            id: "item".into(),
            owner_kind: OwnerKind::List,
            owner_id: "missing".into(),
            title: "Check".into(),
            notes: vec![],
            due_on: Some("not-a-date".into()),
            remind_at: None,
            notified_remind_at: None,
            completed_at: None,
            created_at: SEED_TIMESTAMP.into(),
            updated_at: SEED_TIMESTAMP.into(),
        });
        assert!(!valid(&store));
    }

    #[test]
    fn delete_impact_counts_project_cascade_data() {
        let mut store = seed();
        let timestamp = SEED_TIMESTAMP.to_owned();
        store.projects.push(Project {
            id: "project".into(),
            name: "Atlas".into(),
            notes: vec![],
            notes_revision: 0,
            archived_at: None,
            sort_index: 0,
            created_at: timestamp.clone(),
            updated_at: timestamp.clone(),
        });
        store.links.push(ProjectLink {
            id: "link".into(),
            project_id: "project".into(),
            label: "Docs".into(),
            url: "https://example.com/".into(),
            kind: "docs".into(),
            sort_index: 0,
            created_at: timestamp.clone(),
            updated_at: timestamp.clone(),
        });
        store.action_items.push(ActionItem {
            id: "item".into(),
            owner_kind: OwnerKind::Project,
            owner_id: "project".into(),
            title: "Review".into(),
            notes: vec![],
            due_on: None,
            remind_at: None,
            notified_remind_at: None,
            completed_at: None,
            created_at: timestamp.clone(),
            updated_at: timestamp.clone(),
        });
        store.bindings.push(Binding {
            event_key: "event".into(),
            project_id: Some("project".into()),
            project_link_id: Some("link".into()),
            link_url: None,
            created_at: timestamp.clone(),
            updated_at: timestamp,
        });
        assert!(valid(&store));
        assert_eq!(
            binding_project_link_url(&store, &store.bindings[0]).as_deref(),
            Some("https://example.com/")
        );
        assert_eq!(
            store
                .links
                .iter()
                .filter(|link| link.project_id == "project")
                .count(),
            1
        );
        assert_eq!(
            store
                .action_items
                .iter()
                .filter(|item| item.owner_id == "project")
                .count(),
            1
        );
        assert_eq!(
            store
                .bindings
                .iter()
                .filter(|binding| binding.project_id.as_deref() == Some("project"))
                .count(),
            1
        );
        assert_eq!(
            delete_project_from_store(&mut store.clone(), "project", 1).unwrap_err(),
            STALE_DELETE
        );
        delete_project_from_store(&mut store, "project", 0).unwrap();
        assert!(store.projects.is_empty());
        assert!(store.links.is_empty());
        assert!(store.action_items.is_empty());
        assert!(store.bindings.is_empty());
    }

    #[test]
    fn notes_revision_accepts_current_and_rejects_stale_writes() {
        let mut store = seed();
        store.projects.push(Project {
            id: "project".into(),
            name: "Atlas".into(),
            notes: vec![],
            notes_revision: 0,
            archived_at: None,
            sort_index: 0,
            created_at: SEED_TIMESTAMP.into(),
            updated_at: SEED_TIMESTAMP.into(),
        });
        let note = NoteSegment {
            text: "First".into(),
            href: None,
        };
        save_project_notes_in_store(
            &mut store,
            "project",
            vec![note],
            0,
            "2026-09-02T10:00:00Z".into(),
        )
        .unwrap();
        assert_eq!(store.projects[0].notes_revision, 1);
        let before = serde_json::to_vec(&store).unwrap();
        let stale = save_project_notes_in_store(
            &mut store,
            "project",
            vec![NoteSegment {
                text: "Stale".into(),
                href: None,
            }],
            0,
            "2026-09-02T10:00:01Z".into(),
        );
        assert!(stale.is_err());
        assert_eq!(serde_json::to_vec(&store).unwrap(), before);
    }

    #[test]
    fn workspace_transfer_is_identified_counted_and_change_detected() {
        let mut store = seed();
        store.projects.push(Project {
            id: "project".into(),
            name: "Atlas".into(),
            notes: vec![],
            notes_revision: 0,
            archived_at: None,
            sort_index: 0,
            created_at: SEED_TIMESTAMP.into(),
            updated_at: SEED_TIMESTAMP.into(),
        });
        let transfer = WorkspaceTransfer {
            format: TRANSFER_FORMAT.into(),
            schema_version: SCHEMA_VERSION,
            exported_at: "2026-09-02T12:00:00Z".into(),
            workspace: store,
        };
        assert!(valid_transfer(&transfer));
        let counts = transfer_counts(&transfer.workspace);
        assert_eq!(counts.projects, 1);
        assert_eq!(counts.lists, 1);
        assert_eq!(counts.action_items, 0);
        let first_digest = transfer_digest(&transfer).unwrap();
        let mut changed = transfer.clone();
        changed.exported_at = "2026-09-02T12:00:01Z".into();
        assert_ne!(transfer_digest(&changed).unwrap(), first_digest);
        changed.format = "other-format".into();
        assert!(!valid_transfer(&changed));
    }

    #[test]
    fn imported_notes_revisions_reject_pre_import_autosaves() {
        let mut current = seed();
        current.projects.push(Project {
            id: "project".into(),
            name: "Current".into(),
            notes: vec![],
            notes_revision: 8,
            archived_at: None,
            sort_index: 0,
            created_at: SEED_TIMESTAMP.into(),
            updated_at: SEED_TIMESTAMP.into(),
        });
        let mut imported = seed();
        imported.projects.push(Project {
            id: "project".into(),
            name: "Imported".into(),
            notes: vec![],
            notes_revision: 3,
            archived_at: None,
            sort_index: 0,
            created_at: SEED_TIMESTAMP.into(),
            updated_at: SEED_TIMESTAMP.into(),
        });

        isolate_imported_note_revisions(&mut imported, &current).unwrap();

        assert_eq!(imported.projects[0].notes_revision, 9);
        assert!(save_project_notes_in_store(
            &mut imported,
            "project",
            vec![],
            8,
            "2026-09-02T12:00:00Z".into(),
        )
        .is_err());
    }
}
