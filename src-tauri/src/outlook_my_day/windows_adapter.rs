use std::{
    collections::HashMap,
    path::Path,
    time::{Duration, Instant},
};

use windows::{
    core::{Error as WindowsError, PWSTR},
    Win32::{
        Foundation::{CloseHandle, HANDLE, RECT},
        System::{
            Com::{
                CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
                COINIT_MULTITHREADED,
            },
            Threading::{
                OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
                PROCESS_QUERY_LIMITED_INFORMATION,
            },
        },
        UI::{
            Accessibility::{
                CUIAutomation, IUIAutomation, IUIAutomationElement,
                IUIAutomationSelectionItemPattern, IUIAutomationTreeWalker,
                UIA_ButtonControlTypeId, UIA_CalendarControlTypeId, UIA_CustomControlTypeId,
                UIA_DataItemControlTypeId, UIA_ExpandCollapsePatternId, UIA_GridItemPatternId,
                UIA_GroupControlTypeId, UIA_HyperlinkControlTypeId, UIA_InvokePatternId,
                UIA_LegacyIAccessiblePatternId, UIA_ListControlTypeId, UIA_ListItemControlTypeId,
                UIA_PaneControlTypeId, UIA_ScrollItemPatternId, UIA_SelectionItemPatternId,
                UIA_TabControlTypeId, UIA_TabItemControlTypeId, UIA_TableControlTypeId,
                UIA_TableItemPatternId, UIA_TextControlTypeId, UIA_TextPatternId,
                UIA_TogglePatternId, UIA_TreeItemControlTypeId, UIA_ValuePatternId,
                UIA_WindowControlTypeId, UIA_PATTERN_ID,
            },
            WindowsAndMessaging::{IsIconic, IsWindowVisible},
        },
    },
};

use super::{
    captured_at_unix_ms, OutlookMyDayProbeLimits, OutlookMyDayProbeStatus,
    OutlookMyDayProbeStopReason, OutlookMyDaySourceIdentityState, OutlookMyDayStructureProbe,
    OutlookMyDayWindowSummary, SanitizedBounds, SanitizedControlTypeCount,
    SanitizedOutlookElementCandidate, SanitizedPatternPresence,
};

const OUTLOOK_EXECUTABLE: &str = "olk.exe";
const GATE_WAIT: Duration = Duration::from_millis(750);
const MAX_SCAN: Duration = Duration::from_millis(2_500);
const MAX_TOP_LEVEL_ELEMENTS: usize = 512;
const MAX_OUTLOOK_WINDOWS: usize = 8;
const MAX_ELEMENTS: usize = 4_000;
const MAX_DEPTH: usize = 32;
const MAX_RETURNED_CANDIDATES: usize = 64;

pub(super) fn capture() -> OutlookMyDayStructureProbe {
    let capture_started = Instant::now();
    let Some(_uia_guard) = crate::uia_gate::lock_priority_timeout(GATE_WAIT) else {
        let mut probe = empty_probe();
        probe.status = OutlookMyDayProbeStatus::Busy;
        probe.gate_wait_ms = elapsed_ms(capture_started.elapsed());
        probe.diagnostics.push(
            "The sanitized Outlook My Day probe did not run because another UI Automation traversal remained active. Retry manually."
                .into(),
        );
        return probe;
    };
    let gate_wait_ms = elapsed_ms(capture_started.elapsed());
    let scan_started = Instant::now();

    let result = capture_with_gate(scan_started);
    match result {
        Ok(mut probe) => {
            probe.gate_wait_ms = gate_wait_ms;
            probe.scan_ms = elapsed_ms(scan_started.elapsed());
            finalize(&mut probe);
            probe
        }
        Err(error) => {
            let mut probe = empty_probe();
            probe.status = OutlookMyDayProbeStatus::Error;
            probe.gate_wait_ms = gate_wait_ms;
            probe.scan_ms = elapsed_ms(scan_started.elapsed());
            probe.diagnostics.push(format_windows_error(
                "The sanitized Outlook My Day structure probe failed",
                &error,
            ));
            probe
        }
    }
}

fn capture_with_gate(scan_started: Instant) -> windows::core::Result<OutlookMyDayStructureProbe> {
    let _apartment = ComApartment::initialize()?;
    let automation: IUIAutomation =
        unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)? };
    let raw_walker = unsafe { automation.RawViewWalker()? };
    let control_walker = unsafe { automation.ControlViewWalker()? };
    let desktop = unsafe { automation.GetRootElement()? };
    let mut probe = empty_probe();
    let deadline = scan_started + MAX_SCAN;
    let mut process_cache = HashMap::<u32, bool>::new();
    let mut roots = Vec::<IUIAutomationElement>::new();
    let mut current = unsafe { raw_walker.GetFirstChildElement(&desktop) }.ok();

    while let Some(element) = current {
        if Instant::now() >= deadline {
            probe.stop_reason = Some(OutlookMyDayProbeStopReason::Time);
            break;
        }
        if probe.top_level_element_count >= MAX_TOP_LEVEL_ELEMENTS {
            probe.stop_reason = Some(OutlookMyDayProbeStopReason::TopLevel);
            break;
        }

        probe.top_level_element_count += 1;
        let next = unsafe { raw_walker.GetNextSiblingElement(&element) }.ok();
        let process_id = unsafe { element.CurrentProcessId() }
            .ok()
            .filter(|value| *value > 0)
            .map(|value| value as u32);
        let is_outlook = process_id.is_some_and(|process_id| {
            *process_cache.entry(process_id).or_insert_with(|| {
                process_executable_name(process_id)
                    .map(|name| name.eq_ignore_ascii_case(OUTLOOK_EXECUTABLE))
                    .unwrap_or(false)
            })
        });

        if is_outlook {
            if roots.len() >= MAX_OUTLOOK_WINDOWS {
                probe.stop_reason = Some(OutlookMyDayProbeStopReason::TopLevel);
                break;
            }
            roots.push(element);
        }
        current = next;
    }

    probe.outlook_window_count = roots.len();
    for (window_index, root) in roots.iter().enumerate() {
        if !can_continue(&mut probe, deadline) {
            break;
        }

        let bounds = read_bounds(root, &mut probe.property_error_count);
        let hwnd = unsafe { root.CurrentNativeWindowHandle() }.ok();
        let visible = hwnd.is_some_and(|value| unsafe { IsWindowVisible(value) }.as_bool());
        let minimized = hwnd.is_some_and(|value| unsafe { IsIconic(value) }.as_bool());
        let offscreen = read_bool(
            unsafe { root.CurrentIsOffscreen() },
            &mut probe.property_error_count,
        )
        .unwrap_or(true);

        let mut counters = WindowCounters::default();
        walk_element(
            root,
            &control_walker,
            window_index,
            bounds,
            0,
            deadline,
            &mut counters,
            &mut probe,
        );

        probe.windows.push(OutlookMyDayWindowSummary {
            index: window_index,
            bounds,
            visible,
            minimized,
            offscreen,
            element_count: counters.element_count,
            structural_candidate_count: counters.structural_candidate_count,
            right_pane_candidate_count: counters.right_pane_candidate_count,
            english_my_day_marker_count: counters.english_my_day_marker_count,
            english_calendar_marker_count: counters.english_calendar_marker_count,
            selected_english_calendar_marker_count: counters.selected_english_calendar_marker_count,
        });
    }

    probe.visible_window_count = probe.windows.iter().filter(|window| window.visible).count();
    probe.minimized_window_count = probe
        .windows
        .iter()
        .filter(|window| window.minimized)
        .count();
    probe.offscreen_window_count = probe
        .windows
        .iter()
        .filter(|window| window.offscreen)
        .count();
    probe.returned_candidate_count = probe.candidates.len();
    Ok(probe)
}

#[allow(clippy::too_many_arguments)]
fn walk_element(
    element: &IUIAutomationElement,
    walker: &IUIAutomationTreeWalker,
    window_index: usize,
    window_bounds: Option<SanitizedBounds>,
    depth: usize,
    deadline: Instant,
    counters: &mut WindowCounters,
    probe: &mut OutlookMyDayStructureProbe,
) {
    if !can_continue(probe, deadline) {
        return;
    }

    probe.element_count += 1;
    counters.element_count += 1;
    probe.maximum_depth_reached = probe.maximum_depth_reached.max(depth);

    inspect_element(element, window_index, window_bounds, depth, counters, probe);

    if depth >= MAX_DEPTH {
        probe.depth_limit_reached = true;
        return;
    }

    let mut child = unsafe { walker.GetFirstChildElement(element) }.ok();
    while let Some(current) = child {
        if !can_continue(probe, deadline) {
            return;
        }
        let next = unsafe { walker.GetNextSiblingElement(&current) }.ok();
        walk_element(
            &current,
            walker,
            window_index,
            window_bounds,
            depth + 1,
            deadline,
            counters,
            probe,
        );
        child = next;
    }
}

fn inspect_element(
    element: &IUIAutomationElement,
    window_index: usize,
    window_bounds: Option<SanitizedBounds>,
    depth: usize,
    counters: &mut WindowCounters,
    probe: &mut OutlookMyDayStructureProbe,
) {
    let control_type = match unsafe { element.CurrentControlType() } {
        Ok(value) => value.0,
        Err(_) => {
            probe.property_error_count += 1;
            return;
        }
    };
    increment_control_type(&mut probe.control_types, control_type);

    let name = match unsafe { element.CurrentName() } {
        Ok(value) => value.to_string(),
        Err(_) => {
            probe.property_error_count += 1;
            String::new()
        }
    };
    let trimmed_name = name.trim();
    if trimmed_name.eq_ignore_ascii_case("My Day") {
        probe.english_my_day_marker_count += 1;
        counters.english_my_day_marker_count += 1;
    }
    if trimmed_name.eq_ignore_ascii_case("Calendar") {
        probe.english_calendar_marker_count += 1;
        counters.english_calendar_marker_count += 1;
        if selection_item_is_selected(element) {
            probe.selected_english_calendar_marker_count += 1;
            counters.selected_english_calendar_marker_count += 1;
        }
    }

    let bounds = read_bounds(element, &mut probe.property_error_count);
    let offscreen = read_bool(
        unsafe { element.CurrentIsOffscreen() },
        &mut probe.property_error_count,
    )
    .unwrap_or(true);
    let Some(bounds) = bounds else {
        return;
    };
    if offscreen || trimmed_name.is_empty() || !is_candidate_control_type(control_type) {
        return;
    }

    probe.structural_candidate_count += 1;
    counters.structural_candidate_count += 1;
    if is_in_right_pane(bounds, window_bounds) {
        probe.right_pane_candidate_count += 1;
        counters.right_pane_candidate_count += 1;
    }

    if probe.candidates.len() >= MAX_RETURNED_CANDIDATES {
        return;
    }

    probe.candidates.push(SanitizedOutlookElementCandidate {
        window_index,
        depth,
        control_type_id: control_type,
        role: control_type_role(control_type).into(),
        bounds,
        offscreen,
        enabled: read_bool(
            unsafe { element.CurrentIsEnabled() },
            &mut probe.property_error_count,
        ),
        control_element: read_bool(
            unsafe { element.CurrentIsControlElement() },
            &mut probe.property_error_count,
        ),
        content_element: read_bool(
            unsafe { element.CurrentIsContentElement() },
            &mut probe.property_error_count,
        ),
        name_length: trimmed_name.chars().count(),
        localized_control_type_length: read_string_length(
            unsafe { element.CurrentLocalizedControlType() },
            &mut probe.property_error_count,
        ),
        automation_id_length: read_string_length(
            unsafe { element.CurrentAutomationId() },
            &mut probe.property_error_count,
        ),
        class_name_length: read_string_length(
            unsafe { element.CurrentClassName() },
            &mut probe.property_error_count,
        ),
        help_text_length: read_string_length(
            unsafe { element.CurrentHelpText() },
            &mut probe.property_error_count,
        ),
        item_status_length: read_string_length(
            unsafe { element.CurrentItemStatus() },
            &mut probe.property_error_count,
        ),
        item_type_length: read_string_length(
            unsafe { element.CurrentItemType() },
            &mut probe.property_error_count,
        ),
        framework_id_length: read_string_length(
            unsafe { element.CurrentFrameworkId() },
            &mut probe.property_error_count,
        ),
        aria_role_length: read_string_length(
            unsafe { element.CurrentAriaRole() },
            &mut probe.property_error_count,
        ),
        patterns: pattern_presence(element),
    });
}

fn can_continue(probe: &mut OutlookMyDayStructureProbe, deadline: Instant) -> bool {
    if probe.stop_reason.is_some() {
        return false;
    }
    if probe.element_count >= MAX_ELEMENTS {
        probe.stop_reason = Some(OutlookMyDayProbeStopReason::Elements);
        return false;
    }
    if Instant::now() >= deadline {
        probe.stop_reason = Some(OutlookMyDayProbeStopReason::Time);
        return false;
    }
    true
}

fn selection_item_is_selected(element: &IUIAutomationElement) -> bool {
    unsafe {
        element
            .GetCurrentPatternAs::<IUIAutomationSelectionItemPattern>(UIA_SelectionItemPatternId)
            .and_then(|pattern| pattern.CurrentIsSelected())
            .map(|selected| selected.as_bool())
            .unwrap_or(false)
    }
}

fn pattern_presence(element: &IUIAutomationElement) -> SanitizedPatternPresence {
    SanitizedPatternPresence {
        invoke: has_pattern(element, UIA_InvokePatternId),
        selection_item: has_pattern(element, UIA_SelectionItemPatternId),
        grid_item: has_pattern(element, UIA_GridItemPatternId),
        table_item: has_pattern(element, UIA_TableItemPatternId),
        scroll_item: has_pattern(element, UIA_ScrollItemPatternId),
        expand_collapse: has_pattern(element, UIA_ExpandCollapsePatternId),
        toggle: has_pattern(element, UIA_TogglePatternId),
        value: has_pattern(element, UIA_ValuePatternId),
        text: has_pattern(element, UIA_TextPatternId),
        legacy_accessible: has_pattern(element, UIA_LegacyIAccessiblePatternId),
    }
}

fn has_pattern(element: &IUIAutomationElement, pattern_id: UIA_PATTERN_ID) -> bool {
    unsafe { element.GetCurrentPattern(pattern_id) }.is_ok()
}

fn is_candidate_control_type(control_type: i32) -> bool {
    [
        UIA_ButtonControlTypeId,
        UIA_CalendarControlTypeId,
        UIA_CustomControlTypeId,
        UIA_DataItemControlTypeId,
        UIA_HyperlinkControlTypeId,
        UIA_ListItemControlTypeId,
        UIA_TabItemControlTypeId,
        UIA_TreeItemControlTypeId,
    ]
    .iter()
    .any(|value| value.0 == control_type)
}

fn control_type_role(control_type: i32) -> &'static str {
    if control_type == UIA_ButtonControlTypeId.0 {
        "button"
    } else if control_type == UIA_CalendarControlTypeId.0 {
        "calendar"
    } else if control_type == UIA_CustomControlTypeId.0 {
        "custom"
    } else if control_type == UIA_DataItemControlTypeId.0 {
        "dataItem"
    } else if control_type == UIA_GroupControlTypeId.0 {
        "group"
    } else if control_type == UIA_HyperlinkControlTypeId.0 {
        "hyperlink"
    } else if control_type == UIA_ListControlTypeId.0 {
        "list"
    } else if control_type == UIA_ListItemControlTypeId.0 {
        "listItem"
    } else if control_type == UIA_PaneControlTypeId.0 {
        "pane"
    } else if control_type == UIA_TabControlTypeId.0 {
        "tab"
    } else if control_type == UIA_TabItemControlTypeId.0 {
        "tabItem"
    } else if control_type == UIA_TableControlTypeId.0 {
        "table"
    } else if control_type == UIA_TextControlTypeId.0 {
        "text"
    } else if control_type == UIA_TreeItemControlTypeId.0 {
        "treeItem"
    } else if control_type == UIA_WindowControlTypeId.0 {
        "window"
    } else {
        "other"
    }
}

fn is_in_right_pane(bounds: SanitizedBounds, window: Option<SanitizedBounds>) -> bool {
    let Some(window) = window else {
        return false;
    };
    let width = window.right.saturating_sub(window.left);
    if width <= 0 {
        return false;
    }
    let threshold = window.left.saturating_add(width.saturating_mul(55) / 100);
    let center = bounds.left.saturating_add(bounds.right) / 2;
    center >= threshold
        && bounds.left >= window.left
        && bounds.right <= window.right
        && bounds.top >= window.top
        && bounds.bottom <= window.bottom
}

fn read_bounds(
    element: &IUIAutomationElement,
    property_error_count: &mut usize,
) -> Option<SanitizedBounds> {
    match unsafe { element.CurrentBoundingRectangle() } {
        Ok(RECT {
            left,
            top,
            right,
            bottom,
        }) if right > left && bottom > top => Some(SanitizedBounds {
            left,
            top,
            right,
            bottom,
        }),
        Ok(_) => None,
        Err(_) => {
            *property_error_count += 1;
            None
        }
    }
}

fn read_bool(
    value: windows::core::Result<windows::core::BOOL>,
    property_error_count: &mut usize,
) -> Option<bool> {
    match value {
        Ok(value) => Some(value.as_bool()),
        Err(_) => {
            *property_error_count += 1;
            None
        }
    }
}

fn read_string_length(
    value: windows::core::Result<windows::core::BSTR>,
    property_error_count: &mut usize,
) -> usize {
    match value {
        Ok(value) => value.to_string().chars().count(),
        Err(_) => {
            *property_error_count += 1;
            0
        }
    }
}

fn increment_control_type(control_types: &mut Vec<SanitizedControlTypeCount>, control_type: i32) {
    if let Some(summary) = control_types
        .iter_mut()
        .find(|summary| summary.control_type_id == control_type)
    {
        summary.count += 1;
    } else {
        control_types.push(SanitizedControlTypeCount {
            control_type_id: control_type,
            role: control_type_role(control_type).into(),
            count: 1,
        });
        control_types.sort_by_key(|summary| summary.control_type_id);
    }
}

fn finalize(probe: &mut OutlookMyDayStructureProbe) {
    let complete = probe.stop_reason.is_none() && !probe.depth_limit_reached;
    probe.structure_available = complete
        && probe.english_my_day_marker_count > 0
        && probe.english_calendar_marker_count > 0
        && probe.right_pane_candidate_count > 0;
    probe.status = if probe.structure_available {
        OutlookMyDayProbeStatus::Observed
    } else {
        OutlookMyDayProbeStatus::Unavailable
    };

    if probe.outlook_window_count == 0 {
        probe.diagnostics.push(
            "No accessible New Outlook top-level window was found. The diagnostic does not launch or focus Outlook."
                .into(),
        );
    } else if probe.stop_reason.is_some() || probe.depth_limit_reached {
        probe.diagnostics.push(
            "The accessibility scan reached a traversal bound, so event structure is unavailable rather than inferred from a partial tree."
                .into(),
        );
    } else if probe.english_my_day_marker_count == 0 {
        probe.diagnostics.push(
            "No English My Day marker was present in the fresh accessibility tree. My Day is closed, unloaded, localized differently, or not exposed."
                .into(),
        );
    } else if probe.english_calendar_marker_count == 0 {
        probe.diagnostics.push(
            "My Day was detected, but no English Calendar marker was exposed. Calendar event structure is unavailable."
                .into(),
        );
    } else if probe.right_pane_candidate_count == 0 {
        probe.diagnostics.push(
            "My Day Calendar markers were detected, but no bounded right-pane structural candidates were exposed."
                .into(),
        );
    } else {
        probe.diagnostics.push(
            "Fresh sanitized My Day Calendar structure was observed. Semantic extraction remains disabled until passive-state and source-identity gates pass."
                .into(),
        );
        if probe.selected_english_calendar_marker_count == 0 {
            probe.diagnostics.push(
                "The English Calendar marker did not expose a selected SelectionItem state; view selection must be distinguished by the manual state matrix before any semantic phase."
                    .into(),
            );
        }
    }

    probe.diagnostics.push(
        "The structure probe emits no accessibility labels, subjects, accounts, attendees, locations, or URLs. English marker checks are diagnostic-only and expose counts, not label text."
            .into(),
    );
}

fn empty_probe() -> OutlookMyDayStructureProbe {
    OutlookMyDayStructureProbe {
        status: OutlookMyDayProbeStatus::Unavailable,
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
            gate_wait_ms: elapsed_ms(GATE_WAIT),
            scan_ms: elapsed_ms(MAX_SCAN),
            top_level_elements: MAX_TOP_LEVEL_ELEMENTS,
            outlook_windows: MAX_OUTLOOK_WINDOWS,
            elements: MAX_ELEMENTS,
            depth: MAX_DEPTH,
            returned_candidates: MAX_RETURNED_CANDIDATES,
        },
        windows: Vec::new(),
        control_types: Vec::new(),
        candidates: Vec::new(),
        diagnostics: Vec::new(),
    }
}

fn process_executable_name(process_id: u32) -> windows::core::Result<String> {
    let handle = ProcessHandle(unsafe {
        OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id)?
    });
    let mut buffer = vec![0u16; 32_768];
    let mut length = buffer.len() as u32;
    unsafe {
        QueryFullProcessImageNameW(
            handle.0,
            PROCESS_NAME_WIN32,
            PWSTR(buffer.as_mut_ptr()),
            &mut length,
        )?;
    }
    let path = String::from_utf16_lossy(&buffer[..length as usize]);
    Ok(Path::new(&path)
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or(path))
}

fn format_windows_error(context: &str, error: &WindowsError) -> String {
    format!("{context}: HRESULT 0x{:08X}", error.code().0 as u32)
}

fn elapsed_ms(duration: Duration) -> u64 {
    duration.as_millis().min(u128::from(u64::MAX)) as u64
}

#[derive(Default)]
struct WindowCounters {
    element_count: usize,
    structural_candidate_count: usize,
    right_pane_candidate_count: usize,
    english_my_day_marker_count: usize,
    english_calendar_marker_count: usize,
    selected_english_calendar_marker_count: usize,
}

struct ComApartment;

impl ComApartment {
    fn initialize() -> windows::core::Result<Self> {
        unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok()? };
        Ok(Self)
    }
}

impl Drop for ComApartment {
    fn drop(&mut self) {
        unsafe { CoUninitialize() };
    }
}

struct ProcessHandle(HANDLE);

impl Drop for ProcessHandle {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}
