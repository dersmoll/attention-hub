//! Windows taskbar DWM thumbnail implementation and manual probe.
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
//! The manual modes never read pixels. The product adapter below reuses the
//! tracked mode behind a narrow lifecycle/status boundary.

use std::{
    sync::{
        atomic::{AtomicBool, AtomicI32, AtomicIsize, Ordering},
        Arc, Mutex,
    },
    thread::JoinHandle,
};

use super::{TaskbarMirrorSource, TaskbarMirrorStatus};

pub struct TaskbarMirrorState {
    teams: MirrorInstance,
    telegram: MirrorInstance,
}

struct MirrorInstance {
    source: TaskbarMirrorSource,
    inner: Mutex<MirrorRuntime>,
    status: Arc<Mutex<TaskbarMirrorStatus>>,
    destination: Arc<AtomicIsize>,
    slot_index: Arc<AtomicI32>,
    visible_source_count: Arc<AtomicI32>,
}

struct MirrorRuntime {
    thread: Option<JoinHandle<()>>,
    cancellation: Option<Arc<AtomicBool>>,
}

impl TaskbarMirrorState {
    pub fn new() -> Self {
        Self {
            teams: MirrorInstance::new(TaskbarMirrorSource::Teams),
            telegram: MirrorInstance::new(TaskbarMirrorSource::Telegram),
        }
    }

    pub fn status(&self, source: TaskbarMirrorSource) -> TaskbarMirrorStatus {
        self.instance(source).status()
    }

    pub fn start(
        &self,
        source: TaskbarMirrorSource,
        owner: isize,
    ) -> Result<TaskbarMirrorStatus, String> {
        self.instance(source).start(owner)
    }

    pub fn stop(&self, source: TaskbarMirrorSource) -> TaskbarMirrorStatus {
        self.instance(source).stop()
    }

    pub fn set_layout(
        &self,
        source: TaskbarMirrorSource,
        slot_index: Option<i32>,
        visible_source_count: i32,
    ) {
        let instance = self.instance(source);
        if let Some(slot_index) = slot_index {
            instance.slot_index.store(slot_index, Ordering::Release);
        }
        instance
            .visible_source_count
            .store(visible_source_count, Ordering::Release);
    }

    pub fn stop_all(&self) {
        let _ = self.teams.stop();
        let _ = self.telegram.stop();
    }

    fn instance(&self, source: TaskbarMirrorSource) -> &MirrorInstance {
        match source {
            TaskbarMirrorSource::Teams => &self.teams,
            TaskbarMirrorSource::Telegram => &self.telegram,
        }
    }
}

impl Drop for TaskbarMirrorState {
    fn drop(&mut self) {
        self.stop_all();
    }
}

impl MirrorInstance {
    fn new(source: TaskbarMirrorSource) -> Self {
        Self {
            source,
            inner: Mutex::new(MirrorRuntime {
                thread: None,
                cancellation: None,
            }),
            status: Arc::new(Mutex::new(TaskbarMirrorStatus::stopped(source))),
            destination: Arc::new(AtomicIsize::new(0)),
            slot_index: Arc::new(AtomicI32::new(source.slot_index())),
            visible_source_count: Arc::new(AtomicI32::new(3)),
        }
    }

    fn status(&self) -> TaskbarMirrorStatus {
        self.reap_finished_thread();
        self.status
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    fn start(&self, owner: isize) -> Result<TaskbarMirrorStatus, String> {
        self.reap_finished_thread();
        let mut runtime = self
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if runtime.thread.is_some() {
            return Ok(self.status_value());
        }

        self.update_status(|status| {
            status.lifecycle = "starting".into();
            status.enabled = true;
            status.visible = false;
            status.diagnostic = None;
        });

        let shared_status = Arc::clone(&self.status);
        let startup_cancelled = Arc::new(AtomicBool::new(false));
        self.destination.store(0, Ordering::Release);
        let destination_slot = Arc::clone(&self.destination);
        let slot_index = Arc::clone(&self.slot_index);
        let visible_source_count = Arc::clone(&self.visible_source_count);
        let thread_cancelled = Arc::clone(&startup_cancelled);
        let cancelled_after_run = Arc::clone(&startup_cancelled);
        let source = self.source;
        let thread = match std::thread::Builder::new()
            .name(format!("attention-hub-{}-mirror", source.key()))
            .spawn(move || {
                let result = windows_probe::run_product(
                    source,
                    owner,
                    Arc::clone(&shared_status),
                    thread_cancelled,
                    destination_slot,
                    slot_index,
                    visible_source_count,
                );
                if let Err(error) = result {
                    let mut status = shared_status
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    if cancelled_after_run.load(Ordering::Acquire) {
                        eprintln!(
                            "{} visual mirror startup cancelled: {error:?}",
                            source.display_name()
                        );
                    } else {
                        eprintln!(
                            "{} visual mirror stopped unexpectedly: {error:?}",
                            source.display_name()
                        );
                        status.lifecycle = "error".into();
                        status.enabled = false;
                        status.visible = false;
                        status.diagnostic = Some(format!(
                            "{} visual mirror stopped unexpectedly.",
                            source.display_name()
                        ));
                    }
                } else {
                    let mut status = shared_status
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    status.lifecycle = "stopped".into();
                    status.enabled = false;
                    status.visible = false;
                    status.diagnostic = None;
                }
            }) {
            Ok(thread) => thread,
            Err(error) => {
                let message = format!("Could not start the native mirror thread: {error}");
                self.update_status(|status| {
                    status.lifecycle = "error".into();
                    status.enabled = false;
                    status.visible = false;
                    status.diagnostic = Some(message.clone());
                });
                return Err(message);
            }
        };
        runtime.thread = Some(thread);
        runtime.cancellation = Some(startup_cancelled);
        Ok(self.status_value())
    }

    fn stop(&self) -> TaskbarMirrorStatus {
        let (cancellation, thread) = {
            let mut runtime = self
                .inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            (runtime.cancellation.take(), runtime.thread.take())
        };
        if let Some(cancellation) = cancellation {
            cancellation.store(true, Ordering::Release);
        }
        let destination = self.destination.load(Ordering::Acquire);
        if destination != 0 {
            windows_probe::request_stop(destination);
        }
        if let Some(thread) = thread {
            let _ = thread.join();
        }
        self.destination.store(0, Ordering::Release);
        self.update_status(|status| *status = TaskbarMirrorStatus::stopped(self.source));
        self.status_value()
    }

    fn reap_finished_thread(&self) {
        let finished = {
            let runtime = self
                .inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            runtime
                .thread
                .as_ref()
                .map(JoinHandle::is_finished)
                .unwrap_or(false)
        };
        if finished {
            let thread = {
                let mut runtime = self
                    .inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                runtime.cancellation = None;
                runtime.thread.take()
            };
            if let Some(thread) = thread {
                let _ = thread.join();
            }
            self.destination.store(0, Ordering::Release);
        }
    }

    fn update_status(&self, update: impl FnOnce(&mut TaskbarMirrorStatus)) {
        let mut status = self
            .status
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        update(&mut status);
    }

    fn status_value(&self) -> TaskbarMirrorStatus {
        self.status
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }
}

pub fn run_manual_probe() {
    if let Err(error) = windows_probe::run() {
        eprintln!("taskbar DWM probe failed: {error:?}");
        std::process::exit(1);
    }
}

pub fn activate_source(source: super::AttentionAppSource) -> Result<(), String> {
    windows_probe::activate_source(source)
        .map_err(|error| format!("Could not activate {}: {error}", source.display_name()))
}

mod windows_probe {
    use std::{
        collections::BTreeMap,
        ffi::c_void,
        path::Path,
        sync::{
            atomic::{AtomicBool, AtomicI32, AtomicIsize, Ordering},
            Arc, Mutex,
        },
        time::{Duration, Instant},
    };

    use crate::teams_mirror::{AttentionAppSource, TaskbarMirrorSource, TaskbarMirrorStatus};
    use windows::{
        core::{w, Error, Result, BOOL, PCWSTR, PWSTR},
        Win32::{
            Foundation::{
                CloseHandle, GetLastError, COLORREF, ERROR_CLASS_ALREADY_EXISTS, HANDLE, HINSTANCE,
                HWND, LPARAM, LRESULT, RECT, WPARAM,
            },
            Graphics::{
                Dwm::{
                    DwmGetWindowAttribute, DwmQueryThumbnailSourceSize, DwmRegisterThumbnail,
                    DwmUnregisterThumbnail, DwmUpdateThumbnailProperties,
                    DWMWA_EXTENDED_FRAME_BOUNDS, DWM_THUMBNAIL_PROPERTIES, DWM_TNP_OPACITY,
                    DWM_TNP_RECTDESTINATION, DWM_TNP_RECTSOURCE, DWM_TNP_SOURCECLIENTAREAONLY,
                    DWM_TNP_VISIBLE,
                },
                Gdi::{
                    CreateRoundRectRgn, CreateSolidBrush, DeleteObject, MonitorFromWindow,
                    SetWindowRgn, HBRUSH, HGDIOBJ, HMONITOR, MONITOR_DEFAULTTONEAREST,
                },
            },
            System::{
                Com::{
                    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
                    COINIT_MULTITHREADED,
                },
                LibraryLoader::GetModuleHandleW,
                Threading::{
                    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
                    PROCESS_QUERY_LIMITED_INFORMATION,
                },
            },
            UI::{
                Accessibility::{
                    CUIAutomation, IUIAutomation, IUIAutomationElement, TreeScope_Descendants,
                    UIA_ButtonControlTypeId,
                },
                HiDpi::{
                    AreDpiAwarenessContextsEqual, GetDpiForWindow, GetThreadDpiAwarenessContext,
                    SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
                },
                WindowsAndMessaging::{
                    AdjustWindowRectEx, CreateWindowExW, DefWindowProcW, DestroyWindow,
                    DispatchMessageW, EnumWindows, FindWindowW, GetClassNameW, GetForegroundWindow,
                    GetMessageW, GetSystemMetrics, GetWindow, GetWindowLongPtrW, GetWindowRect,
                    GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible, LoadCursorW,
                    PostMessageW, PostQuitMessage, RegisterClassW, SetForegroundWindow, SetTimer,
                    SetWindowPos, ShowWindow, TranslateMessage, CS_HREDRAW, CS_VREDRAW,
                    CW_USEDEFAULT, GWL_EXSTYLE, GW_OWNER, IDC_HAND, MSG, SM_CXSCREEN, SM_CYSCREEN,
                    SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOZORDER, SW_HIDE, SW_RESTORE,
                    SW_SHOWNOACTIVATE, SW_SHOWNORMAL, WINDOW_EX_STYLE, WM_CLOSE, WM_DESTROY,
                    WM_LBUTTONUP, WM_TIMER, WNDCLASSW, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
                    WS_OVERLAPPEDWINDOW, WS_POPUP,
                },
            },
        },
    };

    const E_FAIL: windows::core::HRESULT = windows::core::HRESULT(0x8000_4005_u32 as i32);
    const MINIMUM_WINDOW_CLIENT_WIDTH: i32 = 320;
    const WIDGET_ICON_LOGICAL_SIZE: i32 = 48;
    const WIDGET_LEFT_PANEL_LOGICAL_WIDTH: i32 = 304;
    const WIDGET_MIRROR_LOGICAL_SIZE: i32 = 40;
    const WIDGET_MIRROR_LOGICAL_INSET: i32 = 4;
    const WIDGET_MIRROR_LOGICAL_RADIUS: i32 = 8;
    const WIDGET_ICON_GAP: i32 = 8;
    const WIDGET_ICON_TOP: i32 = 16;
    const NOTIFICATION_AREA_AUTOMATION_ID: &str = "NotifyItemIcon";
    const REDISCOVERY_INTERVAL: Duration = Duration::from_secs(1);
    const REFLOW_POLL_MILLISECONDS: u32 = 100;
    const REFLOW_TIMER_ID: usize = 1;
    const RUNTIME_METRICS_INTERVAL: Duration = Duration::from_secs(60);
    const TEAMS_CROP_ARGUMENT: &str = "--teams-crop";
    const TRACK_REFLOW_ARGUMENT: &str = "--track-reflow";
    const WINDOW_CLASS: windows::core::PCWSTR = w!("AttentionHub.TaskbarDwmProbe");
    const WINDOW_TITLE: windows::core::PCWSTR = w!("Attention Hub - taskbar DWM probe");
    const TEAMS_PRODUCT_WINDOW_TITLE: windows::core::PCWSTR = w!("Attention Hub - Teams visual");
    const TELEGRAM_PRODUCT_WINDOW_TITLE: windows::core::PCWSTR =
        w!("Attention Hub - Telegram visual");
    const PRIMARY_TASKBAR_CLASS: &str = "Shell_TrayWnd";
    const SECONDARY_TASKBAR_CLASS: &str = "Shell_SecondaryTrayWnd";
    const TELEGRAM_EXECUTABLE: &str = "telegram.exe";
    const OUTLOOK_EXECUTABLE: &str = "olk.exe";

    pub fn run() -> Result<()> {
        let arguments = std::env::args().collect::<Vec<_>>();
        let mode = if arguments
            .iter()
            .any(|argument| argument == TRACK_REFLOW_ARGUMENT)
        {
            ProbeMode::TrackedCrop(TaskbarMirrorSource::Teams)
        } else if arguments
            .iter()
            .any(|argument| argument == TEAMS_CROP_ARGUMENT)
        {
            ProbeMode::TeamsStaticCrop
        } else {
            ProbeMode::WholeTaskbar
        };

        run_mode(mode, None, None, None, None, None, None)
    }

    pub fn run_product(
        source: TaskbarMirrorSource,
        owner: isize,
        status: Arc<Mutex<TaskbarMirrorStatus>>,
        startup_cancelled: Arc<AtomicBool>,
        destination_slot: Arc<AtomicIsize>,
        slot_index: Arc<AtomicI32>,
        visible_source_count: Arc<AtomicI32>,
    ) -> Result<()> {
        let result = run_mode(
            ProbeMode::TrackedCrop(source),
            Some(HWND(owner as *mut c_void)),
            Some(status),
            Some(startup_cancelled.as_ref()),
            Some(destination_slot.as_ref()),
            Some(slot_index.as_ref()),
            Some(visible_source_count.as_ref()),
        );
        match result {
            Ok(()) => Ok(()),
            Err(error) => {
                let destination = destination_slot.swap(0, Ordering::AcqRel);
                if destination != 0 {
                    let _ = unsafe { DestroyWindow(HWND(destination as *mut c_void)) };
                }
                eprintln!(
                    "{} visual mirror native failure: {error:?}",
                    source.display_name()
                );
                Err(error)
            }
        }
    }

    pub fn request_stop(destination: isize) {
        let destination = HWND(destination as *mut c_void);
        let _ = unsafe { PostMessageW(Some(destination), WM_CLOSE, WPARAM(0), LPARAM(0)) };
    }

    fn run_mode(
        mode: ProbeMode,
        owner: Option<HWND>,
        status: Option<Arc<Mutex<TaskbarMirrorStatus>>>,
        startup_cancelled: Option<&AtomicBool>,
        destination_slot: Option<&AtomicIsize>,
        slot_index: Option<&AtomicI32>,
        visible_source_count: Option<&AtomicI32>,
    ) -> Result<()> {
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
        let (taskbar, taskbar_frame, source_button, taskbar_count, taskbar_monitor) = match mode {
            ProbeMode::WholeTaskbar => {
                let taskbar = unsafe { FindWindowW(w!("Shell_TrayWnd"), None)? };
                (
                    taskbar,
                    extended_frame_bounds(taskbar)?,
                    None,
                    1,
                    monitor_descriptor(taskbar),
                )
            }
            ProbeMode::TeamsStaticCrop => {
                let taskbar = unsafe { FindWindowW(w!("Shell_TrayWnd"), None)? };
                let taskbar_frame = extended_frame_bounds(taskbar)?;
                let _uia_guard = crate::uia_gate::lock_priority();
                let button = discover_taskbar_button(
                    automation
                        .as_ref()
                        .expect("crop modes require UI Automation"),
                    taskbar,
                    taskbar_frame,
                    TaskbarMirrorSource::Teams,
                    true,
                )?;
                (
                    taskbar,
                    taskbar_frame,
                    Some(button),
                    1,
                    monitor_descriptor(taskbar),
                )
            }
            ProbeMode::TrackedCrop(source) => {
                let _uia_guard = crate::uia_gate::lock_priority();
                let selection = select_taskbar_for_source(
                    automation
                        .as_ref()
                        .expect("crop modes require UI Automation"),
                    source,
                    true,
                )?;
                (
                    selection.taskbar,
                    selection.taskbar_frame,
                    Some(selection.button),
                    selection.taskbar_count,
                    Some(selection.monitor),
                )
            }
        };
        let source_crop = source_button.as_ref().map(|button| button.source_crop);
        if startup_cancelled.is_some_and(|cancelled| cancelled.load(Ordering::Acquire)) {
            return Err(Error::new(
                E_FAIL,
                "Taskbar visual mirror startup was cancelled",
            ));
        }
        let destination = create_destination_window(
            owner,
            match mode {
                ProbeMode::TrackedCrop(TaskbarMirrorSource::Teams) if owner.is_some() => {
                    TEAMS_PRODUCT_WINDOW_TITLE
                }
                ProbeMode::TrackedCrop(TaskbarMirrorSource::Telegram) if owner.is_some() => {
                    TELEGRAM_PRODUCT_WINDOW_TITLE
                }
                _ => WINDOW_TITLE,
            },
            owner.is_some(),
        )?;
        if let Some(destination_slot) = destination_slot {
            destination_slot.store(destination.0 as isize, Ordering::Release);
        }
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
        let destination_size = if let (Some(owner), ProbeMode::TrackedCrop(source)) = (owner, mode)
        {
            let size = position_widget_destination(
                destination,
                owner,
                source,
                slot_index,
                visible_source_count,
            )?;
            mask_mirror_window(destination, size)?;
            size
        } else {
            let destination_size = (
                thumbnail_size.0.max(MINIMUM_WINDOW_CLIENT_WIDTH),
                thumbnail_size.1,
            );
            resize_destination(destination, destination_size.0, destination_size.1)?;
            destination_size
        };
        let fitted_thumbnail = fit_within(
            rendered_source_size.0,
            rendered_source_size.1,
            destination_size.0,
            destination_size.1,
        );
        thumbnail
            .as_ref()
            .expect("newly registered thumbnail must exist")
            .show_source(
                source_crop,
                (destination_size.0 - fitted_thumbnail.0) / 2,
                (destination_size.1 - fitted_thumbnail.1) / 2,
                fitted_thumbnail.0,
                fitted_thumbnail.1,
            )?;

        println!("probe_mode={}", mode.label());
        println!("taskbar_scope=auto taskbar_count={taskbar_count}");
        println!(
            "taskbar_monitor={}",
            taskbar_monitor.as_deref().unwrap_or("unknown")
        );
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

        let reflow_controller = if let ProbeMode::TrackedCrop(source) = mode {
            let controller = ReflowController::new(
                source,
                owner,
                taskbar,
                destination,
                thumbnail
                    .take()
                    .expect("tracked mode requires a registered thumbnail"),
                automation
                    .as_ref()
                    .expect("tracked mode requires UI Automation"),
                source_button.expect("tracked mode requires a taskbar button"),
                (destination_size.0 - fitted_thumbnail.0) / 2,
                (destination_size.1 - fitted_thumbnail.1) / 2,
                fitted_thumbnail.0,
                fitted_thumbnail.1,
                taskbar_count,
                taskbar_monitor.clone(),
                status.clone(),
                slot_index,
                visible_source_count,
            );
            controller.start()?;
            Some(controller)
        } else {
            None
        };

        if startup_cancelled.is_some_and(|cancelled| cancelled.load(Ordering::Acquire)) {
            return Err(Error::new(
                E_FAIL,
                "Taskbar visual mirror startup was cancelled",
            ));
        }

        unsafe {
            let _ = ShowWindow(
                destination,
                if owner.is_some() {
                    SW_SHOWNOACTIVATE
                } else {
                    SW_SHOWNORMAL
                },
            );
        }
        if let Some(status) = status.as_ref() {
            let mut status = status
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            status.lifecycle = "running".into();
            status.enabled = true;
            status.visible = true;
            status.taskbar_count = taskbar_count;
            status.taskbar_monitor = taskbar_monitor;
            status.diagnostic = None;
        }
        run_message_loop(reflow_controller)?;
        if let Some(destination_slot) = destination_slot {
            destination_slot.store(0, Ordering::Release);
        }

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

    pub fn activate_source(source: AttentionAppSource) -> Result<()> {
        let window = preferred_source_window(source)?.ok_or_else(|| {
            Error::new(
                E_FAIL,
                format!("No running {} window is available", source.display_name()),
            )
        })?;

        if unsafe { IsIconic(window) }.as_bool() {
            unsafe {
                let _ = ShowWindow(window, SW_RESTORE);
            }
        }
        if !unsafe { SetForegroundWindow(window) }.as_bool() {
            return Err(Error::new(
                E_FAIL,
                format!(
                    "Windows did not allow {} to enter the foreground",
                    source.display_name()
                ),
            ));
        }
        Ok(())
    }

    fn select_taskbar_for_source(
        automation: &IUIAutomation,
        source: TaskbarMirrorSource,
        log_details: bool,
    ) -> Result<TaskbarSelection> {
        let (taskbars, preferred_monitor) = ordered_taskbars_for_source(source)?;
        let taskbar_count = taskbars.len() as u32;

        if log_details {
            println!(
                "{}_taskbar_surface_count={} preferred_monitor_available={}",
                source.key(),
                taskbar_count,
                preferred_monitor.is_some()
            );
        }

        let mut last_error = None;
        for surface in taskbars {
            match discover_taskbar_button(
                automation,
                surface.window,
                surface.frame,
                source,
                log_details,
            ) {
                Ok(button) => {
                    if log_details {
                        println!(
                            "{}_taskbar_selected=primary:{} monitor:{}",
                            source.key(),
                            surface.primary,
                            surface.monitor_label
                        );
                    }
                    return Ok(TaskbarSelection {
                        taskbar: surface.window,
                        taskbar_frame: surface.frame,
                        button,
                        taskbar_count,
                        monitor: surface.monitor_label,
                        preferred_monitor,
                    });
                }
                Err(error) => last_error = Some(error),
            }
        }

        Err(last_error.unwrap_or_else(|| {
            Error::new(
                E_FAIL,
                format!(
                    "No taskbar surface is available for {}",
                    source.display_name()
                ),
            )
        }))
    }

    fn ordered_taskbars_for_source(
        source: TaskbarMirrorSource,
    ) -> Result<(Vec<TaskbarSurface>, Option<HMONITOR>)> {
        let mut taskbars = enumerate_taskbars()?;
        let preferred_monitor = preferred_source_window(source.app_source())?
            .map(|window| unsafe { MonitorFromWindow(window, MONITOR_DEFAULTTONEAREST) });
        taskbars.sort_by_key(|surface| {
            if preferred_monitor.is_some_and(|monitor| monitor.0 == surface.monitor.0) {
                0
            } else if surface.primary {
                1
            } else {
                2
            }
        });
        Ok((taskbars, preferred_monitor))
    }

    fn enumerate_taskbars() -> Result<Vec<TaskbarSurface>> {
        let mut surfaces = Vec::new();
        for window in enumerate_top_level_windows()? {
            let class_name = window_class_name(window);
            let primary = class_name == PRIMARY_TASKBAR_CLASS;
            if !primary && class_name != SECONDARY_TASKBAR_CLASS {
                continue;
            }
            let frame = match extended_frame_bounds(window) {
                Ok(frame) => frame,
                Err(_) => continue,
            };
            let monitor = unsafe { MonitorFromWindow(window, MONITOR_DEFAULTTONEAREST) };
            surfaces.push(TaskbarSurface {
                window,
                frame,
                monitor,
                monitor_label: monitor_descriptor(window)
                    .unwrap_or_else(|| "unknown taskbar".into()),
                primary,
            });
        }
        if surfaces.is_empty() {
            return Err(Error::new(E_FAIL, "No Windows taskbar surface was found"));
        }
        Ok(surfaces)
    }

    fn preferred_source_window(source: AttentionAppSource) -> Result<Option<HWND>> {
        let foreground = unsafe { GetForegroundWindow() };
        let mut candidates = Vec::new();
        for window in enumerate_top_level_windows()? {
            if !unsafe { IsWindowVisible(window) }.as_bool() {
                continue;
            }
            let ex_style = unsafe { GetWindowLongPtrW(window, GWL_EXSTYLE) } as u32;
            if ex_style & WS_EX_TOOLWINDOW.0 != 0 {
                continue;
            }
            if unsafe { GetWindow(window, GW_OWNER) }
                .map(|owner| !owner.is_invalid())
                .unwrap_or(false)
            {
                continue;
            }
            let mut process_id = 0_u32;
            unsafe {
                GetWindowThreadProcessId(window, Some(&mut process_id));
            }
            if process_id == 0 {
                continue;
            }
            let executable = match process_executable_name(process_id) {
                Ok(executable) => executable,
                Err(_) => continue,
            };
            if !source_executable_matches(source, &executable) {
                continue;
            }
            let mut bounds = RECT::default();
            if unsafe { GetWindowRect(window, &mut bounds) }.is_err() {
                continue;
            }
            let area = i64::from((bounds.right - bounds.left).max(0))
                .saturating_mul(i64::from((bounds.bottom - bounds.top).max(0)));
            candidates.push((window, area));
        }

        candidates.sort_by_key(|(window, area)| {
            let foreground_rank = u8::from(window.0 != foreground.0);
            (foreground_rank, std::cmp::Reverse(*area))
        });
        Ok(candidates.first().map(|(window, _)| *window))
    }

    fn source_executable_matches(source: AttentionAppSource, executable: &str) -> bool {
        match source {
            AttentionAppSource::Teams => {
                executable.eq_ignore_ascii_case("ms-teams.exe")
                    || executable.eq_ignore_ascii_case("msteams.exe")
            }
            AttentionAppSource::Telegram => executable.eq_ignore_ascii_case(TELEGRAM_EXECUTABLE),
            AttentionAppSource::Outlook => executable.eq_ignore_ascii_case(OUTLOOK_EXECUTABLE),
        }
    }

    fn process_executable_name(process_id: u32) -> Result<String> {
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

    fn enumerate_top_level_windows() -> Result<Vec<HWND>> {
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

    fn monitor_descriptor(window: HWND) -> Option<String> {
        let mut bounds = RECT::default();
        unsafe { GetWindowRect(window, &mut bounds) }.ok()?;
        Some(format!(
            "taskbar@{},{},{},{}",
            bounds.left, bounds.top, bounds.right, bounds.bottom
        ))
    }

    fn discover_taskbar_button(
        automation: &IUIAutomation,
        taskbar: HWND,
        taskbar_frame: RECT,
        source: TaskbarMirrorSource,
        log_details: bool,
    ) -> Result<TaskbarButtonDiscovery> {
        let taskbar_root = unsafe { automation.ElementFromHandle(taskbar)? };
        let condition = unsafe { automation.CreateTrueCondition()? };
        let elements = unsafe { taskbar_root.FindAll(TreeScope_Descendants, &condition)? };
        let length = unsafe { elements.Length()? };
        let mut candidates = BTreeMap::<(i32, i32, i32, i32), TaskbarButtonCandidate>::new();
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
            let name_match = source_name_matches(source, &name);
            let identity_match = source_identity_matches(source, &automation_id);

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
            let candidate = candidates.entry(key).or_insert(TaskbarButtonCandidate {
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
            println!(
                "{}_taskbar_candidate_count={}",
                source.key(),
                candidates.len()
            );
            println!(
                "{}_notification_area_matches_excluded={excluded_notification_area_matches}",
                source.key()
            );
            for (index, candidate) in candidates.values().enumerate() {
                println!(
                    "{}_candidate_{index}=name_match:{} identity_match:{} button_control:{} name_length:{} automation_id_length:{} bounds:{},{},{},{}",
                    source.key(),
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
                format!(
                    "{} taskbar button discovery was absent or ambiguous",
                    source.display_name()
                ),
            )
        })?;

        let source_rect = square_source_crop(
            RECT {
                left: selected.bounds.left - taskbar_frame.left,
                top: selected.bounds.top - taskbar_frame.top,
                right: selected.bounds.right - taskbar_frame.left,
                bottom: selected.bounds.bottom - taskbar_frame.top,
            },
            taskbar_frame.right - taskbar_frame.left,
            taskbar_frame.bottom - taskbar_frame.top,
        );
        if log_details {
            println!(
                "{}_source_crop=left:{} top:{} right:{} bottom:{}",
                source.key(),
                source_rect.left,
                source_rect.top,
                source_rect.right,
                source_rect.bottom
            );
        }

        Ok(TaskbarButtonDiscovery {
            element: selected.element,
            source_crop: source_rect,
        })
    }

    fn source_name_matches(source: TaskbarMirrorSource, value: &str) -> bool {
        let value = value.to_ascii_lowercase();
        match source {
            TaskbarMirrorSource::Teams => value.contains("microsoft teams"),
            TaskbarMirrorSource::Telegram => value.contains("telegram"),
        }
    }

    fn source_identity_matches(source: TaskbarMirrorSource, value: &str) -> bool {
        let value = value.to_ascii_lowercase();
        match source {
            TaskbarMirrorSource::Teams => {
                value.contains("msteams")
                    || value.contains("microsoftteams")
                    || value.contains("microsoft.teams")
            }
            TaskbarMirrorSource::Telegram => value.contains("telegram"),
        }
    }

    fn rect_is_within(candidate: RECT, container: RECT) -> bool {
        candidate.left >= container.left
            && candidate.top >= container.top
            && candidate.right <= container.right
            && candidate.bottom <= container.bottom
    }

    fn unique_candidate(
        mut candidates: impl Iterator<Item = TaskbarButtonCandidate>,
    ) -> Option<TaskbarButtonCandidate> {
        let candidate = candidates.next()?;
        candidates.next().is_none().then_some(candidate)
    }

    fn create_destination_window(
        owner: Option<HWND>,
        title: PCWSTR,
        widget_surface: bool,
    ) -> Result<HWND> {
        let module = unsafe { GetModuleHandleW(None)? };
        let instance = HINSTANCE(module.0);
        let window_class = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(window_proc),
            hInstance: instance,
            hCursor: unsafe { LoadCursorW(None, IDC_HAND)? },
            hbrBackground: HBRUSH(unsafe { CreateSolidBrush(COLORREF(0x0027_1811)) }.0),
            lpszClassName: WINDOW_CLASS,
            ..Default::default()
        };

        if unsafe { RegisterClassW(&window_class) } == 0
            && unsafe { GetLastError() } != ERROR_CLASS_ALREADY_EXISTS
        {
            return Err(Error::from_win32());
        }

        unsafe {
            CreateWindowExW(
                if widget_surface {
                    WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE
                } else {
                    WINDOW_EX_STYLE::default()
                },
                WINDOW_CLASS,
                title,
                if widget_surface {
                    WS_POPUP
                } else {
                    WS_OVERLAPPEDWINDOW
                },
                CW_USEDEFAULT,
                CW_USEDEFAULT,
                1000,
                180,
                owner,
                None,
                Some(instance),
                None,
            )
        }
    }

    fn position_widget_destination(
        window: HWND,
        owner: HWND,
        source: TaskbarMirrorSource,
        slot_index: Option<&AtomicI32>,
        visible_source_count: Option<&AtomicI32>,
    ) -> Result<(i32, i32)> {
        let mut owner_rect = RECT::default();
        unsafe { GetWindowRect(owner, &mut owner_rect)? };
        let dpi = unsafe { GetDpiForWindow(owner) }.max(96) as i32;
        let scale = |value: i32| value.saturating_mul(dpi) / 96;
        let size = scale(WIDGET_MIRROR_LOGICAL_SIZE).max(1);
        let inset = scale(WIDGET_MIRROR_LOGICAL_INSET).max(1);
        let slot_index = slot_index
            .map(|value| value.load(Ordering::Acquire))
            .unwrap_or_else(|| source.slot_index());
        let source_count = visible_source_count
            .map(|value| value.load(Ordering::Acquire))
            .unwrap_or(3)
            .clamp(0, 3);
        let slot_left = widget_slot_left(slot_index, source_count);
        let x = owner_rect.left + scale(slot_left) + inset;
        let y = owner_rect.top + scale(WIDGET_ICON_TOP) + inset;

        unsafe {
            SetWindowPos(
                window,
                None,
                x,
                y,
                size,
                size,
                SWP_NOACTIVATE | SWP_NOZORDER,
            )?
        };
        Ok((size, size))
    }

    fn widget_slot_left(slot_index: i32, visible_source_count: i32) -> i32 {
        let source_count = visible_source_count.clamp(0, 3);
        let app_count = source_count + 1;
        let group_width = app_count * WIDGET_ICON_LOGICAL_SIZE + (app_count - 1) * WIDGET_ICON_GAP;
        let group_left = (WIDGET_LEFT_PANEL_LOGICAL_WIDTH - group_width) / 2;
        group_left + slot_index * (WIDGET_ICON_LOGICAL_SIZE + WIDGET_ICON_GAP)
    }

    fn mask_mirror_window(window: HWND, size: (i32, i32)) -> Result<()> {
        let radius = size
            .0
            .min(size.1)
            .saturating_mul(WIDGET_MIRROR_LOGICAL_RADIUS.saturating_mul(2))
            .saturating_div(WIDGET_MIRROR_LOGICAL_SIZE)
            .max(1);
        let region = unsafe {
            CreateRoundRectRgn(
                0,
                0,
                size.0.saturating_add(1),
                size.1.saturating_add(1),
                radius,
                radius,
            )
        };
        if region.is_invalid() {
            return Err(Error::from_win32());
        }
        if unsafe { SetWindowRgn(window, Some(region), true) } == 0 {
            unsafe {
                let _ = DeleteObject(HGDIOBJ(region.0));
            }
            return Err(Error::from_win32());
        }
        Ok(())
    }

    fn fit_within(
        source_width: i32,
        source_height: i32,
        maximum_width: i32,
        maximum_height: i32,
    ) -> (i32, i32) {
        let scale = (maximum_width as f64 / source_width.max(1) as f64)
            .min(maximum_height as f64 / source_height.max(1) as f64);
        (
            ((source_width as f64 * scale).round() as i32).max(1),
            ((source_height as f64 * scale).round() as i32).max(1),
        )
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

            if message.message == WM_LBUTTONUP {
                if let Some(reflow) = reflow.as_mut() {
                    reflow.activate();
                }
                continue;
            }

            if message.message == WM_CLOSE {
                if let Some(reflow) = reflow.as_mut() {
                    reflow.release_thumbnail();
                }
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
            top: i32,
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
                    top,
                    right: left + width,
                    bottom: top + height,
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

        fn update_source_and_show(&self, source: RECT, destination: RECT) -> Result<()> {
            let properties = DWM_THUMBNAIL_PROPERTIES {
                dwFlags: DWM_TNP_RECTSOURCE | DWM_TNP_RECTDESTINATION | DWM_TNP_VISIBLE,
                rcSource: source,
                rcDestination: destination,
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
        source: TaskbarMirrorSource,
        owner: Option<HWND>,
        automation: &'a IUIAutomation,
        taskbar: HWND,
        destination: HWND,
        thumbnail: Option<Thumbnail>,
        source_element: Option<IUIAutomationElement>,
        current_crop: Option<RECT>,
        destination_rect: RECT,
        destination_size: (i32, i32),
        taskbar_count: u32,
        taskbar_monitor: Option<String>,
        preferred_monitor: Option<HMONITOR>,
        visible: bool,
        unavailable_logged: bool,
        last_rediscovery: Instant,
        metrics: RuntimeMetrics,
        status: Option<Arc<Mutex<TaskbarMirrorStatus>>>,
        slot_index: Option<&'a AtomicI32>,
        visible_source_count: Option<&'a AtomicI32>,
    }

    impl<'a> ReflowController<'a> {
        #[allow(clippy::too_many_arguments)]
        fn new(
            source: TaskbarMirrorSource,
            owner: Option<HWND>,
            taskbar: HWND,
            destination: HWND,
            thumbnail: Thumbnail,
            automation: &'a IUIAutomation,
            source_button: TaskbarButtonDiscovery,
            destination_left: i32,
            destination_top: i32,
            destination_width: i32,
            destination_height: i32,
            taskbar_count: u32,
            taskbar_monitor: Option<String>,
            status: Option<Arc<Mutex<TaskbarMirrorStatus>>>,
            slot_index: Option<&'a AtomicI32>,
            visible_source_count: Option<&'a AtomicI32>,
        ) -> Self {
            Self {
                source,
                owner,
                automation,
                taskbar,
                destination,
                thumbnail: Some(thumbnail),
                source_element: Some(source_button.element),
                current_crop: Some(source_button.source_crop),
                destination_rect: RECT {
                    left: destination_left,
                    top: destination_top,
                    right: destination_left + destination_width,
                    bottom: destination_top + destination_height,
                },
                destination_size: (
                    destination_left.saturating_mul(2) + destination_width,
                    destination_top.saturating_mul(2) + destination_height,
                ),
                taskbar_count,
                taskbar_monitor,
                preferred_monitor: preferred_source_window(source.app_source())
                    .ok()
                    .flatten()
                    .map(|window| unsafe { MonitorFromWindow(window, MONITOR_DEFAULTTONEAREST) }),
                visible: true,
                unavailable_logged: false,
                last_rediscovery: Instant::now(),
                metrics: RuntimeMetrics::new(),
                status,
                slot_index,
                visible_source_count,
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
            if let Some(owner) = self.owner {
                let destination_size = position_widget_destination(
                    self.destination,
                    owner,
                    self.source,
                    self.slot_index,
                    self.visible_source_count,
                )?;
                if destination_size != self.destination_size {
                    mask_mirror_window(self.destination, destination_size)?;
                    self.destination_size = destination_size;
                }
            }
            let Some(_uia_guard) = crate::uia_gate::try_lock() else {
                self.finish_check(started, used_rediscovery);
                return Ok(());
            };

            if self.last_rediscovery.elapsed() >= REDISCOVERY_INTERVAL {
                self.last_rediscovery = Instant::now();
                let taskbar_state = ordered_taskbars_for_source(self.source).ok();
                let preferred_changed = taskbar_state
                    .as_ref()
                    .is_some_and(|(_, monitor)| !same_monitor(*monitor, self.preferred_monitor));
                let taskbar_count_changed = taskbar_state
                    .as_ref()
                    .is_some_and(|(taskbars, _)| taskbars.len() as u32 != self.taskbar_count);
                if preferred_changed
                    || taskbar_count_changed
                    || !unsafe { IsWindow(Some(self.taskbar)) }.as_bool()
                    || self.source_element.is_none()
                {
                    used_rediscovery = true;
                    self.rediscover(started)?;
                }
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
                .source_element
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
                        self.rediscover(started)?;
                    }
                }
                Err(error) => {
                    self.source_element = None;
                    self.mark_unavailable("cached_element", &error);
                }
            }

            self.finish_check(started, used_rediscovery);
            Ok(())
        }

        fn rediscover(&mut self, started: Instant) -> Result<()> {
            self.last_rediscovery = Instant::now();
            match select_taskbar_for_source(self.automation, self.source, false) {
                Ok(selection) => {
                    let taskbar_changed = selection.taskbar.0 != self.taskbar.0;
                    if taskbar_changed {
                        self.invalidate_thumbnail();
                        unsafe {
                            let _ = ShowWindow(self.destination, SW_HIDE);
                        }
                    }
                    self.taskbar = selection.taskbar;
                    self.source_element = Some(selection.button.element);
                    if taskbar_changed {
                        self.current_crop = None;
                    }
                    self.taskbar_count = selection.taskbar_count;
                    self.taskbar_monitor = Some(selection.monitor);
                    self.preferred_monitor = selection.preferred_monitor;
                    self.update_taskbar_status();
                    match self.apply_crop(selection.button.source_crop, started) {
                        Ok(()) => println!(
                            "taskbar_reflow_recovered=source:auto_taskbar_selection changed:{taskbar_changed} elapsed_ms:{}",
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
            let fitted = fit_within(
                source_crop.right - source_crop.left,
                source_crop.bottom - source_crop.top,
                self.destination_size.0,
                self.destination_size.1,
            );
            let destination_rect = RECT {
                left: (self.destination_size.0 - fitted.0) / 2,
                top: (self.destination_size.1 - fitted.1) / 2,
                right: (self.destination_size.0 - fitted.0) / 2 + fitted.0,
                bottom: (self.destination_size.1 - fitted.1) / 2 + fitted.1,
            };
            let crop_changed = self
                .current_crop
                .map(|current| !rects_equal(current, source_crop))
                .unwrap_or(true);
            let destination_changed = !rects_equal(self.destination_rect, destination_rect);
            let changed = crop_changed || destination_changed;
            if !changed && self.visible {
                return Ok(());
            }

            let newly_registered = self.ensure_thumbnail(source_crop, destination_rect)?;
            if !newly_registered {
                let thumbnail = self
                    .thumbnail
                    .as_ref()
                    .expect("ensure_thumbnail must register a thumbnail");
                if self.visible {
                    thumbnail.hide()?;
                }
                thumbnail.update_source_and_show(source_crop, destination_rect)?;
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
            self.destination_rect = destination_rect;
            self.visible = true;
            self.unavailable_logged = false;
            unsafe {
                let _ = ShowWindow(self.destination, SW_SHOWNOACTIVATE);
            }
            self.update_product_status("running", true, None);
            Ok(())
        }

        fn ensure_thumbnail(&mut self, source_crop: RECT, destination: RECT) -> Result<bool> {
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
                destination.left,
                destination.top,
                destination.right - destination.left,
                destination.bottom - destination.top,
            )?;
            self.thumbnail = Some(thumbnail);
            println!("taskbar_reflow_source=rebound");
            Ok(true)
        }

        fn activate(&self) {
            match activate_source(self.source.app_source()) {
                Ok(()) => self.update_product_status("running", self.visible, None),
                Err(error) => {
                    eprintln!("{}_activation_failed={error:?}", self.source.key());
                    self.update_product_status(
                        "running",
                        self.visible,
                        Some(&format!(
                            "Could not activate the running {} window.",
                            self.source.display_name()
                        )),
                    );
                }
            }
        }

        fn update_taskbar_status(&self) {
            let Some(status) = self.status.as_ref() else {
                return;
            };
            let mut status = status
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            status.taskbar_count = self.taskbar_count;
            status.taskbar_monitor = self.taskbar_monitor.clone();
        }

        fn invalidate_thumbnail(&mut self) {
            if let Some(mut thumbnail) = self.thumbnail.take() {
                let _ = thumbnail.hide();
                thumbnail.suppress_cleanup_error();
            }
        }

        fn release_thumbnail(&mut self) {
            if let Some(thumbnail) = self.thumbnail.take() {
                let _ = thumbnail.hide();
            }
        }

        fn mark_unavailable(&mut self, reason: &str, error: &Error) {
            if let Some(thumbnail) = self.thumbnail.as_ref() {
                let _ = thumbnail.hide();
            }
            unsafe {
                let _ = ShowWindow(self.destination, SW_HIDE);
            }
            self.visible = false;
            if !self.unavailable_logged {
                eprintln!("taskbar_reflow_unavailable=reason:{reason} error:{error:?}");
                self.unavailable_logged = true;
            }
            self.update_product_status(
                "hidden",
                false,
                Some(&format!(
                    "{} taskbar pixels are temporarily unavailable.",
                    self.source.display_name()
                )),
            );
        }

        fn update_product_status(&self, lifecycle: &str, visible: bool, diagnostic: Option<&str>) {
            let Some(status) = self.status.as_ref() else {
                return;
            };
            let mut status = status
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            status.lifecycle = lifecycle.into();
            status.enabled = true;
            status.visible = visible;
            status.diagnostic = diagnostic.map(str::to_owned);
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

    fn same_monitor(left: Option<HMONITOR>, right: Option<HMONITOR>) -> bool {
        match (left, right) {
            (Some(left), Some(right)) => left.0 == right.0,
            (None, None) => true,
            _ => false,
        }
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
            return Err(Error::new(E_FAIL, "Cached taskbar element is unavailable"));
        }
        Ok(square_source_crop(
            RECT {
                left: bounds.left - taskbar_frame.left,
                top: bounds.top - taskbar_frame.top,
                right: bounds.right - taskbar_frame.left,
                bottom: bounds.bottom - taskbar_frame.top,
            },
            taskbar_frame.right - taskbar_frame.left,
            taskbar_frame.bottom - taskbar_frame.top,
        ))
    }

    fn square_source_crop(button: RECT, maximum_width: i32, maximum_height: i32) -> RECT {
        let width = (button.right - button.left).max(1);
        let height = (button.bottom - button.top).max(1);
        let size = width
            .max(height)
            .min(maximum_width)
            .min(maximum_height)
            .max(1);
        let center_x = button.left.saturating_add(width / 2);
        let center_y = button.top.saturating_add(height / 2);
        let left = center_x
            .saturating_sub(size / 2)
            .clamp(0, maximum_width.saturating_sub(size));
        let top = center_y
            .saturating_sub(size / 2)
            .clamp(0, maximum_height.saturating_sub(size));
        RECT {
            left,
            top,
            right: left.saturating_add(size),
            bottom: top.saturating_add(size),
        }
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

    struct TaskbarSurface {
        window: HWND,
        frame: RECT,
        monitor: HMONITOR,
        monitor_label: String,
        primary: bool,
    }

    struct TaskbarSelection {
        taskbar: HWND,
        taskbar_frame: RECT,
        button: TaskbarButtonDiscovery,
        taskbar_count: u32,
        monitor: String,
        preferred_monitor: Option<HMONITOR>,
    }

    struct ProcessHandle(HANDLE);

    impl Drop for ProcessHandle {
        fn drop(&mut self) {
            unsafe {
                let _ = CloseHandle(self.0);
            }
        }
    }

    struct TaskbarButtonDiscovery {
        element: IUIAutomationElement,
        source_crop: RECT,
    }

    #[derive(Clone)]
    struct TaskbarButtonCandidate {
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
        TrackedCrop(TaskbarMirrorSource),
    }

    impl ProbeMode {
        fn label(self) -> &'static str {
            match self {
                Self::WholeTaskbar => "whole_taskbar",
                Self::TeamsStaticCrop => "teams_static_crop",
                Self::TrackedCrop(TaskbarMirrorSource::Teams) => "teams_tracked_crop",
                Self::TrackedCrop(TaskbarMirrorSource::Telegram) => "telegram_tracked_crop",
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

    #[cfg(test)]
    mod tests {
        use super::{
            fit_within, source_identity_matches, source_name_matches, square_source_crop,
            widget_slot_left, RECT,
        };
        use crate::teams_mirror::TaskbarMirrorSource;

        #[test]
        fn source_matching_keeps_teams_and_telegram_distinct() {
            assert!(source_name_matches(
                TaskbarMirrorSource::Teams,
                "Microsoft Teams (work or school)"
            ));
            assert!(source_identity_matches(
                TaskbarMirrorSource::Teams,
                "MSTeams_8wekyb3d8bbwe!MSTeams"
            ));
            assert!(source_name_matches(
                TaskbarMirrorSource::Telegram,
                "Telegram (53)"
            ));
            assert!(source_identity_matches(
                TaskbarMirrorSource::Telegram,
                "Telegram.TelegramDesktop"
            ));
            assert!(!source_name_matches(
                TaskbarMirrorSource::Telegram,
                "Microsoft Teams"
            ));
            assert!(!source_identity_matches(
                TaskbarMirrorSource::Teams,
                "Telegram.TelegramDesktop"
            ));
        }

        #[test]
        fn taskbar_button_fills_the_option_a_inner_surface() {
            let crop = square_source_crop(
                RECT {
                    left: 0,
                    top: 2,
                    right: 48,
                    bottom: 46,
                },
                48,
                48,
            );
            assert_eq!(
                (crop.left, crop.top, crop.right, crop.bottom),
                (0, 0, 48, 48)
            );
            assert_eq!(fit_within(48, 48, 40, 40), (40, 40));
        }

        #[test]
        fn compressed_widget_slots_remain_centered() {
            assert_eq!(widget_slot_left(0, 3), 44);
            assert_eq!(widget_slot_left(1, 3), 100);
            assert_eq!(widget_slot_left(0, 2), 72);
            assert_eq!(widget_slot_left(1, 2), 128);
            assert_eq!(widget_slot_left(0, 1), 100);
        }
    }
}
