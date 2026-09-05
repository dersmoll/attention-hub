use serde::{de::DeserializeOwned, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

pub const MAX_FILE_BYTES: u64 = 4 * 1_024 * 1_024;

#[derive(Debug)]
pub enum ReadError {
    FutureVersion(u64),
    Invalid,
    Unavailable,
}

pub struct Loaded<T> {
    pub store: T,
    pub recovered_from_backup: bool,
}

fn sibling_path(path: &Path, qualifier: &str) -> PathBuf {
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("store");
    let extension = path.extension().and_then(|value| value.to_str());
    let file_name = extension.map_or_else(
        || format!("{stem}.{qualifier}"),
        |extension| format!("{stem}.{qualifier}.{extension}"),
    );
    path.with_file_name(file_name)
}

pub fn backup_path(path: &Path) -> PathBuf {
    sibling_path(path, "backup")
}

/// Pending writes are per-process.
///
/// With one shared name, two processes writing at once both target the same
/// file: the second overwrites the first's bytes, and the first's atomic
/// replace then commits content it never composed while the second is told its
/// write failed. A process-scoped name makes that impossible. The cost is that
/// a crash *during* a write can leave one small orphan behind instead of it
/// being overwritten next time.
pub fn pending_path(path: &Path) -> PathBuf {
    sibling_path(path, &format!("pending-{}", std::process::id()))
}

/// Development builds keep their own data directory.
///
/// Debug and release share a bundle identifier, so without this a dev build
/// reads and writes the same `workspace.json` and `medicine.json` as the
/// installed app — two writers on one store, and test runs mutating real
/// treatments and to-dos.
pub fn profile_dir(base: PathBuf) -> PathBuf {
    if cfg!(debug_assertions) {
        base.join("dev")
    } else {
        base
    }
}

pub fn read_portable<T, F>(path: &Path, schema_version: u32, valid: F) -> Result<T, ReadError>
where
    T: DeserializeOwned,
    F: Fn(&T) -> bool,
{
    read_file(path, schema_version, valid)
}

pub fn write_portable<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let _directory = path
        .parent()
        .filter(|directory| directory.is_dir())
        .ok_or_else(|| "The export destination directory is unavailable.".to_owned())?;
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|_| "Workspace export data could not be serialized.".to_owned())?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("Workspace export has reached its 4 MiB safety limit.".to_owned());
    }

    let pending = sibling_path(path, "export-pending");
    if pending.exists() {
        fs::remove_file(&pending)
            .map_err(|_| "A stale pending workspace export could not be removed.".to_owned())?;
    }
    let result = (|| {
        let mut file = fs::File::create(&pending)
            .map_err(|_| "Workspace could not create the pending export file.".to_owned())?;
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|_| "Workspace could not finish the pending export file.".to_owned())?;
        drop(file);
        replace_file(&pending, path, "Workspace")
    })();
    if result.is_err() && pending.exists() {
        let _ = fs::remove_file(&pending);
    }
    result
}

pub fn read<T, F>(
    path: &Path,
    schema_version: u32,
    valid: F,
) -> Result<Option<Loaded<T>>, ReadError>
where
    T: DeserializeOwned,
    F: Fn(&T) -> bool + Copy,
{
    if !path.exists() {
        let backup = backup_path(path);
        if !backup.exists() {
            return Ok(None);
        }
        return read_file(&backup, schema_version, valid).map(|store| {
            Some(Loaded {
                store,
                recovered_from_backup: true,
            })
        });
    }
    match read_file(path, schema_version, valid) {
        Ok(store) => Ok(Some(Loaded {
            store,
            recovered_from_backup: false,
        })),
        Err(ReadError::FutureVersion(version)) => Err(ReadError::FutureVersion(version)),
        Err(ReadError::Invalid | ReadError::Unavailable) => {
            let backup = backup_path(path);
            read_file(&backup, schema_version, valid).map(|store| {
                Some(Loaded {
                    store,
                    recovered_from_backup: true,
                })
            })
        }
    }
}

pub fn write<T: Serialize>(
    path: &Path,
    store: &T,
    preserve_previous: bool,
    source_recovered_from_backup: bool,
    label: &str,
) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or_else(|| format!("{label} storage path is invalid."))?;
    fs::create_dir_all(directory)
        .map_err(|_| format!("{label} could not create its local data directory."))?;
    let bytes = serde_json::to_vec_pretty(store)
        .map_err(|_| format!("{label} data could not be serialized."))?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err(format!("{label} has reached its 4 MiB safety limit."));
    }
    let pending = pending_path(path);
    let mut file = fs::File::create(&pending)
        .map_err(|_| format!("{label} could not create a pending local write."))?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| format!("{label} could not finish its pending local write."))?;
    drop(file);
    let backup = backup_path(path);
    if preserve_previous && path.exists() && !source_recovered_from_backup {
        fs::copy(path, &backup)
            .map_err(|_| format!("{label} could not update its local backup."))?;
    }
    replace_file(&pending, path, label)?;
    // A destructive write may retire its recovery copy only after its replacement
    // has committed.  Otherwise a failed replacement can turn one write failure
    // into data loss when this store was already running from its backup.
    if !preserve_previous && backup.exists() {
        fs::remove_file(&backup)
            .map_err(|_| format!("{label} could not remove its prior local backup."))?;
    }
    Ok(())
}

fn read_file<T, F>(path: &Path, schema_version: u32, valid: F) -> Result<T, ReadError>
where
    T: DeserializeOwned,
    F: Fn(&T) -> bool,
{
    let metadata = fs::metadata(path).map_err(|_| ReadError::Unavailable)?;
    if metadata.len() > MAX_FILE_BYTES {
        return Err(ReadError::Invalid);
    }
    let value: serde_json::Value =
        serde_json::from_slice(&fs::read(path).map_err(|_| ReadError::Unavailable)?)
            .map_err(|_| ReadError::Invalid)?;
    let version = value
        .get("schemaVersion")
        .and_then(serde_json::Value::as_u64)
        .ok_or(ReadError::Invalid)?;
    if version > u64::from(schema_version) {
        return Err(ReadError::FutureVersion(version));
    }
    if version < u64::from(schema_version) {
        return Err(ReadError::Invalid);
    }
    let store = serde_json::from_value(value).map_err(|_| ReadError::Invalid)?;
    valid(&store).then_some(store).ok_or(ReadError::Invalid)
}

#[cfg(target_os = "windows")]
fn replace_file(pending: &Path, path: &Path, label: &str) -> Result<(), String> {
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
    .map_err(|_| format!("{label} could not atomically commit its pending local write."))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};
    use std::{
        sync::atomic::{AtomicUsize, Ordering},
        time::{SystemTime, UNIX_EPOCH},
    };

    static COUNTER: AtomicUsize = AtomicUsize::new(0);
    #[derive(Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Fixture {
        schema_version: u32,
        value: String,
    }
    fn valid(value: &Fixture) -> bool {
        value.schema_version == 1 && !value.value.is_empty()
    }
    fn test_path(name: &str) -> PathBuf {
        let unique = format!(
            "attention-hub-workspace-store-{name}-{}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        );
        let directory = std::env::temp_dir().join(unique);
        fs::create_dir_all(&directory).unwrap();
        directory.join("workspace.json")
    }

    #[test]
    fn writes_atomically_and_preserves_the_previous_valid_file() {
        let path = test_path("backup");
        write(
            &path,
            &Fixture {
                schema_version: 1,
                value: "first".into(),
            },
            true,
            false,
            "Workspace",
        )
        .unwrap();
        write(
            &path,
            &Fixture {
                schema_version: 1,
                value: "second".into(),
            },
            true,
            false,
            "Workspace",
        )
        .unwrap();
        let current: Fixture = read(&path, 1, valid).unwrap().unwrap().store;
        let backup: Fixture = read(&backup_path(&path), 1, valid).unwrap().unwrap().store;
        assert_eq!(current.value, "second");
        assert_eq!(backup.value, "first");
        assert!(!pending_path(&path).exists());
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn invalid_primary_recovers_from_backup() {
        let path = test_path("recovery");
        write(
            &path,
            &Fixture {
                schema_version: 1,
                value: "safe".into(),
            },
            true,
            false,
            "Workspace",
        )
        .unwrap();
        fs::copy(&path, backup_path(&path)).unwrap();
        fs::write(&path, b"invalid").unwrap();
        let loaded: Fixture = read(&path, 1, valid).unwrap().unwrap().store;
        assert_eq!(loaded.value, "safe");
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn first_write_after_recovery_keeps_the_valid_backup() {
        let path = test_path("recovery-write");
        let safe = Fixture {
            schema_version: 1,
            value: "safe".into(),
        };
        write(&path, &safe, true, false, "Workspace").unwrap();
        fs::copy(&path, backup_path(&path)).unwrap();
        fs::write(&path, b"invalid").unwrap();
        let loaded = read::<Fixture, _>(&path, 1, valid).unwrap().unwrap();
        assert!(loaded.recovered_from_backup);
        write(
            &path,
            &Fixture {
                schema_version: 1,
                value: "repaired".into(),
            },
            true,
            true,
            "Workspace",
        )
        .unwrap();
        let current: Fixture = read(&path, 1, valid).unwrap().unwrap().store;
        let backup: Fixture = read_file(&backup_path(&path), 1, valid).unwrap();
        assert_eq!(current.value, "repaired");
        assert_eq!(backup.value, "safe");
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn missing_primary_recovers_from_a_surviving_backup() {
        let path = test_path("backup-only");
        let backup = backup_path(&path);
        write(
            &path,
            &Fixture {
                schema_version: 1,
                value: "safe".into(),
            },
            true,
            false,
            "Workspace",
        )
        .unwrap();
        fs::copy(&path, &backup).unwrap();
        fs::remove_file(&path).unwrap();
        let loaded = read::<Fixture, _>(&path, 1, valid).unwrap().unwrap();
        assert!(loaded.recovered_from_backup);
        assert_eq!(loaded.store.value, "safe");
        let pending = pending_path(&path);
        let pending_name = pending.file_name().unwrap().to_string_lossy();
        assert!(pending_name.starts_with("workspace.pending-"));
        assert!(pending_name.ends_with(".json"));
        assert!(
            pending_name.contains(&std::process::id().to_string()),
            "pending writes must be scoped to this process: {pending_name}"
        );
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn portable_files_replace_atomically_without_creating_a_backup() {
        let path = test_path("portable").with_file_name("attention-hub-export.json");
        write_portable(
            &path,
            &Fixture {
                schema_version: 1,
                value: "first".into(),
            },
        )
        .unwrap();
        write_portable(
            &path,
            &Fixture {
                schema_version: 1,
                value: "second".into(),
            },
        )
        .unwrap();
        let exported: Fixture = read_portable(&path, 1, valid).unwrap();
        assert_eq!(exported.value, "second");
        assert!(!backup_path(&path).exists());
        assert!(!sibling_path(&path, "export-pending").exists());
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}

#[cfg(not(target_os = "windows"))]
fn replace_file(pending: &Path, path: &Path, label: &str) -> Result<(), String> {
    if path.exists() {
        fs::remove_file(path)
            .map_err(|_| format!("{label} could not replace its local data file."))?;
    }
    fs::rename(pending, path)
        .map_err(|_| format!("{label} could not commit its pending local write."))
}
