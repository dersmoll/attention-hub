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
    use std::{
        collections::BTreeMap,
        ffi::c_void,
        time::{Duration, Instant},
    };

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
                    CUIAutomation, IUIAutomation, IUIAutomationElement, TreeScope_Descendants,
                    UIA_ButtonControlTypeId,
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
    const REDISCOVERY_INTERVAL: Duration = Duration::from_secs(1);
    const REFLOW_POLL_MILLISECONDS: u32 = 100;
    const REFLOW_TIMER_ID: usize = 1;
    const RUNTIME_METRICS_INTERVAL: Duration = Duration::from_secs(60);
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

        let _apartment = if mode != ProbeMode::WholeTaskbar {
            Some(ComApartment::initialize()?)
        } else {
            None
        };
        let automation = if mode != ProbeMode::WholeTaskbar {
            Some(unsafe {
                CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_INPROC_SERVER)?
            })
        } else {
            None
        };
        let taskbar = unsafe { FindWindowW(w!("Shell_TrayWnd"), None)? };
        let taskbar_frame = extended_frame_bounds(taskbar)?;
        let teams_button = match mode {
            ProbeMode::WholeTaskbar => None,
            ProbeMode::TeamsStaticCrop | ProbeMode::TeamsTrackedCrop => {
                Some(discover_teams_button(
                    automation
                        .as_ref()
                        .expect("Teams modes require UI Automation"),
                    taskbar,
                    taskbar_frame,
                    true,
                )?)
            }
        };
        let source_crop = teams_button.as_ref().map(|button| button.source_crop);
        let destination = create_destination_window()?;
        let mut thumbnail = Some(Thumbnail::register(destination, taskbar)?);
        let source_size = thumbnail
            .as_ref()
            .expect("newly registered thumbnail must exist")
            .source_size()?;

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
        thumbnail
            .as_ref()
            .expect("newly registered thumbnail must exist")
            .show_source(
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
                thumbnail
                    .take()
                    .expect("tracked mode requires a registered thumbnail"),
                automation
                    .as_ref()
                    .expect("tracked mode requires UI Automation"),
                teams_button.expect("tracked mode requires a Teams button"),
                (destination_size.0 - thumbnail_size.0) / 2,
                thumbnail_size.0,
                thumbnail_size.1,
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
        automation: &IUIAutomation,
        taskbar: HWND,
        taskbar_frame: RECT,
        log_details: bool,
    ) -> Result<TeamsButtonDiscovery> {
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
                element: element.clone(),
                bounds,
                name_match: false,
                identity_match: false,
                button_control: false,
                name_length: 0,
                automation_id_length: 0,
            });
            if button_control && (!candidate.button_control || identity_match) {
                candidate.element = element;
            }
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
                .filter(|candidate| candidate.identity_match && candidate.button_control)
                .cloned(),
        )
        .or_else(|| {
            unique_candidate(
                candidates
                    .values()
                    .filter(|candidate| candidate.identity_match)
                    .cloned(),
            )
        })
        .or_else(|| {
            unique_candidate(
                candidates
                    .values()
                    .filter(|candidate| candidate.name_match && candidate.button_control)
                    .cloned(),
            )
        })
        .or_else(|| unique_candidate(candidates.values().cloned()))
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

        Ok(TeamsButtonDiscovery {
            element: selected.element,
            source_crop: source_rect,
        })
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

    struct Thumbnail {
        id: isize,
        suppress_cleanup_error: bool,
    }

    impl Thumbnail {
        fn register(destination: HWND, source: HWND) -> Result<Self> {
            unsafe {
                DwmRegisterThumbnail(destination, source).map(|id| Self {
                    id,
                    suppress_cleanup_error: false,
                })
            }
        }

        fn source_size(&self) -> Result<windows::Win32::Foundation::SIZE> {
            unsafe { DwmQueryThumbnailSourceSize(self.id) }
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

            unsafe { DwmUpdateThumbnailProperties(self.id, &properties) }
        }

        fn hide(&self) -> Result<()> {
            let properties = DWM_THUMBNAIL_PROPERTIES {
                dwFlags: DWM_TNP_VISIBLE,
                fVisible: false.into(),
                ..Default::default()
            };
            unsafe { DwmUpdateThumbnailProperties(self.id, &properties) }
        }

        fn update_source_and_show(&self, source: RECT) -> Result<()> {
            let properties = DWM_THUMBNAIL_PROPERTIES {
                dwFlags: DWM_TNP_RECTSOURCE | DWM_TNP_VISIBLE,
                rcSource: source,
                fVisible: true.into(),
                ..Default::default()
            };
            unsafe { DwmUpdateThumbnailProperties(self.id, &properties) }
        }

        fn suppress_cleanup_error(&mut self) {
            self.suppress_cleanup_error = true;
        }
    }

    impl Drop for Thumbnail {
        fn drop(&mut self) {
            if let Err(error) = unsafe { DwmUnregisterThumbnail(self.id) } {
                if !self.suppress_cleanup_error {
                    eprintln!("taskbar DWM thumbnail cleanup failed: {error:?}");
                }
            }
        }
    }

    struct ReflowController<'a> {
        automation: &'a IUIAutomation,
        taskbar: HWND,
        destination: HWND,
        thumbnail: Option<Thumbnail>,
        teams_element: Option<IUIAutomationElement>,
        current_crop: Option<RECT>,
        destination_left: i32,
        destination_width: i32,
        destination_height: i32,
        visible: bool,
        unavailable_logged: bool,
        last_rediscovery: Instant,
        metrics: RuntimeMetrics,
    }

    impl<'a> ReflowController<'a> {
        #[allow(clippy::too_many_arguments)]
        fn new(
            taskbar: HWND,
            destination: HWND,
            thumbnail: Thumbnail,
            automation: &'a IUIAutomation,
            teams_button: TeamsButtonDiscovery,
            destination_left: i32,
            destination_width: i32,
            destination_height: i32,
        ) -> Self {
            Self {
                automation,
                taskbar,
                destination,
                thumbnail: Some(thumbnail),
                teams_element: Some(teams_button.element),
                current_crop: Some(teams_button.source_crop),
                destination_left,
                destination_width,
                destination_height,
                visible: true,
                unavailable_logged: false,
                last_rediscovery: Instant::now(),
                metrics: RuntimeMetrics::new(),
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
                "taskbar_reflow_tracking=cached_uia poll_interval_ms:{REFLOW_POLL_MILLISECONDS} rediscovery_interval_ms:{} metrics_interval_ms:{} process_id:{}",
                REDISCOVERY_INTERVAL.as_millis(),
                RUNTIME_METRICS_INTERVAL.as_millis(),
                std::process::id()
            );
            Ok(())
        }

        fn check(&mut self) -> Result<()> {
            let started = Instant::now();
            let mut used_rediscovery = false;

            let current_taskbar = match unsafe { FindWindowW(w!("Shell_TrayWnd"), None) } {
                Ok(taskbar) => taskbar,
                Err(error) => {
                    self.mark_unavailable("taskbar_absent", &error);
                    self.finish_check(started, used_rediscovery);
                    return Ok(());
                }
            };

            if current_taskbar.0 != self.taskbar.0 {
                self.rebind_taskbar(current_taskbar);
            }

            let taskbar_frame = match extended_frame_bounds(self.taskbar) {
                Ok(frame) => frame,
                Err(error) => {
                    self.mark_unavailable("taskbar_frame", &error);
                    self.finish_check(started, used_rediscovery);
                    return Ok(());
                }
            };

            let cached_crop = self
                .teams_element
                .as_ref()
                .map(|element| source_crop_for_element(element, taskbar_frame))
                .transpose();

            match cached_crop {
                Ok(Some(source_crop)) => {
                    if let Err(error) = self.apply_crop(source_crop, started) {
                        self.invalidate_thumbnail();
                        self.mark_unavailable("dwm_update", &error);
                    }
                }
                Ok(None) => {
                    if self.last_rediscovery.elapsed() >= REDISCOVERY_INTERVAL {
                        used_rediscovery = true;
                        self.rediscover(taskbar_frame, started)?;
                    }
                }
                Err(error) => {
                    self.teams_element = None;
                    self.mark_unavailable("cached_element", &error);
                }
            }

            self.finish_check(started, used_rediscovery);
            Ok(())
        }

        fn rediscover(&mut self, taskbar_frame: RECT, started: Instant) -> Result<()> {
            self.last_rediscovery = Instant::now();
            match discover_teams_button(self.automation, self.taskbar, taskbar_frame, false) {
                Ok(button) => {
                    self.teams_element = Some(button.element);
                    match self.apply_crop(button.source_crop, started) {
                        Ok(()) => println!(
                            "taskbar_reflow_recovered=source:full_rediscovery elapsed_ms:{}",
                            started.elapsed().as_millis()
                        ),
                        Err(error) => {
                            self.invalidate_thumbnail();
                            self.mark_unavailable("dwm_rebind", &error);
                        }
                    }
                }
                Err(error) => self.mark_unavailable("rediscovery", &error),
            }
            Ok(())
        }

        fn apply_crop(&mut self, source_crop: RECT, started: Instant) -> Result<()> {
            let changed = self
                .current_crop
                .map(|current| !rects_equal(current, source_crop))
                .unwrap_or(true);
            if !changed && self.visible {
                return Ok(());
            }

            let newly_registered = self.ensure_thumbnail(source_crop)?;
            if !newly_registered {
                let thumbnail = self
                    .thumbnail
                    .as_ref()
                    .expect("ensure_thumbnail must register a thumbnail");
                if self.visible {
                    thumbnail.hide()?;
                }
                thumbnail.update_source_and_show(source_crop)?;
            }

            if let Some(old_crop) = self.current_crop {
                println!(
                    "taskbar_reflow_refreshed=poll_interval_ms:{REFLOW_POLL_MILLISECONDS} update_elapsed_ms:{} old:{},{},{},{} new:{},{},{},{} changed:{changed}",
                    started.elapsed().as_millis(),
                    old_crop.left,
                    old_crop.top,
                    old_crop.right,
                    old_crop.bottom,
                    source_crop.left,
                    source_crop.top,
                    source_crop.right,
                    source_crop.bottom,
                );
            }
            self.current_crop = Some(source_crop);
            self.visible = true;
            self.unavailable_logged = false;
            Ok(())
        }

        fn ensure_thumbnail(&mut self, source_crop: RECT) -> Result<bool> {
            if self.thumbnail.is_some() {
                return Ok(false);
            }
            let thumbnail = Thumbnail::register(self.destination, self.taskbar)?;
            let source_size = thumbnail.source_size()?;
            if source_size.cx <= 0 || source_size.cy <= 0 {
                return Err(Error::new(
                    E_FAIL,
                    "DWM returned an invalid taskbar thumbnail source size",
                ));
            }
            thumbnail.show_source(
                Some(source_crop),
                self.destination_left,
                self.destination_width,
                self.destination_height,
            )?;
            self.thumbnail = Some(thumbnail);
            println!("taskbar_reflow_source=rebound");
            Ok(true)
        }

        fn rebind_taskbar(&mut self, taskbar: HWND) {
            self.invalidate_thumbnail();
            self.taskbar = taskbar;
            self.teams_element = None;
            self.current_crop = None;
            self.visible = false;
            self.unavailable_logged = false;
            self.last_rediscovery = Instant::now() - REDISCOVERY_INTERVAL;
            println!("taskbar_reflow_taskbar=changed");
        }

        fn invalidate_thumbnail(&mut self) {
            if let Some(mut thumbnail) = self.thumbnail.take() {
                let _ = thumbnail.hide();
                thumbnail.suppress_cleanup_error();
            }
        }

        fn mark_unavailable(&mut self, reason: &str, error: &Error) {
            if let Some(thumbnail) = self.thumbnail.as_ref() {
                let _ = thumbnail.hide();
            }
            self.visible = false;
            if !self.unavailable_logged {
                eprintln!("taskbar_reflow_unavailable=reason:{reason} error:{error:?}");
                self.unavailable_logged = true;
            }
        }

        fn finish_check(&mut self, started: Instant, used_rediscovery: bool) {
            self.metrics.record(started.elapsed(), used_rediscovery);
            self.metrics.maybe_log();
        }
    }

    struct RuntimeMetrics {
        window_started: Instant,
        checks: u64,
        rediscoveries: u64,
        total_check_time: Duration,
        maximum_check_time: Duration,
    }

    impl RuntimeMetrics {
        fn new() -> Self {
            Self {
                window_started: Instant::now(),
                checks: 0,
                rediscoveries: 0,
                total_check_time: Duration::ZERO,
                maximum_check_time: Duration::ZERO,
            }
        }

        fn record(&mut self, elapsed: Duration, used_rediscovery: bool) {
            self.checks = self.checks.saturating_add(1);
            self.rediscoveries = self
                .rediscoveries
                .saturating_add(u64::from(used_rediscovery));
            self.total_check_time = self.total_check_time.saturating_add(elapsed);
            self.maximum_check_time = self.maximum_check_time.max(elapsed);
        }

        fn maybe_log(&mut self) {
            let window = self.window_started.elapsed();
            if window < RUNTIME_METRICS_INTERVAL {
                return;
            }
            let average_check_microseconds = if self.checks == 0 {
                0
            } else {
                self.total_check_time.as_micros() / u128::from(self.checks)
            };
            println!(
                "taskbar_runtime_metrics=window_ms:{} checks:{} rediscoveries:{} average_check_us:{average_check_microseconds} maximum_check_us:{}",
                window.as_millis(),
                self.checks,
                self.rediscoveries,
                self.maximum_check_time.as_micros()
            );
            *self = Self::new();
        }
    }

    fn rects_equal(left: RECT, right: RECT) -> bool {
        left.left == right.left
            && left.top == right.top
            && left.right == right.right
            && left.bottom == right.bottom
    }

    fn source_crop_for_element(
        element: &IUIAutomationElement,
        taskbar_frame: RECT,
    ) -> Result<RECT> {
        let bounds = unsafe { element.CurrentBoundingRectangle()? };
        let is_offscreen = unsafe { element.CurrentIsOffscreen()? }.as_bool();
        if is_offscreen
            || bounds.right <= bounds.left
            || bounds.bottom <= bounds.top
            || !rect_is_within(bounds, taskbar_frame)
        {
            return Err(Error::new(
                E_FAIL,
                "Cached Teams taskbar element is unavailable",
            ));
        }
        Ok(RECT {
            left: bounds.left - taskbar_frame.left,
            top: bounds.top - taskbar_frame.top,
            right: bounds.right - taskbar_frame.left,
            bottom: bounds.bottom - taskbar_frame.top,
        })
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

    struct TeamsButtonDiscovery {
        element: IUIAutomationElement,
        source_crop: RECT,
    }

    #[derive(Clone)]
    struct TeamsButtonCandidate {
        element: IUIAutomationElement,
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
