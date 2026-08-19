use std::{
    sync::mpsc::{self, RecvTimeoutError},
    sync::Mutex,
    time::Duration,
};

use tauri::{AppHandle, Emitter};
use windows::{
    core::{Error as WindowsError, HSTRING},
    ApplicationModel::Package,
    Foundation::{DateTime, Metadata::ApiInformation, TypedEventHandler},
    Win32::{
        Foundation::{FILETIME, SYSTEMTIME},
        System::{
            SystemInformation::GetSystemTime,
            Time::FileTimeToSystemTime,
            WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
        },
    },
    UI::Notifications::{
        KnownNotificationBindings,
        Management::{UserNotificationListener, UserNotificationListenerAccessStatus},
        NotificationKinds, UserNotification, UserNotificationChangedEventArgs,
        UserNotificationChangedKind,
    },
};

use super::{
    AttentionNotification, ListenerStartReport, NotificationAccessReport, NotificationAccessStatus,
    NotificationSnapshot, NotificationSource, PackageIdentityReport,
};

const LISTENER_RUNTIME_TYPE: &str = "Windows.UI.Notifications.Management.UserNotificationListener";
const MAIN_THREAD_TIMEOUT: Duration = Duration::from_secs(5);

pub struct NotificationListenerState {
    registration: Mutex<Option<ListenerRegistration>>,
}

impl NotificationListenerState {
    pub fn new() -> Self {
        Self {
            registration: Mutex::new(None),
        }
    }
}

struct ListenerRegistration {
    listener: UserNotificationListener,
    token: i64,
}

impl Drop for ListenerRegistration {
    fn drop(&mut self) {
        let _ = self.listener.RemoveNotificationChanged(self.token);
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NotificationChangeSignal {
    kind: String,
    notification_id: Option<u32>,
}

struct ExtractedNotification {
    id: u32,
    source: NotificationSource,
    created_at: Option<String>,
    raw_text_elements: Vec<String>,
    diagnostics: Vec<String>,
}

pub async fn get_access_status(app: AppHandle) -> NotificationAccessReport {
    match run_on_main_thread(&app, inspect_access) {
        Ok(report) => report,
        Err(diagnostic) => NotificationAccessReport {
            access_status: NotificationAccessStatus::Error,
            api_available: false,
            package_identity: PackageIdentityReport {
                present: false,
                full_name: None,
            },
            diagnostics: vec![diagnostic],
        },
    }
}

pub async fn request_access(app: AppHandle) -> NotificationAccessReport {
    let operation = match run_on_main_thread(&app, || {
        UserNotificationListener::Current()?.RequestAccessAsync()
    }) {
        Ok(Ok(operation)) => operation,
        Ok(Err(error)) => {
            let mut report = get_access_status(app).await;
            report.access_status = NotificationAccessStatus::Error;
            report.diagnostics.push(format_windows_error(
                "RequestAccessAsync could not start",
                &error,
            ));
            return report;
        }
        Err(diagnostic) => {
            let mut report = get_access_status(app).await;
            report.access_status = NotificationAccessStatus::Error;
            report.diagnostics.push(diagnostic);
            return report;
        }
    };

    let request_result = match tauri::async_runtime::spawn_blocking(move || operation.get()).await {
        Ok(result) => result,
        Err(error) => {
            let mut report = get_access_status(app).await;
            report.access_status = NotificationAccessStatus::Error;
            report.diagnostics.push(format!(
                "The WinRT permission operation task could not complete: {error}"
            ));
            return report;
        }
    };
    let mut report = get_access_status(app).await;

    match request_result {
        Ok(status) => {
            report.access_status = map_access_status(status);
            report
                .diagnostics
                .push(format!("RequestAccessAsync returned {:?}.", status));
        }
        Err(error) => {
            report.access_status = NotificationAccessStatus::Error;
            report
                .diagnostics
                .push(format_windows_error("RequestAccessAsync failed", &error));
        }
    }

    report
}

pub async fn get_snapshot(app: AppHandle) -> NotificationSnapshot {
    let access_report = get_access_status(app.clone()).await;
    let captured_at = current_time_iso8601();

    if !matches!(
        access_report.access_status,
        NotificationAccessStatus::Allowed
    ) {
        return NotificationSnapshot {
            access_status: access_report.access_status,
            captured_at,
            notifications: Vec::new(),
            diagnostics: access_report.diagnostics,
        };
    }

    let operation = match run_on_main_thread(&app, || {
        UserNotificationListener::Current()?.GetNotificationsAsync(NotificationKinds::Toast)
    }) {
        Ok(Ok(operation)) => operation,
        Ok(Err(error)) => {
            let mut diagnostics = access_report.diagnostics;
            diagnostics.push(format_windows_error(
                "Could not start the current notification snapshot",
                &error,
            ));
            return NotificationSnapshot {
                access_status: NotificationAccessStatus::Error,
                captured_at,
                notifications: Vec::new(),
                diagnostics,
            };
        }
        Err(diagnostic) => {
            let mut diagnostics = access_report.diagnostics;
            diagnostics.push(diagnostic);
            return NotificationSnapshot {
                access_status: NotificationAccessStatus::Error,
                captured_at,
                notifications: Vec::new(),
                diagnostics,
            };
        }
    };

    let extraction = tauri::async_runtime::spawn_blocking(move || {
        let notifications = operation.get()?;
        let count = notifications.Size()?;
        let mut normalized = Vec::with_capacity(count as usize);
        let mut diagnostics = Vec::new();

        for index in 0..count {
            match notifications
                .GetAt(index)
                .and_then(|notification| extract_notification(&notification))
            {
                Ok(notification) => normalized.push(notification),
                Err(error) => diagnostics.push(format_windows_error(
                    &format!("Could not extract notification at snapshot index {index}"),
                    &error,
                )),
            }
        }

        Ok::<_, WindowsError>((normalized, diagnostics))
    })
    .await;

    let mut diagnostics = access_report.diagnostics;
    let notifications = match extraction {
        Ok(Ok((notifications, extraction_diagnostics))) => {
            diagnostics.extend(extraction_diagnostics);
            notifications
        }
        Ok(Err(error)) => {
            diagnostics.push(format_windows_error(
                "Could not complete the current notification snapshot",
                &error,
            ));
            Vec::new()
        }
        Err(error) => {
            diagnostics.push(format!(
                "The notification snapshot task could not complete: {error}"
            ));
            Vec::new()
        }
    };

    NotificationSnapshot {
        access_status: access_report.access_status,
        captured_at,
        notifications,
        diagnostics,
    }
}

pub async fn start_listener(
    app: AppHandle,
    state: &NotificationListenerState,
) -> ListenerStartReport {
    let is_active = match state.registration.lock() {
        Ok(registration) => registration.is_some(),
        Err(error) => {
            return ListenerStartReport {
                active: false,
                diagnostics: vec![format!(
                    "The notification listener state lock is poisoned: {error}"
                )],
            };
        }
    };

    if is_active {
        return ListenerStartReport {
            active: true,
            diagnostics: Vec::new(),
        };
    }

    let registration_result =
        tauri::async_runtime::spawn_blocking(move || register_listener_mta(app)).await;

    match registration_result {
        Ok(Ok(listener_registration)) => {
            let mut registration = match state.registration.lock() {
                Ok(registration) => registration,
                Err(error) => {
                    return ListenerStartReport {
                        active: false,
                        diagnostics: vec![format!(
                            "The notification listener state lock is poisoned: {error}"
                        )],
                    };
                }
            };

            if registration.is_none() {
                *registration = Some(listener_registration);
            }

            ListenerStartReport {
                active: true,
                diagnostics: Vec::new(),
            }
        }
        Ok(Err(error)) => ListenerStartReport {
            active: false,
            diagnostics: vec![format_windows_error(
                "Could not subscribe to NotificationChanged",
                &error,
            )],
        },
        Err(error) => ListenerStartReport {
            active: false,
            diagnostics: vec![format!(
                "The notification listener subscription task could not complete: {error}"
            )],
        },
    }
}

fn register_listener_mta(app: AppHandle) -> windows::core::Result<ListenerRegistration> {
    unsafe { RoInitialize(RO_INIT_MULTITHREADED)? };
    let _apartment = RoApartment;

    register_listener(app)
}

struct RoApartment;

impl Drop for RoApartment {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}

fn register_listener(app: AppHandle) -> windows::core::Result<ListenerRegistration> {
    let listener = UserNotificationListener::Current()?;
    let handler =
        TypedEventHandler::<UserNotificationListener, UserNotificationChangedEventArgs>::new(
            move |_sender, args| {
                let args = args.ok()?;
                let kind = args.ChangeKind()?;
                let notification_id = args.UserNotificationId().ok();
                let kind = if kind == UserNotificationChangedKind::Added {
                    "added"
                } else if kind == UserNotificationChangedKind::Removed {
                    "removed"
                } else {
                    "unknown"
                };

                eprintln!(
                    "notification changed: kind={kind}, id={}",
                    notification_id
                        .map(|id| id.to_string())
                        .unwrap_or_else(|| "unknown".to_owned())
                );

                if let Err(error) = app.emit(
                    "notification-state-changed",
                    NotificationChangeSignal {
                        kind: kind.to_owned(),
                        notification_id,
                    },
                ) {
                    eprintln!("could not emit notification invalidation event: {error}");
                }

                Ok(())
            },
        );
    let token = listener.NotificationChanged(&handler)?;

    Ok(ListenerRegistration { listener, token })
}

fn inspect_access() -> NotificationAccessReport {
    let mut diagnostics = Vec::new();

    let api_available = match ApiInformation::IsTypePresent(&HSTRING::from(LISTENER_RUNTIME_TYPE)) {
        Ok(is_present) => is_present,
        Err(error) => {
            diagnostics.push(format_windows_error(
                "Could not check UserNotificationListener availability",
                &error,
            ));
            false
        }
    };

    let package_identity = match current_package_full_name() {
        Ok(full_name) => PackageIdentityReport {
            present: true,
            full_name: Some(full_name),
        },
        Err(error) => {
            diagnostics.push(format_windows_error(
                "The current process has no readable package identity",
                &error,
            ));
            PackageIdentityReport {
                present: false,
                full_name: None,
            }
        }
    };

    if !api_available {
        diagnostics.push(format!(
            "The WinRT runtime type {LISTENER_RUNTIME_TYPE} is not available."
        ));

        return NotificationAccessReport {
            access_status: NotificationAccessStatus::Unsupported,
            api_available,
            package_identity,
            diagnostics,
        };
    }

    let access_status =
        match UserNotificationListener::Current().and_then(|listener| listener.GetAccessStatus()) {
            Ok(status) => map_access_status(status),
            Err(error) => {
                diagnostics.push(format_windows_error(
                    "Could not read notification-listener access status",
                    &error,
                ));
                NotificationAccessStatus::Error
            }
        };

    NotificationAccessReport {
        access_status,
        api_available,
        package_identity,
        diagnostics,
    }
}

fn current_package_full_name() -> windows::core::Result<String> {
    Package::Current()?
        .Id()?
        .FullName()
        .map(|full_name| full_name.to_string_lossy())
}

fn extract_notification(
    notification: &UserNotification,
) -> windows::core::Result<AttentionNotification> {
    let id = notification.Id()?;
    let mut diagnostics = Vec::new();
    let source = extract_source(notification, &mut diagnostics);
    let created_at = match notification.CreationTime().and_then(date_time_to_iso8601) {
        Ok(created_at) => Some(created_at),
        Err(error) => {
            diagnostics.push(format_windows_error(
                "Could not convert notification creation time",
                &error,
            ));
            None
        }
    };
    let raw_text_elements = extract_text_elements(notification, &mut diagnostics);
    Ok(normalize_notification(ExtractedNotification {
        id,
        source,
        created_at,
        raw_text_elements,
        diagnostics,
    }))
}

fn extract_source(
    notification: &UserNotification,
    diagnostics: &mut Vec<String>,
) -> NotificationSource {
    let app_info = match notification.AppInfo() {
        Ok(app_info) => app_info,
        Err(error) => {
            diagnostics.push(format_windows_error(
                "Could not read notification source AppInfo",
                &error,
            ));
            return NotificationSource::default();
        }
    };

    let display_name = app_info
        .DisplayInfo()
        .and_then(|display_info| display_info.DisplayName())
        .map(|value| value.to_string_lossy())
        .map_err(|error| {
            diagnostics.push(format_windows_error(
                "Could not read notification source display name",
                &error,
            ));
        })
        .ok();

    let app_user_model_id = app_info
        .AppUserModelId()
        .map(|value| value.to_string_lossy())
        .map_err(|error| {
            diagnostics.push(format_windows_error(
                "Could not read notification source app user model ID",
                &error,
            ));
        })
        .ok();

    let package_family_name = app_info
        .PackageFamilyName()
        .map(|value| value.to_string_lossy())
        .map_err(|error| {
            diagnostics.push(format_windows_error(
                "Could not read notification source package family name",
                &error,
            ));
        })
        .ok();

    NotificationSource {
        display_name,
        app_user_model_id,
        package_family_name,
    }
}

fn extract_text_elements(
    notification: &UserNotification,
    diagnostics: &mut Vec<String>,
) -> Vec<String> {
    let result = (|| {
        let visual = notification.Notification()?.Visual()?;
        let binding_name = KnownNotificationBindings::ToastGeneric()?;
        let binding = visual.GetBinding(&binding_name)?;
        let elements = binding.GetTextElements()?;
        let count = elements.Size()?;
        let mut text = Vec::with_capacity(count as usize);

        for index in 0..count {
            text.push(elements.GetAt(index)?.Text()?.to_string_lossy());
        }

        Ok::<_, WindowsError>(text)
    })();

    match result {
        Ok(text) => text,
        Err(error) => {
            diagnostics.push(format_windows_error(
                "Could not read ToastGeneric text elements",
                &error,
            ));
            Vec::new()
        }
    }
}

fn normalize_text_elements(raw_text_elements: &[String]) -> (Option<String>, Vec<String>) {
    let mut non_empty = raw_text_elements
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());

    let title = non_empty.next().map(ToOwned::to_owned);
    let body = non_empty.map(ToOwned::to_owned).collect();

    (title, body)
}

fn normalize_notification(extracted: ExtractedNotification) -> AttentionNotification {
    let (title, body) = normalize_text_elements(&extracted.raw_text_elements);

    AttentionNotification {
        id: extracted.id,
        source: extracted.source,
        created_at: extracted.created_at,
        title,
        body,
        raw_text_elements: extracted.raw_text_elements,
        diagnostics: extracted.diagnostics,
    }
}

fn date_time_to_iso8601(date_time: DateTime) -> windows::core::Result<String> {
    let raw = date_time.UniversalTime as u64;
    let file_time = FILETIME {
        dwLowDateTime: raw as u32,
        dwHighDateTime: (raw >> 32) as u32,
    };
    let mut system_time = SYSTEMTIME::default();
    unsafe { FileTimeToSystemTime(&file_time, &mut system_time)? };

    Ok(format_system_time(system_time))
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

fn map_access_status(status: UserNotificationListenerAccessStatus) -> NotificationAccessStatus {
    if status == UserNotificationListenerAccessStatus::Allowed {
        NotificationAccessStatus::Allowed
    } else if status == UserNotificationListenerAccessStatus::Denied {
        NotificationAccessStatus::Denied
    } else {
        NotificationAccessStatus::Unspecified
    }
}

fn run_on_main_thread<T, F>(app: &AppHandle, action: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> T + Send + 'static,
{
    let (sender, receiver) = mpsc::sync_channel(1);

    app.run_on_main_thread(move || {
        let _ = sender.send(action());
    })
    .map_err(|error| format!("Could not schedule work on Tauri's main thread: {error}"))?;

    receiver
        .recv_timeout(MAIN_THREAD_TIMEOUT)
        .map_err(|error| match error {
            RecvTimeoutError::Timeout => {
                "Timed out waiting for Tauri's main thread to start the WinRT operation.".to_owned()
            }
            RecvTimeoutError::Disconnected => {
                "Tauri's main-thread bridge disconnected before returning a result.".to_owned()
            }
        })
}

fn format_windows_error(context: &str, error: &WindowsError) -> String {
    format!(
        "{context}: HRESULT 0x{:08X}: {}",
        error.code().0 as u32,
        error.message()
    )
}

#[cfg(test)]
mod tests {
    use super::{normalize_notification, normalize_text_elements, ExtractedNotification};
    use crate::notifications::NotificationSource;

    #[test]
    fn normalizes_missing_text() {
        assert_eq!(normalize_text_elements(&[]), (None, Vec::<String>::new()));
    }

    #[test]
    fn skips_empty_text_elements() {
        assert_eq!(
            normalize_text_elements(&["".into(), "  Title  ".into(), "".into()]),
            (Some("Title".into()), Vec::<String>::new())
        );
    }

    #[test]
    fn uses_first_non_empty_element_as_title_and_preserves_body_lines() {
        assert_eq!(
            normalize_text_elements(&["Title".into(), "First line".into(), "Second line".into(),]),
            (
                Some("Title".into()),
                vec!["First line".into(), "Second line".into()]
            )
        );
    }

    #[test]
    fn preserves_missing_source_identity_without_inventing_values() {
        let notification = normalize_notification(ExtractedNotification {
            id: 7,
            source: NotificationSource::default(),
            created_at: Some("2026-08-09T19:00:00.000Z".into()),
            raw_text_elements: vec!["Title".into()],
            diagnostics: Vec::new(),
        });

        assert!(notification.source.display_name.is_none());
        assert!(notification.source.app_user_model_id.is_none());
        assert!(notification.source.package_family_name.is_none());
    }

    #[test]
    fn preserves_an_isolated_conversion_failure_as_diagnostics() {
        let notification = normalize_notification(ExtractedNotification {
            id: 8,
            source: NotificationSource::default(),
            created_at: None,
            raw_text_elements: vec!["Title".into(), "Body".into()],
            diagnostics: vec!["creation time conversion failed".into()],
        });

        assert!(notification.created_at.is_none());
        assert_eq!(
            notification.diagnostics,
            vec!["creation time conversion failed"]
        );
        assert_eq!(notification.title.as_deref(), Some("Title"));
        assert_eq!(notification.body, vec!["Body"]);
    }
}
