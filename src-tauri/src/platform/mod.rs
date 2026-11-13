use crate::model::{Combo, InputMode, Target};
use serde::Serialize;

pub trait InputSink: Send {
    fn check(&mut self, foreground_required: bool) -> Result<(), String>;
    fn press(&mut self, combo: &Combo) -> Result<(), String>;
    fn release_all(&mut self) -> Result<(), String>;
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Permissions {
    pub platform: String,
    pub accessibility: bool,
    pub input_monitoring: bool,
    pub message: String,
}

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::{connect, list_targets, permissions};
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::{connect, list_targets, permissions};

#[cfg(not(any(windows, target_os = "macos")))]
pub fn list_targets() -> Result<Vec<Target>, String> {
    Ok(vec![])
}
#[cfg(not(any(windows, target_os = "macos")))]
pub fn connect(_: Target, _: InputMode) -> Result<Box<dyn InputSink>, String> {
    Err("当前系统不支持游戏输入".into())
}
#[cfg(not(any(windows, target_os = "macos")))]
pub fn permissions(_: bool) -> Permissions {
    Permissions {
        platform: "unsupported".into(),
        accessibility: false,
        input_monitoring: false,
        message: "支持 Windows 与 macOS 桌面演奏".into(),
    }
}
