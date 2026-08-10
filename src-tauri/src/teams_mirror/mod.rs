#[cfg(target_os = "windows")]
mod windows_adapter;

use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamsMirrorStatus {
    pub lifecycle: String,
    pub enabled: bool,
    pub visible: bool,
    pub visual_only: bool,
    pub poll_interval_ms: u32,
    pub diagnostic: Option<String>,
}

impl TeamsMirrorStatus {
    fn stopped() -> Self {
        Self {
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
pub use windows_adapter::{run_manual_probe, TeamsMirrorState};

#[cfg(not(target_os = "windows"))]
pub struct TeamsMirrorState;

#[cfg(not(target_os = "windows"))]
impl TeamsMirrorState {
    pub fn new() -> Self {
        Self
    }

    pub fn status(&self) -> TeamsMirrorStatus {
        TeamsMirrorStatus {
            lifecycle: "unsupported".into(),
            diagnostic: Some("Teams visual mirror is available only on Windows.".into()),
            ..TeamsMirrorStatus::stopped()
        }
    }

    pub fn start(&self, _owner: isize) -> Result<TeamsMirrorStatus, String> {
        Ok(self.status())
    }

    pub fn stop(&self) -> TeamsMirrorStatus {
        self.status()
    }
}
