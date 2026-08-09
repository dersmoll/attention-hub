use std::{collections::BTreeSet, path::Path};

use windows::{
    core::{Error as WindowsError, PWSTR},
    Win32::{
        Foundation::{CloseHandle, HANDLE, RECT, SYSTEMTIME},
        System::{
            Com::{
                CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
                COINIT_MULTITHREADED,
            },
            SystemInformation::GetSystemTime,
            Threading::{
                OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
                PROCESS_QUERY_LIMITED_INFORMATION,
            },
        },
        UI::Accessibility::{
            CUIAutomation, IUIAutomation, IUIAutomationElement, TreeScope_Children,
            TreeScope_Descendants, UIA_ExpandCollapsePatternId, UIA_GridItemPatternId,
            UIA_InvokePatternId, UIA_SelectionItemPatternId, UIA_TextPatternId,
            UIA_TogglePatternId, UIA_ValuePatternId,
        },
    },
};

use super::{
    TeamsAccessibilityBounds, TeamsAccessibilityCandidate, TeamsAccessibilityProbeSnapshot,
};

const TEAMS_EXECUTABLES: [&str; 2] = ["ms-teams.exe", "teams.exe"];
const MAX_RETURNED_CANDIDATES: usize = 500;
const ATTENTION_KEYWORDS: [&str; 8] = [
    "unread",
    "activity",
    "mention",
    "mentions",
    "badge",
    "notification",
    "notifications",
    "new",
];
const STRUCTURAL_KEYWORDS: [&str; 11] = [
    "chat",
    "chats",
    "channel",
    "channels",
    "quick",
    "view",
    "views",
    "favorite",
    "favorites",
    "followed",
    "muted",
];
const SHORTCUT_KEYWORDS: [&str; 8] = [
    "ctrl", "control", "alt", "shift", "command", "cmd", "shortcut", "key",
];

pub fn get_probe() -> TeamsAccessibilityProbeSnapshot {
    let captured_at = current_time_iso8601();
    let mut snapshot = TeamsAccessibilityProbeSnapshot {
        captured_at,
        process_found: false,
        windows_scanned: 0,
        elements_scanned: 0,
        total_candidates: 0,
        candidates_truncated: false,
        candidates: Vec::new(),
        diagnostics: Vec::new(),
    };

    if let Err(error) = capture_probe(&mut snapshot) {
        snapshot.diagnostics.push(format_windows_error(
            "Could not capture the Teams accessibility probe",
            &error,
        ));
    }

    snapshot
}

fn capture_probe(snapshot: &mut TeamsAccessibilityProbeSnapshot) -> windows::core::Result<()> {
    let _apartment = ComApartment::initialize()?;
    let automation: IUIAutomation =
        unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)? };
    let condition = unsafe { automation.CreateTrueCondition()? };
    let desktop = unsafe { automation.GetRootElement()? };
    let windows = unsafe { desktop.FindAll(TreeScope_Children, &condition)? };
    let length = unsafe { windows.Length()? };
    let mut ranked_candidates = Vec::new();

    for index in 0..length {
        let element = match unsafe { windows.GetElement(index) } {
            Ok(element) => element,
            Err(_) => continue,
        };
        let process_id = match unsafe { element.CurrentProcessId() } {
            Ok(process_id) if process_id > 0 => process_id as u32,
            _ => continue,
        };
        let executable_name = match process_executable_name(process_id) {
            Ok(executable_name) => executable_name,
            Err(_) => continue,
        };

        if !TEAMS_EXECUTABLES
            .iter()
            .any(|candidate| executable_name.eq_ignore_ascii_case(candidate))
        {
            continue;
        }

        snapshot.process_found = true;
        snapshot.windows_scanned = snapshot.windows_scanned.saturating_add(1);
        inspect_element(&element, snapshot, &mut ranked_candidates);

        let descendants = match unsafe { element.FindAll(TreeScope_Descendants, &condition) } {
            Ok(descendants) => descendants,
            Err(error) => {
                snapshot.diagnostics.push(format_windows_error(
                    "A Teams window accessibility tree could not be traversed",
                    &error,
                ));
                continue;
            }
        };
        let descendant_count = match unsafe { descendants.Length() } {
            Ok(descendant_count) => descendant_count,
            Err(error) => {
                snapshot.diagnostics.push(format_windows_error(
                    "A Teams accessibility result could not be counted",
                    &error,
                ));
                continue;
            }
        };

        for descendant_index in 0..descendant_count {
            let descendant = match unsafe { descendants.GetElement(descendant_index) } {
                Ok(descendant) => descendant,
                Err(_) => continue,
            };
            inspect_element(&descendant, snapshot, &mut ranked_candidates);
        }
    }

    if !snapshot.process_found {
        snapshot
            .diagnostics
            .push("Microsoft Teams is not running with an accessible top-level window.".into());
        return Ok(());
    }

    ranked_candidates.sort_by_key(|(rank, _)| *rank);
    snapshot.total_candidates = ranked_candidates.len().try_into().unwrap_or(u32::MAX);
    snapshot.candidates_truncated = ranked_candidates.len() > MAX_RETURNED_CANDIDATES;
    snapshot.candidates = ranked_candidates
        .into_iter()
        .take(MAX_RETURNED_CANDIDATES)
        .map(|(_, candidate)| candidate)
        .collect();

    if snapshot.candidates.is_empty() {
        snapshot.diagnostics.push(
            "No sanitized Teams accessibility candidates matched the bounded probe rules.".into(),
        );
    }

    Ok(())
}

fn inspect_element(
    element: &IUIAutomationElement,
    snapshot: &mut TeamsAccessibilityProbeSnapshot,
    candidates: &mut Vec<(u8, TeamsAccessibilityCandidate)>,
) {
    snapshot.elements_scanned = snapshot.elements_scanned.saturating_add(1);

    let control_type = unsafe { element.CurrentControlType() }
        .map(|value| value.0)
        .unwrap_or_default();
    let is_offscreen = unsafe { element.CurrentIsOffscreen() }
        .ok()
        .map(|value| value.as_bool());
    let bounds = unsafe { element.CurrentBoundingRectangle() }
        .ok()
        .and_then(bounds_from_rect);
    let automation_id_length = unsafe { element.CurrentAutomationId() }
        .ok()
        .map(|value| value.to_string().chars().count())
        .unwrap_or_default();
    let patterns = available_patterns(element);

    let properties = [
        ("name", unsafe { element.CurrentName() }.ok()),
        ("helpText", unsafe { element.CurrentHelpText() }.ok()),
        ("itemStatus", unsafe { element.CurrentItemStatus() }.ok()),
        (
            "ariaProperties",
            unsafe { element.CurrentAriaProperties() }.ok(),
        ),
    ];

    for (property, value) in properties {
        let Some(value) = value else {
            continue;
        };
        let value = value.to_string();
        let Some((rank, analysis)) = analyze_property(property, &value) else {
            continue;
        };

        candidates.push((
            rank,
            TeamsAccessibilityCandidate {
                property: property.into(),
                relevance: analysis.relevance,
                matched_keywords: analysis.matched_keywords,
                numeric_tokens: analysis.numeric_tokens,
                aria_keys: analysis.aria_keys,
                value_length: value.chars().count().try_into().unwrap_or(u32::MAX),
                automation_id_present: automation_id_length > 0,
                automation_id_length: automation_id_length.try_into().unwrap_or(u32::MAX),
                control_type,
                is_offscreen,
                bounds: bounds.clone(),
                patterns: patterns.clone(),
            },
        ));
    }
}

struct PropertyAnalysis {
    relevance: String,
    matched_keywords: Vec<String>,
    numeric_tokens: Vec<u32>,
    aria_keys: Vec<String>,
}

fn analyze_property(property: &str, value: &str) -> Option<(u8, PropertyAnalysis)> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }

    let lowercase = value.to_lowercase();
    let tokens = lowercase
        .split(|character: char| !character.is_alphanumeric())
        .filter(|token| !token.is_empty())
        .collect::<Vec<_>>();
    let matched_keywords = ATTENTION_KEYWORDS
        .iter()
        .chain(STRUCTURAL_KEYWORDS.iter())
        .filter(|keyword| tokens.iter().any(|token| *token == **keyword))
        .map(|keyword| (*keyword).to_owned())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    let attention_positions = tokens
        .iter()
        .enumerate()
        .filter(|(_, token)| ATTENTION_KEYWORDS.contains(token))
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    let structural_positions = tokens
        .iter()
        .enumerate()
        .filter(|(_, token)| STRUCTURAL_KEYWORDS.contains(token))
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    let shortcut_positions = tokens
        .iter()
        .enumerate()
        .filter(|(_, token)| SHORTCUT_KEYWORDS.contains(token))
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    let purely_numeric = tokens.len() == 1
        && tokens
            .first()
            .is_some_and(|token| token.chars().all(|character| character.is_ascii_digit()));
    let numeric_tokens = tokens
        .iter()
        .enumerate()
        .filter(|(index, token)| {
            token.chars().all(|character| character.is_ascii_digit())
                && !shortcut_positions
                    .iter()
                    .any(|shortcut_index| index.abs_diff(*shortcut_index) <= 1)
                && (purely_numeric
                    || attention_positions
                        .iter()
                        .chain(structural_positions.iter())
                        .any(|keyword_index| index.abs_diff(*keyword_index) <= 2))
        })
        .filter_map(|(_, token)| token.parse::<u32>().ok())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    let aria_keys = if property == "ariaProperties" {
        extract_aria_keys(value)
    } else {
        Vec::new()
    };
    let has_attention_keyword = matched_keywords
        .iter()
        .any(|keyword| ATTENTION_KEYWORDS.contains(&keyword.as_str()));

    let (rank, relevance) = if has_attention_keyword {
        (0, "attention")
    } else if !numeric_tokens.is_empty() {
        (1, "numeric")
    } else if !matched_keywords.is_empty() || !aria_keys.is_empty() {
        (2, "structural")
    } else {
        return None;
    };

    Some((
        rank,
        PropertyAnalysis {
            relevance: relevance.into(),
            matched_keywords,
            numeric_tokens,
            aria_keys,
        },
    ))
}

fn extract_aria_keys(value: &str) -> Vec<String> {
    value
        .split(';')
        .filter_map(|property| property.split_once('=').map(|(key, _)| key.trim()))
        .filter(|key| {
            !key.is_empty()
                && key.chars().all(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | ':')
                })
        })
        .map(str::to_ascii_lowercase)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn available_patterns(element: &IUIAutomationElement) -> Vec<String> {
    [
        ("expandCollapse", UIA_ExpandCollapsePatternId),
        ("gridItem", UIA_GridItemPatternId),
        ("invoke", UIA_InvokePatternId),
        ("selectionItem", UIA_SelectionItemPatternId),
        ("text", UIA_TextPatternId),
        ("toggle", UIA_TogglePatternId),
        ("value", UIA_ValuePatternId),
    ]
    .into_iter()
    .filter(|(_, pattern)| unsafe { element.GetCurrentPattern(*pattern) }.is_ok())
    .map(|(name, _)| name.into())
    .collect()
}

fn bounds_from_rect(rect: RECT) -> Option<TeamsAccessibilityBounds> {
    let width = rect.right.saturating_sub(rect.left);
    let height = rect.bottom.saturating_sub(rect.top);
    (width > 0 && height > 0).then_some(TeamsAccessibilityBounds {
        left: rect.left,
        top: rect.top,
        width,
        height,
    })
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

fn current_time_iso8601() -> String {
    format_system_time(unsafe { GetSystemTime() })
}

fn format_system_time(system_time: SYSTEMTIME) -> String {
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        system_time.wYear,
        system_time.wMonth,
        system_time.wDay,
        system_time.wHour,
        system_time.wMinute,
        system_time.wSecond,
        system_time.wMilliseconds,
    )
}

fn format_windows_error(context: &str, error: &WindowsError) -> String {
    format!(
        "{context}: HRESULT 0x{:08X}: {}",
        error.code().0 as u32,
        error.message()
    )
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

#[cfg(test)]
mod tests {
    use super::{analyze_property, extract_aria_keys};

    #[test]
    fn keeps_only_sanitized_attention_metadata() {
        let (_, analysis) =
            analyze_property("name", "Chat with Private Person, 3 unread notifications")
                .expect("expected a candidate");

        assert_eq!(analysis.numeric_tokens, vec![3]);
        assert!(analysis.matched_keywords.contains(&"chat".into()));
        assert!(analysis.matched_keywords.contains(&"unread".into()));
        assert!(analysis.matched_keywords.contains(&"notifications".into()));
    }

    #[test]
    fn ignores_unrelated_numbers_without_a_structural_marker() {
        assert!(analyze_property("name", "Private project 2026").is_none());
    }

    #[test]
    fn excludes_keyboard_shortcut_digits() {
        let (_, activity) = analyze_property("name", "Activity (Ctrl+1)")
            .expect("activity remains useful structural evidence");
        let (_, chat) = analyze_property("name", "Chat (Ctrl+2)")
            .expect("chat remains useful structural evidence");

        assert!(activity.numeric_tokens.is_empty());
        assert!(chat.numeric_tokens.is_empty());
    }

    #[test]
    fn keeps_attention_count_when_the_same_digit_also_appears_in_a_shortcut() {
        let (_, analysis) = analyze_property("name", "Activity, 1 unread notification (Ctrl+1)")
            .expect("expected an attention candidate");

        assert_eq!(analysis.numeric_tokens, vec![1]);
    }

    #[test]
    fn extracts_only_aria_property_keys() {
        assert_eq!(
            extract_aria_keys("level=2; posinset=1;label=Private Person"),
            vec!["label", "level", "posinset"]
        );
    }
}
