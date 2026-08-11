#[cfg(target_os = "windows")]
mod windows_adapter;

use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TaskbarMirrorSource {
    Teams,
    Telegram,
}

impl TaskbarMirrorSource {
    pub fn key(self) -> &'static str {
        match self {
            Self::Teams => "teams",
            Self::Telegram => "telegram",
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Self::Teams => "Microsoft Teams",
            Self::Telegram => "Telegram",
        }
    }

    pub fn slot_index(self) -> i32 {
        match self {
            Self::Teams => 0,
            Self::Telegram => 1,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskbarMirrorStatus {
    pub source_key: String,
    pub display_name: String,
    pub lifecycle: String,
    pub enabled: bool,
    pub visible: bool,
    pub visual_only: bool,
    pub poll_interval_ms: u32,
    pub diagnostic: Option<String>,
}

impl TaskbarMirrorStatus {
    fn stopped(source: TaskbarMirrorSource) -> Self {
        Self {
            source_key: source.key().into(),
            display_name: source.display_name().into(),
            lifecycle: "stopped".into(),
            enabled: false,
            visible: false,
            visual_only: true,
            poll_interval_ms: 100,
            diagnostic: None,
        }
    }
}

#[cfg(target_os = "windows")]
pub use windows_adapter::{run_manual_probe, TaskbarMirrorState};

#[cfg(not(target_os = "windows"))]
pub struct TaskbarMirrorState;

#[cfg(not(target_os = "windows"))]
impl TaskbarMirrorState {
    pub fn new() -> Self {
        Self
    }

    pub fn status(&self, source: TaskbarMirrorSource) -> TaskbarMirrorStatus {
        TaskbarMirrorStatus {
            lifecycle: "unsupported".into(),
            diagnostic: Some(format!(
                "{} visual mirror is available only on Windows.",
                source.display_name()
            )),
            ..TaskbarMirrorStatus::stopped(source)
        }
    }

    pub fn start(
        &self,
        source: TaskbarMirrorSource,
        _owner: isize,
    ) -> Result<TaskbarMirrorStatus, String> {
        Ok(self.status(source))
    }

    pub fn stop(&self, source: TaskbarMirrorSource) -> TaskbarMirrorStatus {
        self.status(source)
    }

    pub fn stop_all(&self) {}
}

impl Default for TaskbarMirrorState {
    fn default() -> Self {
        Self::new()
    }
}
