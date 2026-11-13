use crate::model::Score;
use serde::{Deserialize, Serialize};
use std::{fs, sync::Mutex};
use tauri::Manager;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub version: u32,
    pub scores: Vec<Score>,
    pub active_id: String,
    pub settings: serde_json::Value,
}
#[derive(Default)]
pub struct Storage(Mutex<Option<Workspace>>);
impl Storage {
    pub fn close_to_tray(&self) -> bool {
        self.0
            .lock()
            .unwrap()
            .as_ref()
            .and_then(|w| w.settings.get("closeToTray"))
            .and_then(|v| v.as_bool())
            .unwrap_or(true)
    }
}
fn validate(workspace: &Workspace) -> Result<(), String> {
    if workspace.version != 1 || workspace.scores.is_empty() || workspace.scores.len() > 1000 {
        return Err("曲库版本或曲谱数量无效".into());
    }
    for score in &workspace.scores {
        score.compile(0.0)?;
    }
    if !workspace.scores.iter().any(|s| s.id == workspace.active_id) {
        return Err("当前曲谱不存在".into());
    }
    Ok(())
}
#[tauri::command]
pub fn load_workspace(
    app: tauri::AppHandle,
    storage: tauri::State<'_, Storage>,
) -> Result<Option<Workspace>, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("workspace.json");
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&path).map_err(|e| format!("{}：{e}", path.display()))?;
    let workspace: Workspace =
        serde_json::from_slice(&bytes).map_err(|e| format!("{}：{e}", path.display()))?;
    validate(&workspace)?;
    *storage.0.lock().unwrap() = Some(workspace.clone());
    Ok(Some(workspace))
}
#[tauri::command]
pub fn save_workspace(
    app: tauri::AppHandle,
    storage: tauri::State<'_, Storage>,
    workspace: Workspace,
) -> Result<(), String> {
    validate(&workspace)?;
    let mut state = storage.0.lock().unwrap();
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let temp = dir.join("workspace.pending.json");
    let bytes = serde_json::to_vec(&workspace).map_err(|e| e.to_string())?;
    use std::io::Write;
    let mut file = fs::File::create(&temp).map_err(|e| e.to_string())?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    drop(file);
    fs::rename(temp, dir.join("workspace.json")).map_err(|e| e.to_string())?;
    *state = Some(workspace);
    Ok(())
}
