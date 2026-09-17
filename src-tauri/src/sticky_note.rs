use crate::{external_url, local_store};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{Mutex, MutexGuard},
};
use tauri::{AppHandle, Manager};

const SCHEMA_VERSION: u32 = 1;
const MAX_NOTE_CHARS: usize = 4_000;

pub struct StickyNoteState {
    gate: Mutex<()>,
}

impl StickyNoteState {
    pub fn new() -> Self {
        Self {
            gate: Mutex::new(()),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Store {
    schema_version: u32,
    revision: u64,
    text: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StickyNoteSnapshot {
    revision: u64,
    text: String,
    recovered_from_backup: bool,
}

fn empty() -> Store {
    Store {
        schema_version: SCHEMA_VERSION,
        revision: 0,
        text: String::new(),
    }
}

fn valid(store: &Store) -> bool {
    store.schema_version == SCHEMA_VERSION && store.text.chars().count() <= MAX_NOTE_CHARS
}

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(local_store::profile_dir)
        .map(|directory| directory.join("sticky-note.json"))
        .map_err(|_| "Attention Hub could not resolve its local sticky-note directory.".into())
}

fn lock(state: &StickyNoteState) -> Result<MutexGuard<'_, ()>, String> {
    state
        .gate
        .lock()
        .map_err(|_| "Sticky-note storage is temporarily unavailable.".into())
}

fn load(app: &AppHandle) -> Result<(PathBuf, Store, bool), String> {
    let note_path = path(app)?;
    match local_store::read(&note_path, SCHEMA_VERSION, valid) {
        Ok(Some(loaded)) => Ok((note_path, loaded.store, loaded.recovered_from_backup)),
        Ok(None) => Ok((note_path, empty(), false)),
        Err(local_store::ReadError::FutureVersion(version)) => Err(format!(
            "Sticky note uses newer schema version {version}; this build will not overwrite it."
        )),
        Err(_) => Err(
            "Sticky-note data could not be read, and no valid local backup is available.".into(),
        ),
    }
}

fn snapshot(store: Store, recovered_from_backup: bool) -> StickyNoteSnapshot {
    StickyNoteSnapshot {
        revision: store.revision,
        text: store.text,
        recovered_from_backup,
    }
}

pub fn get_snapshot(
    app: &AppHandle,
    state: &StickyNoteState,
) -> Result<StickyNoteSnapshot, String> {
    let _guard = lock(state)?;
    let (_, store, recovered) = load(app)?;
    Ok(snapshot(store, recovered))
}

fn update_store(store: &mut Store, text: String, expected_revision: u64) -> Result<bool, String> {
    if text.chars().count() > MAX_NOTE_CHARS {
        return Err(format!(
            "Sticky note must be {MAX_NOTE_CHARS} characters or fewer."
        ));
    }
    if store.revision != expected_revision {
        return Err(
            "Sticky note changed in another window. Reopen it to load the saved text.".into(),
        );
    }
    if store.text == text {
        return Ok(false);
    }
    store.revision = store
        .revision
        .checked_add(1)
        .ok_or_else(|| "Sticky-note revision has reached its supported limit.".to_owned())?;
    store.text = text;
    Ok(true)
}

pub fn save(
    app: &AppHandle,
    state: &StickyNoteState,
    text: String,
    expected_revision: u64,
) -> Result<StickyNoteSnapshot, String> {
    let _guard = lock(state)?;
    let (note_path, mut store, recovered) = load(app)?;
    if update_store(&mut store, text, expected_revision)? {
        local_store::write(&note_path, &store, true, recovered, "Sticky note")?;
    }
    Ok(snapshot(store, false))
}

fn url_candidates(text: &str) -> impl Iterator<Item = &str> {
    text.split_whitespace().filter_map(|part| {
        let start = part.find("https://").or_else(|| part.find("http://"))?;
        let candidate = &part[start..];
        let candidate = candidate.split(['<', '>']).next().unwrap_or(candidate);
        let candidate =
            candidate.trim_end_matches([')', ']', '}', ',', '.', ';', '!', '?', '\'', '"']);
        (!candidate.is_empty()).then_some(candidate)
    })
}

pub fn note_url(
    app: &AppHandle,
    state: &StickyNoteState,
    requested_url: &str,
) -> Result<String, String> {
    let requested = external_url::normalize_url(requested_url, "Sticky-note link")?;
    let _guard = lock(state)?;
    let (_, store, _) = load(app)?;
    let present = url_candidates(&store.text).any(|candidate| {
        external_url::normalize_url(candidate, "Sticky-note link")
            .is_ok_and(|normalized| normalized == requested)
    });
    present
        .then_some(requested)
        .ok_or_else(|| "That link is no longer present in the saved sticky note.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn note_is_bounded_and_revision_guarded() {
        let mut store = empty();
        assert!(update_store(&mut store, "First".into(), 0).unwrap());
        assert_eq!(store.revision, 1);
        assert!(!update_store(&mut store, "First".into(), 1).unwrap());
        assert!(update_store(&mut store, "Stale".into(), 0).is_err());
        assert!(update_store(&mut store, "x".repeat(MAX_NOTE_CHARS + 1), 1).is_err());
    }

    #[test]
    fn url_candidates_match_plain_text_linkification_boundaries() {
        let text = "Brief (https://example.com/one), then http://example.net/two. file:///C:/x";
        assert_eq!(
            url_candidates(text).collect::<Vec<_>>(),
            vec!["https://example.com/one", "http://example.net/two"]
        );
    }
}
