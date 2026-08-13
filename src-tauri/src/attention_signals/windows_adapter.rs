use std::{collections::HashSet, path::Path};

use windows::{
    core::{w, Error as WindowsError, PCWSTR, PWSTR},
    Win32::{
        Foundation::{CloseHandle, HANDLE, SYSTEMTIME},
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
        UI::{
            Accessibility::{
                CUIAutomation, IUIAutomation, IUIAutomationElement, TreeScope_Children,
                TreeScope_Descendants,
            },
            WindowsAndMessaging::FindWindowW,
        },
    },
};

use super::{
    source_is_selected, AttentionSignal, AttentionSignalSnapshot, AttentionSourceObservation,
    AttentionSourceState,
};

const TELEGRAM_EXECUTABLE: &str = "telegram.exe";
const OUTLOOK_EXECUTABLE: &str = "olk.exe";
const NOTIFICATION_AREA_AUTOMATION_ID: &str = "NotifyItemIcon";

pub fn get_snapshot(source_keys: &[String]) -> AttentionSignalSnapshot {
    if source_keys.is_empty() {
        return AttentionSignalSnapshot {
            captured_at: current_time_iso8601(),
            sources: Vec::new(),
            signals: Vec::new(),
            diagnostics: Vec::new(),
        };
    }
    let _uia_guard = crate::uia_gate::lock_background();
    let captured_at = current_time_iso8601();
    let mut diagnostics = Vec::new();

    let sources = match capture_sources(source_keys) {
        Ok(sources) => sources,
        Err(error) => {
            let diagnostic = format_windows_error(
                "Could not initialize persistent attention-signal capture",
                &error,
            );
            diagnostics.push(diagnostic.clone());
            error_sources(source_keys, diagnostic)
        }
    };
    diagnostics.extend(
        sources
            .iter()
            .flat_map(|source| source.diagnostics.iter().cloned()),
    );
    diagnostics.sort();
    diagnostics.dedup();
    let signals = sources
        .iter()
        .flat_map(|source| source.signals.iter().cloned())
        .collect();

    AttentionSignalSnapshot {
        captured_at,
        sources,
        signals,
        diagnostics,
    }
}

fn capture_sources(
    source_keys: &[String],
) -> windows::core::Result<Vec<AttentionSourceObservation>> {
    let _apartment = ComApartment::initialize()?;
    let automation: IUIAutomation =
        unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)? };
    let mut sources = Vec::with_capacity(3);

    if source_is_selected(source_keys, "telegram") {
        record_source_capture(&mut sources, "telegram", "Telegram", || {
            capture_telegram(&automation)
        });
    }
    if source_is_selected(source_keys, "outlook") {
        record_source_capture(&mut sources, "outlook", "Microsoft Outlook", || {
            capture_outlook(&automation)
        });
    }
    if source_is_selected(source_keys, "teams") {
        record_source_capture(&mut sources, "teams", "Microsoft Teams", || {
            capture_notification_area(&automation)
        });
    }

    Ok(sources)
}

fn record_source_capture(
    sources: &mut Vec<AttentionSourceObservation>,
    source_key: &str,
    display_name: &str,
    capture: impl FnOnce() -> windows::core::Result<AttentionSourceObservation>,
) {
    match capture() {
        Ok(source) => sources.push(source),
        Err(error) => sources.push(AttentionSourceObservation {
            source_key: source_key.into(),
            display_name: display_name.into(),
            state: AttentionSourceState::Error,
            signals: Vec::new(),
            diagnostics: vec![format_windows_error(
                &format!("Could not capture {display_name} attention state"),
                &error,
            )],
        }),
    }
}

fn error_sources(source_keys: &[String], diagnostic: String) -> Vec<AttentionSourceObservation> {
    [
        ("telegram", "Telegram"),
        ("outlook", "Microsoft Outlook"),
        ("teams", "Microsoft Teams"),
    ]
    .into_iter()
    .filter(|(source_key, _)| source_is_selected(source_keys, source_key))
    .map(|(source_key, display_name)| AttentionSourceObservation {
        source_key: source_key.into(),
        display_name: display_name.into(),
        state: AttentionSourceState::Error,
        signals: Vec::new(),
        diagnostics: vec![diagnostic.clone()],
    })
    .collect()
}

fn capture_outlook(
    automation: &IUIAutomation,
) -> windows::core::Result<AttentionSourceObservation> {
    let condition = unsafe { automation.CreateTrueCondition()? };
    let desktop = unsafe { automation.GetRootElement()? };
    let windows = unsafe { desktop.FindAll(TreeScope_Children, &condition)? };
    let length = unsafe { windows.Length()? };
    let mut outlook_roots = Vec::new();

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

        if executable_name.eq_ignore_ascii_case(OUTLOOK_EXECUTABLE) {
            outlook_roots.push(element);
        }
    }

    if outlook_roots.is_empty() {
        return Ok(AttentionSourceObservation {
            source_key: "outlook".into(),
            display_name: "Microsoft Outlook".into(),
            state: AttentionSourceState::NotRunning,
            signals: Vec::new(),
            diagnostics: vec![
                "New Outlook is not running with an accessible top-level window.".into(),
            ],
        });
    }

    let mut inbox_labels = HashSet::new();
    for outlook_root in outlook_roots {
        let descendants = unsafe { outlook_root.FindAll(TreeScope_Descendants, &condition)? };
        let length = unsafe { descendants.Length()? };

        for index in 0..length {
            let element = match unsafe { descendants.GetElement(index) } {
                Ok(element) => element,
                Err(_) => continue,
            };
            let name = match element_name(&element) {
                Ok(name) => name.trim().to_owned(),
                Err(_) => continue,
            };

            if is_outlook_inbox_label(&name) {
                inbox_labels.insert(name);
            }
        }
    }

    if inbox_labels.is_empty() {
        return Ok(AttentionSourceObservation {
            source_key: "outlook".into(),
            display_name: "Microsoft Outlook".into(),
            state: AttentionSourceState::NotExposed,
            signals: Vec::new(),
            diagnostics: vec![
                "New Outlook is running, but no English Inbox accessibility label was found."
                    .into(),
            ],
        });
    }

    let explicit_counts = inbox_labels
        .iter()
        .filter_map(|label| parse_outlook_inbox_unread(label))
        .collect::<Vec<_>>();
    let count = explicit_counts
        .iter()
        .copied()
        .fold(0_u32, u32::saturating_add);
    let inferred = explicit_counts.is_empty();

    Ok(AttentionSourceObservation {
        source_key: "outlook".into(),
        display_name: "Microsoft Outlook".into(),
        state: AttentionSourceState::Observed,
        signals: vec![AttentionSignal {
            source_key: "outlook".into(),
            display_name: "Microsoft Outlook".into(),
            kind: "inboxUnread".into(),
            count: Some(count),
            needs_attention: Some(count > 0),
            origin: "applicationUiAutomation".into(),
            raw_label: Some(format!(
                "{} accessible Inbox label(s); {} with an explicit unread count",
                inbox_labels.len(),
                explicit_counts.len()
            )),
            confidence: "medium".into(),
            inferred,
            meaning: if inferred {
                "No explicit unread count was present in the observed English Inbox labels, so the current Inbox unread count is inferred as zero."
                    .into()
            } else {
                "Sum of explicit unread counts in unique English Inbox accessibility labels; account names and message content are not exposed."
                    .into()
            },
            diagnostics: Vec::new(),
        }],
        diagnostics: Vec::new(),
    })
}

fn capture_telegram(
    automation: &IUIAutomation,
) -> windows::core::Result<AttentionSourceObservation> {
    let condition = unsafe { automation.CreateTrueCondition()? };
    let root = unsafe { automation.GetRootElement()? };
    let windows = unsafe { root.FindAll(TreeScope_Children, &condition)? };
    let length = unsafe { windows.Length()? };
    let mut telegram_roots = Vec::new();
    let mut title_counter = None;

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

        if !executable_name.eq_ignore_ascii_case(TELEGRAM_EXECUTABLE) {
            continue;
        }

        let title = element_name(&element).unwrap_or_default();
        if let Some(count) = parse_trailing_parenthesized_count(&title) {
            title_counter = Some(count);
        }

        telegram_roots.push(element);
    }

    if telegram_roots.is_empty() {
        return Ok(AttentionSourceObservation {
            source_key: "telegram".into(),
            display_name: "Telegram".into(),
            state: AttentionSourceState::NotRunning,
            signals: Vec::new(),
            diagnostics: vec![
                "Telegram is not running with an accessible top-level window.".into(),
            ],
        });
    }

    let mut unread_chats = None;
    let mut unread_chats_label = None;
    for telegram_root in telegram_roots {
        let descendants = unsafe { telegram_root.FindAll(TreeScope_Descendants, &condition)? };
        let length = unsafe { descendants.Length()? };

        for index in 0..length {
            let element = match unsafe { descendants.GetElement(index) } {
                Ok(element) => element,
                Err(_) => continue,
            };
            let name = match element_name(&element) {
                Ok(name) => name,
                Err(_) => continue,
            };

            if let Some(count) = parse_telegram_unread_chats(&name) {
                unread_chats = Some(count);
                unread_chats_label = Some(name);
                break;
            }
        }

        if unread_chats.is_some() {
            break;
        }
    }

    let application_count = title_counter.unwrap_or(0);
    let unread_chat_count = unread_chats.unwrap_or(0);
    Ok(AttentionSourceObservation {
        source_key: "telegram".into(),
        display_name: "Telegram".into(),
        state: AttentionSourceState::Observed,
        signals: vec![
            AttentionSignal {
                source_key: "telegram".into(),
                display_name: "Telegram".into(),
                kind: "applicationCounter".into(),
                count: Some(application_count),
                needs_attention: Some(application_count > 0),
                origin: "windowTitle".into(),
                raw_label: title_counter.map(|count| format!("({count})")),
                confidence: "medium".into(),
                inferred: title_counter.is_none(),
                meaning: if title_counter.is_none() {
                    "No trailing counter was present in the observed Telegram window title, so the current application counter is inferred as zero."
                        .into()
                } else {
                    "Telegram-owned counter; exact semantics depend on Telegram badge settings."
                        .into()
                },
                diagnostics: Vec::new(),
            },
            AttentionSignal {
                source_key: "telegram".into(),
                display_name: "Telegram".into(),
                kind: "unreadChats".into(),
                count: Some(unread_chat_count),
                needs_attention: Some(unread_chat_count > 0),
                origin: "applicationUiAutomation".into(),
                raw_label: unread_chats_label,
                confidence: "medium".into(),
                inferred: unread_chats.is_none(),
                meaning: if unread_chats.is_none() {
                    "No unread-chat count was present in the observed Telegram accessibility tree, so the current unread-chat count is inferred as zero."
                        .into()
                } else {
                    "Telegram accessibility label; localized wording and app versions may change."
                        .into()
                },
                diagnostics: Vec::new(),
            },
        ],
        diagnostics: Vec::new(),
    })
}

fn capture_notification_area(
    automation: &IUIAutomation,
) -> windows::core::Result<AttentionSourceObservation> {
    let taskbar = unsafe { FindWindowW(w!("Shell_TrayWnd"), PCWSTR::null())? };
    let taskbar_root = unsafe { automation.ElementFromHandle(taskbar)? };
    let condition = unsafe { automation.CreateTrueCondition()? };
    let elements = unsafe { taskbar_root.FindAll(TreeScope_Descendants, &condition)? };
    let length = unsafe { elements.Length()? };
    let mut teams_label = None;

    for index in 0..length {
        let element = match unsafe { elements.GetElement(index) } {
            Ok(element) => element,
            Err(_) => continue,
        };
        let automation_id = match unsafe { element.CurrentAutomationId() } {
            Ok(value) => value.to_string(),
            Err(_) => continue,
        };
        if automation_id != NOTIFICATION_AREA_AUTOMATION_ID {
            continue;
        }

        let name = match element_name(&element) {
            Ok(name) => name.trim().to_owned(),
            Err(_) => continue,
        };

        if name.starts_with("Microsoft Teams") {
            teams_label = Some(name);
        }
    }

    Ok(match teams_label {
        Some(label) => {
            let needs_attention = teams_needs_attention(&label);
            AttentionSourceObservation {
                source_key: "teams".into(),
                display_name: "Microsoft Teams".into(),
                state: AttentionSourceState::Observed,
                signals: vec![AttentionSignal {
                    source_key: "teams".into(),
                    display_name: "Microsoft Teams".into(),
                    kind: "activityStatus".into(),
                    count: None,
                    needs_attention: Some(needs_attention),
                    origin: "notificationAreaUiAutomation".into(),
                    raw_label: Some(label),
                    confidence: "medium".into(),
                    inferred: false,
                    meaning: "Qualitative Teams-owned notification-area label; it does not expose an exact count."
                        .into(),
                    diagnostics: Vec::new(),
                }],
                diagnostics: Vec::new(),
            }
        }
        None => AttentionSourceObservation {
            source_key: "teams".into(),
            display_name: "Microsoft Teams".into(),
            state: AttentionSourceState::NotExposed,
            signals: Vec::new(),
            diagnostics: vec![
                "No Microsoft Teams notification-area accessibility label was found.".into(),
            ],
        },
    })
}

fn element_name(element: &IUIAutomationElement) -> windows::core::Result<String> {
    unsafe { element.CurrentName().map(|value| value.to_string()) }
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

fn parse_trailing_parenthesized_count(value: &str) -> Option<u32> {
    let value = value.trim();
    let without_closing = value.strip_suffix(')')?;
    let opening = without_closing.rfind('(')?;
    let count = &without_closing[opening + 1..];
    (!count.is_empty() && count.chars().all(|character| character.is_ascii_digit()))
        .then(|| count.parse().ok())
        .flatten()
}

fn parse_telegram_unread_chats(value: &str) -> Option<u32> {
    let remainder = value.strip_prefix("All chats (")?;
    let (count, suffix) = remainder.split_once(' ')?;
    if suffix != "unread chat)" && suffix != "unread chats)" {
        return None;
    }
    count.parse().ok()
}

fn teams_needs_attention(value: &str) -> bool {
    let value = value.to_ascii_lowercase();
    value.contains("new activity") || value.contains("unread") || value.contains("notification")
}

fn is_outlook_inbox_label(value: &str) -> bool {
    let value = value.trim();
    value.eq_ignore_ascii_case("inbox")
        || value
            .get(..6)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case("inbox "))
        || value
            .get(..6)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case("inbox,"))
        || value
            .get(..6)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case("inbox-"))
}

fn parse_outlook_inbox_unread(value: &str) -> Option<u32> {
    if !is_outlook_inbox_label(value) {
        return None;
    }

    let tokens = value
        .split(|character: char| !character.is_alphanumeric())
        .filter(|token| !token.is_empty())
        .collect::<Vec<_>>();

    tokens.windows(2).find_map(|pair| {
        pair[1]
            .eq_ignore_ascii_case("unread")
            .then(|| pair[0].parse().ok())
            .flatten()
    })
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
    use super::{
        is_outlook_inbox_label, parse_outlook_inbox_unread, parse_telegram_unread_chats,
        parse_trailing_parenthesized_count, record_source_capture, teams_needs_attention,
    };
    use crate::attention_signals::{AttentionSourceObservation, AttentionSourceState};
    use std::cell::Cell;
    use windows::core::{Error, HRESULT};

    #[test]
    fn parses_telegram_window_title_counter() {
        assert_eq!(
            parse_trailing_parenthesized_count("Telegram chat – (25)"),
            Some(25)
        );
        assert_eq!(parse_trailing_parenthesized_count("Telegram chat"), None);
    }

    #[test]
    fn parses_telegram_unread_chat_labels() {
        assert_eq!(
            parse_telegram_unread_chats("All chats (9 unread chats)"),
            Some(9)
        );
        assert_eq!(
            parse_telegram_unread_chats("All chats (1 unread chat)"),
            Some(1)
        );
    }

    #[test]
    fn classifies_teams_activity_without_inventing_a_count() {
        assert!(teams_needs_attention(
            "Microsoft Teams Microsoft Teams | New activity"
        ));
        assert!(!teams_needs_attention("Microsoft Teams"));
    }

    #[test]
    fn parses_outlook_inbox_unread_status_without_account_details() {
        assert!(is_outlook_inbox_label("Inbox - account - 1 unread message"));
        assert_eq!(
            parse_outlook_inbox_unread("Inbox - account - 1 unread message"),
            Some(1)
        );
        assert_eq!(parse_outlook_inbox_unread("Inbox - account"), None);
        assert_eq!(parse_outlook_inbox_unread("Archive - 2 unread"), None);
    }

    #[test]
    fn source_capture_failure_does_not_prevent_later_sources() {
        let later_capture_ran = Cell::new(false);
        let mut sources = Vec::new();

        record_source_capture(&mut sources, "telegram", "Telegram", || {
            Err(Error::new(HRESULT(0x80004005_u32 as i32), "test failure"))
        });
        record_source_capture(&mut sources, "outlook", "Microsoft Outlook", || {
            later_capture_ran.set(true);
            Ok(AttentionSourceObservation {
                source_key: "outlook".into(),
                display_name: "Microsoft Outlook".into(),
                state: AttentionSourceState::Observed,
                signals: Vec::new(),
                diagnostics: Vec::new(),
            })
        });

        assert!(later_capture_ran.get());
        assert_eq!(sources.len(), 2);
        assert_eq!(sources[0].state, AttentionSourceState::Error);
        assert_eq!(sources[1].state, AttentionSourceState::Observed);
    }
}
