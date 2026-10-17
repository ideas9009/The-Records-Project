use fs2::FileExt;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
use tauri::Manager;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Database {
    pub schema_version: u32,
    pub revision: u64,
    pub documents: Map<String, Value>,
}
fn validate(database: &Database) -> Result<(), String> {
    if database.schema_version != 1 {
        return Err("Unsupported local database version. The file has not been changed.".into());
    }
    for (key, value) in &database.documents {
        let parts: Vec<_> = key.split('/').collect();
        if parts.len() % 2 != 0
            || parts
                .iter()
                .any(|p| p.is_empty() || ["__proto__", "prototype", "constructor"].contains(p))
            || !value.is_object()
        {
            return Err("Invalid local record format. The file has not been changed.".into());
        }
    }
    Ok(())
}
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let directory = path.parent().ok_or("Missing database directory")?;
    let mut temporary = tempfile::NamedTempFile::new_in(directory).map_err(|e| e.to_string())?;
    temporary.write_all(bytes).map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    temporary.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}
fn lock(path: &Path) -> Result<File, String> {
    let parent = path.parent().ok_or("Missing database directory")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path.with_extension("lock"))
        .map_err(|e| e.to_string())?;
    file.lock_exclusive().map_err(|e| e.to_string())?;
    Ok(file)
}
fn read_unlocked(path: &Path) -> Result<Database, String> {
    if !path.exists() {
        let seed: Database = serde_json::from_str(include_str!("../../data/database.seed.json"))
            .map_err(|e| e.to_string())?;
        validate(&seed)?;
        atomic_write(
            path,
            &serde_json::to_vec_pretty(&seed).map_err(|e| e.to_string())?,
        )?;
        return Ok(seed);
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let database:Database=serde_json::from_slice(&bytes).map_err(|e|format!("Cannot read local database: {}. Your file was preserved; check records.backup.json for the previous save.",e))?;
    validate(&database)?;
    Ok(database)
}
pub fn read_at(path: &Path) -> Result<Database, String> {
    let _lock = lock(path)?;
    read_unlocked(path)
}
pub fn commit_at(
    path: &Path,
    expected_revision: u64,
    documents: Map<String, Value>,
) -> Result<Database, String> {
    let _lock = lock(path)?;
    let current = read_unlocked(path)?;
    if current.revision != expected_revision {
        return Err("REVISION_CONFLICT".into());
    }
    let next = Database {
        schema_version: 1,
        revision: current.revision.checked_add(1).ok_or("Revision overflow")?,
        documents,
    };
    validate(&next)?;
    atomic_write(
        &path.with_file_name("records.backup.json"),
        &serde_json::to_vec_pretty(&current).map_err(|e| e.to_string())?,
    )?;
    atomic_write(
        path,
        &serde_json::to_vec_pretty(&next).map_err(|e| e.to_string())?,
    )?;
    Ok(next)
}
fn path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("records.json"))
}
#[tauri::command]
pub fn database_read(app: tauri::AppHandle) -> Result<Database, String> {
    read_at(&path(&app)?)
}
#[tauri::command]
pub fn database_commit(
    app: tauri::AppHandle,
    expected_revision: u64,
    documents: Map<String, Value>,
) -> Result<Database, String> {
    commit_at(&path(&app)?, expected_revision, documents)
}
#[tauri::command]
pub fn database_path(app: tauri::AppHandle) -> Result<String, String> {
    Ok(path(&app)?.display().to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn seeds_fresh_account_and_preserves_changes() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("records.json");
        let mut state = read_at(&p).unwrap();
        assert_eq!(state.documents["users/Sumeitideas"]["balance"], 0);
        state.documents["users/Sumeitideas"]["balance"] = Value::from(75);
        commit_at(&p, 0, state.documents).unwrap();
        assert_eq!(
            read_at(&p).unwrap().documents["users/Sumeitideas"]["balance"],
            75
        );
        let backup: Database =
            serde_json::from_slice(&fs::read(dir.path().join("records.backup.json")).unwrap())
                .unwrap();
        assert_eq!(backup.revision, 0);
    }
    #[test]
    fn refuses_stale_writers() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("records.json");
        let state = read_at(&p).unwrap();
        commit_at(&p, 0, state.documents.clone()).unwrap();
        assert_eq!(
            commit_at(&p, 0, state.documents).unwrap_err(),
            "REVISION_CONFLICT"
        );
        assert_eq!(read_at(&p).unwrap().revision, 1);
    }
    #[test]
    fn preserves_corrupt_files() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("records.json");
        fs::write(&p, b"invalid json").unwrap();
        assert!(read_at(&p).is_err());
        assert_eq!(fs::read(&p).unwrap(), b"invalid json");
    }
    #[test]
    fn rejects_invalid_records_without_writing() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("records.json");
        let mut state = read_at(&p).unwrap();
        state.documents.insert("users".into(), Value::Null);
        assert!(commit_at(&p, 0, state.documents).is_err());
        assert_eq!(read_at(&p).unwrap().revision, 0);
    }
}
