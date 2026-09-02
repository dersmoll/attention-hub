use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ZoomMeetingState {
    Inactive,
    Live,
    Uncertain,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoomMeetingSnapshot {
    pub state: ZoomMeetingState,
    pub minimized: bool,
    pub candidate_count: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct WindowTraits {
    class_name: String,
    executable_name: String,
    visible: bool,
    minimized: bool,
    has_owner: bool,
    tool_window: bool,
    cloaked: bool,
    width: i32,
    height: i32,
}

const PRIMARY_MEETING_CLASS: &str = "ConfMultiTabContentWndClass";
const MEETING_SUPPORT_CLASSES: &[&str] = &[
    "VideoFrameWndClass",
    "ZPActiveSpeakerWndClass",
    "ZPFloatControlPanelMgrClass",
    "ZPFloatVideoWndClass",
    "ZPToolBarParentWndClass",
    "zMeetingNotificationWndClass",
];

fn is_zoom_window(window: &WindowTraits) -> bool {
    window.executable_name.eq_ignore_ascii_case("zoom.exe")
}

fn is_primary_candidate(window: &WindowTraits) -> bool {
    is_zoom_window(window)
        && window.class_name == PRIMARY_MEETING_CLASS
        && !window.has_owner
        && !window.tool_window
        && !window.cloaked
        && (window.visible || window.minimized)
}

fn is_meeting_indicator(window: &WindowTraits) -> bool {
    is_zoom_window(window)
        && (window.class_name == PRIMARY_MEETING_CLASS
            || MEETING_SUPPORT_CLASSES.contains(&window.class_name.as_str()))
}

fn snapshot_from_windows(windows: &[WindowTraits]) -> ZoomMeetingSnapshot {
    let candidates = windows
        .iter()
        .filter(|window| is_primary_candidate(window))
        .collect::<Vec<_>>();
    if !candidates.is_empty() {
        return ZoomMeetingSnapshot {
            state: ZoomMeetingState::Live,
            minimized: candidates.iter().all(|window| window.minimized),
            candidate_count: candidates.len(),
        };
    }
    ZoomMeetingSnapshot {
        state: if windows.iter().any(is_meeting_indicator) {
            ZoomMeetingState::Uncertain
        } else {
            ZoomMeetingState::Inactive
        },
        minimized: false,
        candidate_count: 0,
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use std::{ffi::c_void, path::Path};

    use windows::{
        core::{Result as WindowsResult, BOOL, PWSTR},
        Win32::{
            Foundation::{CloseHandle, HANDLE, HWND, LPARAM, RECT},
            Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED},
            System::Threading::{
                OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
                PROCESS_QUERY_LIMITED_INFORMATION,
            },
            UI::WindowsAndMessaging::{
                EnumWindows, GetClassNameW, GetForegroundWindow, GetWindow, GetWindowLongPtrW,
                GetWindowRect, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
                SetForegroundWindow, ShowWindow, GWL_EXSTYLE, GW_OWNER, SW_RESTORE, SW_SHOWNORMAL,
                WS_EX_TOOLWINDOW,
            },
        },
    };

    use super::{snapshot_from_windows, WindowTraits, ZoomMeetingSnapshot};

    struct ProcessHandle(HANDLE);

    impl Drop for ProcessHandle {
        fn drop(&mut self) {
            unsafe {
                let _ = CloseHandle(self.0);
            }
        }
    }

    #[derive(Clone)]
    struct NativeWindow {
        handle: HWND,
        traits: WindowTraits,
        foreground: bool,
    }

    fn enumerate_top_level_windows() -> WindowsResult<Vec<HWND>> {
        unsafe extern "system" fn collect(window: HWND, state: LPARAM) -> BOOL {
            let windows = &mut *(state.0 as *mut Vec<HWND>);
            windows.push(window);
            true.into()
        }

        let mut windows = Vec::new();
        unsafe {
            EnumWindows(
                Some(collect),
                LPARAM((&mut windows as *mut Vec<HWND>) as isize),
            )?;
        }
        Ok(windows)
    }

    fn window_class_name(window: HWND) -> String {
        let mut buffer = [0_u16; 256];
        let length = unsafe { GetClassNameW(window, &mut buffer) };
        if length <= 0 {
            String::new()
        } else {
            String::from_utf16_lossy(&buffer[..length as usize])
        }
    }

    fn process_executable_name(process_id: u32) -> WindowsResult<String> {
        let handle = ProcessHandle(unsafe {
            OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id)?
        });
        let mut buffer = vec![0_u16; 32_768];
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

    fn native_windows() -> WindowsResult<Vec<NativeWindow>> {
        let foreground = unsafe { GetForegroundWindow() };
        let mut result = Vec::new();
        for handle in enumerate_top_level_windows()? {
            let mut process_id = 0_u32;
            unsafe {
                GetWindowThreadProcessId(handle, Some(&mut process_id));
            }
            if process_id == 0 {
                continue;
            }
            let executable_name = match process_executable_name(process_id) {
                Ok(name) if name.eq_ignore_ascii_case("zoom.exe") => name,
                _ => continue,
            };
            let mut bounds = RECT::default();
            if unsafe { GetWindowRect(handle, &mut bounds) }.is_err() {
                continue;
            }
            let mut cloaked = 0_u32;
            let _ = unsafe {
                DwmGetWindowAttribute(
                    handle,
                    DWMWA_CLOAKED,
                    &mut cloaked as *mut u32 as *mut c_void,
                    std::mem::size_of::<u32>() as u32,
                )
            };
            let has_owner = unsafe { GetWindow(handle, GW_OWNER) }
                .map(|owner| !owner.is_invalid())
                .unwrap_or(false);
            let ex_style = unsafe { GetWindowLongPtrW(handle, GWL_EXSTYLE) } as u32;
            result.push(NativeWindow {
                handle,
                foreground: handle.0 == foreground.0,
                traits: WindowTraits {
                    class_name: window_class_name(handle),
                    executable_name,
                    visible: unsafe { IsWindowVisible(handle) }.as_bool(),
                    minimized: unsafe { IsIconic(handle) }.as_bool(),
                    has_owner,
                    tool_window: ex_style & WS_EX_TOOLWINDOW.0 != 0,
                    cloaked: cloaked != 0,
                    width: (bounds.right - bounds.left).max(0),
                    height: (bounds.bottom - bounds.top).max(0),
                },
            });
        }
        Ok(result)
    }

    pub fn snapshot() -> std::result::Result<ZoomMeetingSnapshot, String> {
        native_windows()
            .map(|windows| {
                snapshot_from_windows(
                    &windows
                        .into_iter()
                        .map(|window| window.traits)
                        .collect::<Vec<_>>(),
                )
            })
            .map_err(|error| format!("Could not inspect Zoom meeting windows: {error}"))
    }

    pub fn activate() -> std::result::Result<(), String> {
        let mut candidates = native_windows()
            .map_err(|error| format!("Could not inspect Zoom meeting windows: {error}"))?
            .into_iter()
            .filter(|window| super::is_primary_candidate(&window.traits))
            .collect::<Vec<_>>();
        candidates.sort_by_key(|window| {
            (
                u8::from(!window.traits.visible),
                u8::from(!window.foreground),
                std::cmp::Reverse(i64::from(window.traits.width) * i64::from(window.traits.height)),
            )
        });
        let Some(window) = candidates.first() else {
            return Err("No active Zoom meeting window is available.".into());
        };
        if window.traits.minimized {
            unsafe {
                let _ = ShowWindow(window.handle, SW_RESTORE);
            }
        } else if !window.traits.visible {
            unsafe {
                let _ = ShowWindow(window.handle, SW_SHOWNORMAL);
            }
        }
        if !unsafe { SetForegroundWindow(window.handle) }.as_bool() {
            return Err("Windows did not allow the Zoom meeting to enter the foreground.".into());
        }
        Ok(())
    }
}

#[cfg(target_os = "windows")]
pub use platform::{activate, snapshot};

#[cfg(not(target_os = "windows"))]
pub fn snapshot() -> Result<ZoomMeetingSnapshot, String> {
    Ok(ZoomMeetingSnapshot {
        state: ZoomMeetingState::Inactive,
        minimized: false,
        candidate_count: 0,
    })
}

#[cfg(not(target_os = "windows"))]
pub fn activate() -> Result<(), String> {
    Err("Zoom meeting focus is available only on Windows.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn window(class_name: &str) -> WindowTraits {
        WindowTraits {
            class_name: class_name.into(),
            executable_name: "Zoom.exe".into(),
            visible: true,
            minimized: false,
            has_owner: false,
            tool_window: false,
            cloaked: false,
            width: 1_100,
            height: 800,
        }
    }

    #[test]
    fn live_meeting_requires_primary_zoom_window() {
        let snapshot = snapshot_from_windows(&[window(PRIMARY_MEETING_CLASS)]);
        assert_eq!(snapshot.state, ZoomMeetingState::Live);
        assert_eq!(snapshot.candidate_count, 1);
        assert!(!snapshot.minimized);
    }

    #[test]
    fn minimized_primary_window_remains_live() {
        let mut meeting = window(PRIMARY_MEETING_CLASS);
        meeting.visible = false;
        meeting.minimized = true;
        let snapshot = snapshot_from_windows(&[meeting]);
        assert_eq!(snapshot.state, ZoomMeetingState::Live);
        assert!(snapshot.minimized);
    }

    #[test]
    fn zoom_shell_alone_is_inactive() {
        let snapshot = snapshot_from_windows(&[window("ZPPTMainFrmWndClassEx")]);
        assert_eq!(snapshot.state, ZoomMeetingState::Inactive);
    }

    #[test]
    fn meeting_helpers_without_primary_window_are_uncertain() {
        let snapshot = snapshot_from_windows(&[window("ZPFloatVideoWndClass")]);
        assert_eq!(snapshot.state, ZoomMeetingState::Uncertain);
    }

    #[test]
    fn owned_or_tool_primary_window_is_not_accepted() {
        let mut meeting = window(PRIMARY_MEETING_CLASS);
        meeting.has_owner = true;
        assert_eq!(
            snapshot_from_windows(&[meeting]).state,
            ZoomMeetingState::Uncertain
        );
    }
}
