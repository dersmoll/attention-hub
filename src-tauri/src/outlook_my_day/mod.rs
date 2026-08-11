use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(target_os = "windows")]
mod windows_adapter;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum OutlookMyDayProbeStatus {
    Observed,
    Unavailable,
    Busy,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum OutlookMyDayProbeStopReason {
    TopLevel,
    Elements,
    Time,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum OutlookMyDaySourceIdentityState {
    UnverifiedStructureOnly,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlookMyDayProbeLimits {
    pub gate_wait_ms: u64,
    pub scan_ms: u64,
    pub top_level_elements: usize,
    pub outlook_windows: usize,
    pub elements: usize,
    pub depth: usize,
    pub returned_candidates: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SanitizedBounds {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlookMyDayWindowSummary {
    pub index: usize,
    pub bounds: Option<SanitizedBounds>,
    pub visible: bool,
    pub minimized: bool,
    pub offscreen: bool,
    pub element_count: usize,
    pub structural_candidate_count: usize,
    pub right_pane_candidate_count: usize,
    pub english_my_day_marker_count: usize,
    pub english_calendar_marker_count: usize,
    pub selected_english_calendar_marker_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SanitizedControlTypeCount {
    pub control_type_id: i32,
    pub role: String,
    pub count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SanitizedPatternPresence {
    pub invoke: bool,
    pub selection_item: bool,
    pub grid_item: bool,
    pub table_item: bool,
    pub scroll_item: bool,
    pub expand_collapse: bool,
    pub toggle: bool,
    pub value: bool,
    pub text: bool,
    pub legacy_accessible: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SanitizedOutlookElementCandidate {
    pub window_index: usize,
    pub depth: usize,
    pub control_type_id: i32,
    pub role: String,
    pub bounds: SanitizedBounds,
    pub offscreen: bool,
    pub enabled: Option<bool>,
    pub control_element: Option<bool>,
    pub content_element: Option<bool>,
    pub name_length: usize,
    pub localized_control_type_length: usize,
    pub automation_id_length: usize,
    pub class_name_length: usize,
    pub help_text_length: usize,
    pub item_status_length: usize,
    pub item_type_length: usize,
    pub framework_id_length: usize,
    pub aria_role_length: usize,
    pub patterns: SanitizedPatternPresence,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlookMyDayStructureProbe {
    pub status: OutlookMyDayProbeStatus,
    pub captured_at_unix_ms: u64,
    pub structure_available: bool,
    pub semantic_extraction_allowed: bool,
    pub source_identity_state: OutlookMyDaySourceIdentityState,
    pub outlook_window_count: usize,
    pub visible_window_count: usize,
    pub minimized_window_count: usize,
    pub offscreen_window_count: usize,
    pub top_level_element_count: usize,
    pub element_count: usize,
    pub structural_candidate_count: usize,
    pub right_pane_candidate_count: usize,
    pub returned_candidate_count: usize,
    pub english_my_day_marker_count: usize,
    pub english_calendar_marker_count: usize,
    pub selected_english_calendar_marker_count: usize,
    pub property_error_count: usize,
    pub maximum_depth_reached: usize,
    pub depth_limit_reached: bool,
    pub gate_wait_ms: u64,
    pub scan_ms: u64,
    pub stop_reason: Option<OutlookMyDayProbeStopReason>,
    pub limits: OutlookMyDayProbeLimits,
    pub windows: Vec<OutlookMyDayWindowSummary>,
    pub control_types: Vec<SanitizedControlTypeCount>,
    pub candidates: Vec<SanitizedOutlookElementCandidate>,
    pub diagnostics: Vec<String>,
}

impl OutlookMyDayStructureProbe {
    fn failed(status: OutlookMyDayProbeStatus, diagnostic: impl Into<String>) -> Self {
        Self {
            status,
            captured_at_unix_ms: captured_at_unix_ms(),
            structure_available: false,
            semantic_extraction_allowed: false,
            source_identity_state: OutlookMyDaySourceIdentityState::UnverifiedStructureOnly,
            outlook_window_count: 0,
            visible_window_count: 0,
            minimized_window_count: 0,
            offscreen_window_count: 0,
            top_level_element_count: 0,
            element_count: 0,
            structural_candidate_count: 0,
            right_pane_candidate_count: 0,
            returned_candidate_count: 0,
            english_my_day_marker_count: 0,
            english_calendar_marker_count: 0,
            selected_english_calendar_marker_count: 0,
            property_error_count: 0,
            maximum_depth_reached: 0,
            depth_limit_reached: false,
            gate_wait_ms: 0,
            scan_ms: 0,
            stop_reason: None,
            limits: OutlookMyDayProbeLimits {
                gate_wait_ms: 750,
                scan_ms: 2_500,
                top_level_elements: 512,
                outlook_windows: 8,
                elements: 4_000,
                depth: 32,
                returned_candidates: 64,
            },
            windows: Vec::new(),
            control_types: Vec::new(),
            candidates: Vec::new(),
            diagnostics: vec![diagnostic.into()],
        }
    }
}

pub async fn get_structure_probe() -> OutlookMyDayStructureProbe {
    #[cfg(target_os = "windows")]
    {
        match tauri::async_runtime::spawn_blocking(windows_adapter::capture).await {
            Ok(probe) => probe,
            Err(error) => OutlookMyDayStructureProbe::failed(
                OutlookMyDayProbeStatus::Error,
                format!("The Outlook My Day diagnostic worker could not complete: {error}"),
            ),
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        OutlookMyDayStructureProbe::failed(
            OutlookMyDayProbeStatus::Unavailable,
            "The Outlook My Day structure diagnostic is only available on Windows.",
        )
    }
}

pub(super) fn captured_at_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::{OutlookMyDayProbeStatus, OutlookMyDayStructureProbe};

    #[test]
    fn failed_probe_never_enables_semantic_extraction() {
        let probe = OutlookMyDayStructureProbe::failed(
            OutlookMyDayProbeStatus::Unavailable,
            "fixed diagnostic",
        );

        assert!(!probe.structure_available);
        assert!(!probe.semantic_extraction_allowed);
        assert!(probe.candidates.is_empty());
    }
}
