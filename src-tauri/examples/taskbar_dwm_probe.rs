//! Manual Windows taskbar DWM thumbnail probe.
//!
//! The default Phase 0 mode mirrors the complete primary taskbar without UI
//! Automation or source cropping:
//!
//! `cargo run --example taskbar_dwm_probe`
//!
//! After that surface gate passes, the separately gated Phase 1 mode discovers
//! one Teams taskbar button and applies a static crop:
//!
//! `cargo run --example taskbar_dwm_probe -- --teams-crop`
//!
//! The separately gated Phase 2 mode periodically revalidates the Teams UI
//! Automation rectangle and hides/refreshes the crop when it changes:
//!
//! `cargo run --example taskbar_dwm_probe -- --track-reflow`
//!
//! Neither mode reads pixels or integrates with Tauri.

#[cfg(not(target_os = "windows"))]
fn main() {
    eprintln!("The taskbar DWM probe is available only on Windows.");
    std::process::exit(1);
}

#[cfg(target_os = "windows")]
fn main() {
    if let Err(error) = windows_probe::run() {
        eprintln!("taskbar DWM probe failed: {error:?}");
        std::process::exit(1);
    }
}

#[cfg(target_os = "windows")]
mod windows_probe {
    use std::{collections::BTreeMap, ffi::c_void, time::Instant};

    use windows::{
        core::{w, Error, Result},
        Win32::{
            Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, RECT, WPARAM},
            Graphics::{
                Dwm::{
                    DwmGetWindowAttribute, DwmQueryThumbnailSourceSize, DwmRegisterThumbnail,
                    DwmUnregisterThumbnail, DwmUpdateThumbnailProperties,
                    DWMWA_EXTENDED_FRAME_BOUNDS, DWM_THUMBNAIL_PROPERTIES, DWM_TNP_OPACITY,
                    DWM_TNP_RECTDESTINATION, DWM_TNP_RECTSOURCE, DWM_TNP_SOURCECLIENTAREAONLY,
                    DWM_TNP_VISIBLE,
                },
                Gdi::{GetStockObject, BLACK_BRUSH, HBRUSH},
            },
            System::{
                Com::{
                    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
                    COINIT_MULTITHREADED,
                },
                LibraryLoader::GetModuleHandleW,
            },
            UI::{
                Accessibility::{
                    CUIAutomation, IUIAutomation, TreeScope_Descendants, UIA_ButtonControlTypeId,
                },
                HiDpi::{
                    AreDpiAwarenessContextsEqual, GetThreadDpiAwarenessContext,
                    SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
                },
                WindowsAndMessaging::{
                    AdjustWindowRectEx, CreateWindowExW, DefWindowProcW, DispatchMessageW,
                    FindWindowW, GetMessageW, GetSystemMetrics, LoadCursorW, PostQuitMessage,
                    RegisterClassW, SetTimer, SetWindowPos, ShowWindow, TranslateMessage,
                    CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT, IDC_ARROW, MSG, SM_CXSCREEN,
                    SM_CYSCREEN, SWP_NOMOVE, SWP_NOZORDER, SW_SHOWNORMAL, WINDOW_EX_STYLE,
                    WM_DESTROY, WM_TIMER, WNDCLASSW, WS_OVERLAPPEDWINDOW,
                },
            },
        },
    };

    const E_FAIL: windows::core::HRESULT = windows::core::HRESULT(0x8000_4005_u32 as i32);
    const MINIMUM_WINDOW_CLIENT_WIDTH: i32 = 320;
    const NOTIFICATION_AREA_AUTOMATION_ID: &str = "NotifyItemIcon";
    const REFLOW_POLL_MILLISECONDS: u32 = 100;
    const REFLOW_TIMER_ID: usize = 1;
    const TEAMS_CROP_ARGUMENT: &str = "--teams-crop";
    const TRACK_REFLOW_ARGUMENT: &str = "--track-reflow";
    const WINDOW_CLASS: windows::core::PCWSTR = w!("AttentionHub.TaskbarDwmProbe");
    const WINDOW_TITLE: windows::core::PCWSTR = w!("Attention Hub - taskbar DWM probe");

    pub fn run() -> Result<()> {
        let arguments = std::env::args().collect::<Vec<_>>();
        let mode = if arguments
            .iter()
            .any(|argument| argument == TRACK_REFLOW_ARGUMENT)
        {
            ProbeMode::TeamsTrackedCrop
        } else if arguments
            .iter()
            .any(|argument| argument == TEAMS_CROP_ARGUMENT)
        {
            ProbeMode::TeamsStaticCrop
        } else {
            ProbeMode::WholeTaskbar
        };

        if mode != ProbeMode::WholeTaskbar {
            ensure_per_monitor_v2_awareness()?;
        }

        let taskbar = unsafe { FindWindowW(w!("Shell_TrayWnd"), None)? };
        let taskbar_frame = extended_frame_bounds(taskbar)?;
        let source_crop = match mode {
            ProbeMode::WholeTaskbar => None,
            ProbeMode::TeamsStaticCrop | ProbeMode::TeamsTrackedCrop => {
                Some(discover_teams_button(taskbar, taskbar_frame, true)?)
            }
        };
        let destination = create_destination_window()?;
        let thumbnail = Thumbnail::register(destination, taskbar)?;
        let source_size = thumbnail.source_size()?;

        if source_size.cx <= 0 || source_size.cy <= 0 {
            return Err(Error::new(
                E_FAIL,
                "DWM returned an invalid taskbar thumbnail source size",
            ));
        }

        let rendered_source_size = source_crop
            .map(|crop| (crop.right - crop.left, crop.bottom - crop.top))
            .unwrap_or((source_size.cx, source_size.cy));
        let thumbnail_size =
            fit_source_to_primary_display(rendered_source_size.0, rendered_source_size.1);
        let destination_size = (
            thumbnail_size.0.max(MINIMUM_WINDOW_CLIENT_WIDTH),
            thumbnail_size.1,
        );
        resize_destination(destination, destination_size.0, destination_size.1)?;
        thumbnail.show_source(
            source_crop,
            (destination_size.0 - thumbnail_size.0) / 2,
            thumbnail_size.0,
            thumbnail_size.1,
        )?;

        println!("probe_mode={}", mode.label());
        println!("taskbar_class=Shell_TrayWnd");
        println!("taskbar_hwnd={taskbar:?}");
        println!(
            "taskbar_extended_frame=left:{} top:{} right:{} bottom:{}",
            taskbar_frame.left, taskbar_frame.top, taskbar_frame.right, taskbar_frame.bottom
        );
        println!(
            "dwm_source_size={}x{} thumbnail_size={}x{} destination_client_size={}x{}",
            source_size.cx,
            source_size.cy,
            thumbnail_size.0,
            thumbnail_size.1,
            destination_size.0,
            destination_size.1
        );
        println!("dwm_registration=success");
        println!(
            "Inspect the native window and close it when finished. No screenshot is required."
        );

        let reflow_controller = if mode == ProbeMode::TeamsTrackedCrop {
            let controller = ReflowController::new(
                taskbar,
                destination,
                &thumbnail,
                source_crop.expect("tracked crop mode requires a source crop"),
            );
            controller.start()?;
            Some(controller)
        } else {
            None
        };

        unsafe {
            let _ = ShowWindow(destination, SW_SHOWNORMAL);
        }
        run_message_loop(reflow_controller)?;

        Ok(())
    }

    fn ensure_per_monitor_v2_awareness() -> Result<()> {
        match unsafe { SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) } {
            Ok(()) => Ok(()),
            Err(error) => {
                let current = unsafe { GetThreadDpiAwarenessContext() };
                let already_per_monitor_v2 = unsafe {
                    AreDpiAwarenessContextsEqual(
                        current,
                        DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
                    )
                    .as_bool()
                };
                already_per_monitor_v2.then_some(()).ok_or(error)
            }
        }
    }

    fn extended_frame_bounds(window: HWND) -> Result<RECT> {
        let mut bounds = RECT::default();
        unsafe {
            DwmGetWindowAttribute(
                window,
                DWMWA_EXTENDED_FRAME_BOUNDS,
                &mut bounds as *mut RECT as *mut c_void,
                std::mem::size_of::<RECT>() as u32,
            )?;
        }
        Ok(bounds)
    }

    fn discover_teams_button(
        taskbar: HWND,
        taskbar_frame: RECT,
        log_details: bool,
    ) -> Result<RECT> {
        let _apartment = ComApartment::initialize()?;
        let automation: IUIAutomation =
            unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)? };
        let taskbar_root = unsafe { automation.ElementFromHandle(taskbar)? };
        let condition = unsafe { automation.CreateTrueCondition()? };
        let elements = unsafe { taskbar_root.FindAll(TreeScope_Descendants, &condition)? };
        let length = unsafe { elements.Length()? };
        let mut candidates = BTreeMap::<(i32, i32, i32, i32), TeamsButtonCandidate>::new();
        let mut excluded_notification_area_matches = 0_u32;

        for index in 0..length {
            let element = match unsafe { elements.GetElement(index) } {
                Ok(element) => element,
                Err(_) => continue,
            };
            let name = unsafe { element.CurrentName() }
                .map(|value| value.to_string())
                .unwrap_or_default();
            let automation_id = unsafe { element.CurrentAutomationId() }
                .map(|value| value.to_string())
                .unwrap_or_default();
            let name_match = name.to_ascii_lowercase().contains("microsoft teams");
            let identity_match = is_teams_identity(&automation_id);

            if !name_match && !identity_match {
                continue;
            }
            if automation_id == NOTIFICATION_AREA_AUTOMATION_ID {
                excluded_notification_area_matches =
                    excluded_notification_area_matches.saturating_add(1);
                continue;
            }

            let bounds = match unsafe { element.CurrentBoundingRectangle() } {
                Ok(bounds)
                    if bounds.right > bounds.left
                        && bounds.bottom > bounds.top
                        && rect_is_within(bounds, taskbar_frame) =>
                {
                    bounds
                }
                _ => continue,
            };
            if unsafe { element.CurrentIsOffscreen() }
                .map(|value| value.as_bool())
                .unwrap_or(true)
            {
                continue;
            }

            let button_control = unsafe { element.CurrentControlType() }
                .map(|value| value.0 == UIA_ButtonControlTypeId.0)
                .unwrap_or(false);
            let key = (bounds.left, bounds.top, bounds.right, bounds.bottom);
            let candidate = candidates.entry(key).or_insert(TeamsButtonCandidate {
                bounds,
                name_match: false,
                identity_match: false,
                button_control: false,
                name_length: 0,
                automation_id_length: 0,
            });
            candidate.name_match |= name_match;
            candidate.identity_match |= identity_match;
            candidate.button_control |= button_control;
            candidate.name_length = candidate.name_length.max(name.chars().count());
            candidate.automation_id_length = candidate
                .automation_id_length
                .max(automation_id.chars().count());
        }

        if log_details {
            println!("teams_taskbar_candidate_count={}", candidates.len());
            println!(
                "teams_notification_area_matches_excluded={excluded_notification_area_matches}"
            );
            for (index, candidate) in candidates.values().enumerate() {
                println!(
                    "teams_candidate_{index}=name_match:{} identity_match:{} button_control:{} name_length:{} automation_id_length:{} bounds:{},{},{},{}",
                    candidate.name_match,
                    candidate.identity_match,
                    candidate.button_control,
                    candidate.name_length,
                    candidate.automation_id_length,
                    candidate.bounds.left,
                    candidate.bounds.top,
                    candidate.bounds.right,
                    candidate.bounds.bottom
                );
            }
        }

        let selected = unique_candidate(
            candidates
                .values()
                .copied()
                .filter(|candidate| candidate.identity_match && candidate.button_control),
        )
        .or_else(|| {
            unique_candidate(
                candidates
                    .values()
                    .copied()
                    .filter(|candidate| candidate.identity_match),
            )
        })
        .or_else(|| {
            unique_candidate(
                candidates
                    .values()
                    .copied()
                    .filter(|candidate| candidate.name_match && candidate.button_control),
            )
        })
        .or_else(|| unique_candidate(candidates.values().copied()))
        .ok_or_else(|| {
            Error::new(
                E_FAIL,
                "Teams taskbar button discovery was absent or ambiguous",
            )
        })?;

        let source_rect = RECT {
            left: selected.bounds.left - taskbar_frame.left,
            top: selected.bounds.top - taskbar_frame.top,
            right: selected.bounds.right - taskbar_frame.left,
            bottom: selected.bounds.bottom - taskbar_frame.top,
        };
        if log_details {
            println!(
                "teams_source_crop=left:{} top:{} right:{} bottom:{}",
                source_rect.left, source_rect.top, source_rect.right, source_rect.bottom
            );
        }

        Ok(source_rect)
    }

    fn is_teams_identity(value: &str) -> bool {
        let value = value.to_ascii_lowercase();
        value.contains("msteams")
            || value.contains("microsoftteams")
            || value.contains("microsoft.teams")
    }

    fn rect_is_within(candidate: RECT, container: RECT) -> bool {
        candidate.left >= container.left
            && candidate.top >= container.top
            && candidate.right <= container.right
            && candidate.bottom <= container.bottom
    }

    fn unique_candidate(
        mut candidates: impl Iterator<Item = TeamsButtonCandidate>,
    ) -> Option<TeamsButtonCandidate> {
        let candidate = candidates.next()?;
        candidates.next().is_none().then_some(candidate)
    }

    fn create_destination_window() -> Result<HWND> {
        let module = unsafe { GetModuleHandleW(None)? };
        let instance = HINSTANCE(module.0);
        let window_class = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(window_proc),
            hInstance: instance,
            hCursor: unsafe { LoadCursorW(None, IDC_ARROW)? },
            hbrBackground: HBRUSH(unsafe { GetStockObject(BLACK_BRUSH) }.0),
            lpszClassName: WINDOW_CLASS,
            ..Default::default()
        };

        if unsafe { RegisterClassW(&window_class) } == 0 {
            return Err(Error::from_win32());
        }

        unsafe {
            CreateWindowExW(
                WINDOW_EX_STYLE::default(),
                WINDOW_CLASS,
                WINDOW_TITLE,
                WS_OVERLAPPEDWINDOW,
                CW_USEDEFAULT,
                CW_USEDEFAULT,
                1000,
                180,
                None,
                None,
                Some(instance),
                None,
            )
        }
    }

    fn fit_source_to_primary_display(source_width: i32, source_height: i32) -> (i32, i32) {
        let screen_width = unsafe { GetSystemMetrics(SM_CXSCREEN) };
        let screen_height = unsafe { GetSystemMetrics(SM_CYSCREEN) };
        let maximum_width = (screen_width - 80).max(1);
        let maximum_height = (screen_height - 120).max(1);
        let scale = (maximum_width as f64 / source_width as f64)
            .min(maximum_height as f64 / source_height as f64)
            .min(1.0);
        let destination_width = ((source_width as f64 * scale).round() as i32).max(1);
        let destination_height = ((source_height as f64 * scale).round() as i32).max(1);

        (destination_width, destination_height)
    }

    fn resize_destination(window: HWND, client_width: i32, client_height: i32) -> Result<()> {
        let mut window_rect = RECT {
            left: 0,
            top: 0,
            right: client_width,
            bottom: client_height,
        };

        unsafe {
            AdjustWindowRectEx(
                &mut window_rect,
                WS_OVERLAPPEDWINDOW,
                false,
                WINDOW_EX_STYLE::default(),
            )?;
            SetWindowPos(
                window,
                None,
                0,
                0,
                window_rect.right - window_rect.left,
                window_rect.bottom - window_rect.top,
                SWP_NOMOVE | SWP_NOZORDER,
            )
        }
    }

    fn run_message_loop(mut reflow: Option<ReflowController<'_>>) -> Result<()> {
        let mut message = MSG::default();

        loop {
            let result = unsafe { GetMessageW(&mut message, None, 0, 0) };
            if result.0 == -1 {
                return Err(Error::from_win32());
            }
            if result.0 == 0 {
                return Ok(());
            }

            if message.message == WM_TIMER && message.wParam.0 == REFLOW_TIMER_ID {
                if let Some(reflow) = reflow.as_mut() {
                    reflow.check()?;
                }
                continue;
            }

            unsafe {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }
    }

    struct Thumbnail(isize);

    impl Thumbnail {
        fn register(destination: HWND, source: HWND) -> Result<Self> {
            unsafe { DwmRegisterThumbnail(destination, source).map(Self) }
        }

        fn source_size(&self) -> Result<windows::Win32::Foundation::SIZE> {
            unsafe { DwmQueryThumbnailSourceSize(self.0) }
        }

        fn show_source(
            &self,
            source: Option<RECT>,
            left: i32,
            width: i32,
            height: i32,
        ) -> Result<()> {
            let mut properties = DWM_THUMBNAIL_PROPERTIES {
                dwFlags: DWM_TNP_RECTDESTINATION
                    | DWM_TNP_VISIBLE
                    | DWM_TNP_OPACITY
                    | DWM_TNP_SOURCECLIENTAREAONLY,
                rcDestination: RECT {
                    left,
                    top: 0,
                    right: left + width,
                    bottom: height,
                },
                opacity: 255,
                fVisible: true.into(),
                fSourceClientAreaOnly: false.into(),
                ..Default::default()
            };
            if let Some(source) = source {
                properties.dwFlags |= DWM_TNP_RECTSOURCE;
                properties.rcSource = source;
            }

            unsafe { DwmUpdateThumbnailProperties(self.0, &properties) }
        }

        fn hide(&self) -> Result<()> {
            let properties = DWM_THUMBNAIL_PROPERTIES {
                dwFlags: DWM_TNP_VISIBLE,
                fVisible: false.into(),
                ..Default::default()
            };
            unsafe { DwmUpdateThumbnailProperties(self.0, &properties) }
        }

        fn update_source_and_show(&self, source: RECT) -> Result<()> {
            let properties = DWM_THUMBNAIL_PROPERTIES {
                dwFlags: DWM_TNP_RECTSOURCE | DWM_TNP_VISIBLE,
                rcSource: source,
                fVisible: true.into(),
                ..Default::default()
            };
            unsafe { DwmUpdateThumbnailProperties(self.0, &properties) }
        }
    }

    impl Drop for Thumbnail {
        fn drop(&mut self) {
            if let Err(error) = unsafe { DwmUnregisterThumbnail(self.0) } {
                eprintln!("taskbar DWM thumbnail cleanup failed: {error:?}");
            }
        }
    }

    struct ReflowController<'a> {
        taskbar: HWND,
        destination: HWND,
        thumbnail: &'a Thumbnail,
        current_crop: RECT,
        visible: bool,
    }

    impl<'a> ReflowController<'a> {
        fn new(
            taskbar: HWND,
            destination: HWND,
            thumbnail: &'a Thumbnail,
            current_crop: RECT,
        ) -> Self {
            Self {
                taskbar,
                destination,
                thumbnail,
                current_crop,
                visible: true,
            }
        }

        fn start(&self) -> Result<()> {
            let timer = unsafe {
                SetTimer(
                    Some(self.destination),
                    REFLOW_TIMER_ID,
                    REFLOW_POLL_MILLISECONDS,
                    None,
                )
            };
            if timer == 0 {
                return Err(Error::from_win32());
            }
            println!(
                "taskbar_reflow_tracking=periodic_uia poll_interval_ms:{REFLOW_POLL_MILLISECONDS}"
            );
            Ok(())
        }

        fn check(&mut self) -> Result<()> {
            let started = Instant::now();
            let taskbar_frame = extended_frame_bounds(self.taskbar)?;

            match discover_teams_button(self.taskbar, taskbar_frame, false) {
                Ok(source_crop) => {
                    let changed = !rects_equal(self.current_crop, source_crop);
                    if changed || !self.visible {
                        self.thumbnail.hide()?;
                        self.thumbnail.update_source_and_show(source_crop)?;
                        println!(
                            "taskbar_reflow_refreshed=poll_interval_ms:{REFLOW_POLL_MILLISECONDS} update_elapsed_ms:{} old:{},{},{},{} new:{},{},{},{} changed:{changed}",
                            started.elapsed().as_millis(),
                            self.current_crop.left,
                            self.current_crop.top,
                            self.current_crop.right,
                            self.current_crop.bottom,
                            source_crop.left,
                            source_crop.top,
                            source_crop.right,
                            source_crop.bottom,
                        );
                        self.current_crop = source_crop;
                        self.visible = true;
                    }
                }
                Err(error) => {
                    if self.visible {
                        self.thumbnail.hide()?;
                        self.visible = false;
                        eprintln!(
                            "taskbar_reflow_unavailable=poll_interval_ms:{REFLOW_POLL_MILLISECONDS} update_elapsed_ms:{} error:{error:?}",
                            started.elapsed().as_millis()
                        );
                    }
                }
            }

            Ok(())
        }
    }

    fn rects_equal(left: RECT, right: RECT) -> bool {
        left.left == right.left
            && left.top == right.top
            && left.right == right.right
            && left.bottom == right.bottom
    }

    struct ComApartment;

    impl ComApartment {
        fn initialize() -> Result<Self> {
            unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok()? };
            Ok(Self)
        }
    }

    impl Drop for ComApartment {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }

    #[derive(Clone, Copy)]
    struct TeamsButtonCandidate {
        bounds: RECT,
        name_match: bool,
        identity_match: bool,
        button_control: bool,
        name_length: usize,
        automation_id_length: usize,
    }

    #[derive(Clone, Copy, PartialEq, Eq)]
    enum ProbeMode {
        WholeTaskbar,
        TeamsStaticCrop,
        TeamsTrackedCrop,
    }

    impl ProbeMode {
        fn label(self) -> &'static str {
            match self {
                Self::WholeTaskbar => "whole_taskbar",
                Self::TeamsStaticCrop => "teams_static_crop",
                Self::TeamsTrackedCrop => "teams_tracked_crop",
            }
        }
    }

    unsafe extern "system" fn window_proc(
        window: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if message == WM_DESTROY {
            unsafe { PostQuitMessage(0) };
            return LRESULT(0);
        }

        unsafe { DefWindowProcW(window, message, wparam, lparam) }
    }
}
