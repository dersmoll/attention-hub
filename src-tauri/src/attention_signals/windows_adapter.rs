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

use super::{AttentionSignal, AttentionSignalSnapshot};

const TELEGRAM_EXECUTABLE: &str = "telegram.exe";
const OUTLOOK_EXECUTABLE: &str = "olk.exe";
const NOTIFICATION_AREA_AUTOMATION_ID: &str = "NotifyItemIcon";

pub fn get_snapshot() -> AttentionSignalSnapshot {
    let _uia_guard = crate::uia_gate::lock_background();
    let captured_at = current_time_iso8601();
    let mut signals = Vec::new();
    let mut diagnostics = Vec::new();

    let result = capture_signals(&mut signals, &mut diagnostics);
    if let Err(error) = result {
        diagnostics.push(format_windows_error(
            "Could not capture persistent attention signals",
            &error,
        ));
    }

    AttentionSignalSnapshot {
        captured_at,
        signals,
        diagnostics,
    }
}

fn capture_signals(
    signals: &mut Vec<AttentionSignal>,
    diagnostics: &mut Vec<String>,
) -> windows::core::Result<()> {
    let _apartment = ComApartment::initialize()?;
    let automation: IUIAutomation =
        unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)? };

    capture_telegram(&automation, signals, diagnostics)?;
    capture_outlook(&automation, signals, diagnostics)?;
    capture_notification_area(&automation, signals, diagnostics)?;

    Ok(())
}

fn capture_outlook(
    automation: &IUIAutomation,
    signals: &mut Vec<AttentionSignal>,
    diagnostics: &mut Vec<String>,
) -> windows::core::Result<()> {
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
        diagnostics.push("New Outlook is not running with an accessible top-level window.".into());
        return Ok(());
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
        diagnostics.push(
            "New Outlook is running, but no English Inbox accessibility label was found.".into(),
        );
        return Ok(());
    }

    let explicit_counts = inbox_labels
        .iter()
        .filter_map(|label| parse_outlook_inbox_unread(label))
        .collect::<Vec<_>>();
    let count = explicit_counts
        .iter()
        .copied()
        .fold(0_u32, u32::saturating_add);

    signals.push(AttentionSignal {
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
        meaning: "Sum of explicit unread counts in unique English Inbox accessibility labels; account names and message content are not exposed."
            .into(),
        diagnostics: Vec::new(),
    });

    Ok(())
}

fn capture_telegram(
    automation: &IUIAutomation,
    signals: &mut Vec<AttentionSignal>,
    diagnostics: &mut Vec<String>,
) -> windows::core::Result<()> {
    let condition = unsafe { automation.CreateTrueCondition()? };
    let root = unsafe { automation.GetRootElement()? };
    let windows = unsafe { root.FindAll(TreeScope_Children, &condition)? };
    let length = unsafe { windows.Length()? };
    let mut telegram_roots = Vec::new();
    let mut title_counter_found = false;

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
            signals.push(AttentionSignal {
                source_key: "telegram".into(),
                display_name: "Telegram".into(),
                kind: "applicationCounter".into(),
                count: Some(count),
                needs_attention: Some(count > 0),
                origin: "windowTitle".into(),
                raw_label: Some(format!("({count})")),
                confidence: "medium".into(),
                meaning:
                    "Telegram-owned counter; exact semantics depend on Telegram badge settings."
                        .into(),
                diagnostics: Vec::new(),
            });
            title_counter_found = true;
        }

        telegram_roots.push(element);
    }

    if telegram_roots.is_empty() {
        diagnostics.push("Telegram is not running with an accessible top-level window.".into());
        return Ok(());
    }

    if !title_counter_found {
        diagnostics.push(
            "Telegram is running, but no accessible top-level window title contains a trailing numeric counter."
                .into(),
        );
    }

    let mut unread_chats_found = false;
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
                signals.push(AttentionSignal {
                    source_key: "telegram".into(),
                    display_name: "Telegram".into(),
                    kind: "unreadChats".into(),
                    count: Some(count),
                    needs_attention: Some(count > 0),
                    origin: "applicationUiAutomation".into(),
                    raw_label: Some(name),
                    confidence: "medium".into(),
                    meaning:
                        "Telegram accessibility label; localized wording and app versions may change."
                            .into(),
                    diagnostics: Vec::new(),
                });
                unread_chats_found = true;
                break;
            }
        }

        if unread_chats_found {
            break;
        }
    }

    Ok(())
}

fn capture_notification_area(
    automation: &IUIAutomation,
    signals: &mut Vec<AttentionSignal>,
    diagnostics: &mut Vec<String>,
) -> windows::core::Result<()> {
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

    match teams_label {
        Some(label) => {
            let needs_attention = teams_needs_attention(&label);
            signals.push(AttentionSignal {
                source_key: "teams".into(),
                display_name: "Microsoft Teams".into(),
                kind: "activityStatus".into(),
                count: None,
                needs_attention: Some(needs_attention),
                origin: "notificationAreaUiAutomation".into(),
                raw_label: Some(label),
                confidence: "medium".into(),
                meaning: "Qualitative Teams-owned notification-area label; it does not expose an exact count."
                    .into(),
                diagnostics: Vec::new(),
            });
        }
        None => diagnostics
            .push("No Microsoft Teams notification-area accessibility label was found.".into()),
    }

    Ok(())
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
        parse_trailing_parenthesized_count, teams_needs_attention,
    };

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
}
