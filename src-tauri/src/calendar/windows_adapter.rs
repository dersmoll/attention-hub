use std::time::{SystemTime, UNIX_EPOCH};

use windows::{
    core::{Error as WindowsError, HSTRING},
    ApplicationModel::{
        Appointments::{
            Appointment, AppointmentBusyStatus, AppointmentCalendar, AppointmentManager,
            AppointmentProperties, AppointmentSensitivity, AppointmentStore,
            AppointmentStoreAccessType, FindAppointmentCalendarsOptions, FindAppointmentsOptions,
        },
        Package,
    },
    Foundation::{DateTime, Metadata::ApiInformation, TimeSpan},
    Win32::{
        Foundation::{FILETIME, SYSTEMTIME},
        System::{
            Time::FileTimeToSystemTime,
            WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
        },
    },
};

use super::{
    CalendarAccessReport, CalendarAccessStatus, CalendarAppointment, CalendarPackageIdentityReport,
    CalendarSnapshot, CalendarSource,
};

const APPOINTMENT_MANAGER_RUNTIME_TYPE: &str =
    "Windows.ApplicationModel.Appointments.AppointmentManager";
const E_ACCESSDENIED: i32 = 0x80070005_u32 as i32;
const TICKS_PER_SECOND: i64 = 10_000_000;
const WINDOWS_TO_UNIX_EPOCH_SECONDS: i64 = 11_644_473_600;
const SNAPSHOT_DAYS: i64 = 7;

pub async fn get_access_status() -> CalendarAccessReport {
    match tauri::async_runtime::spawn_blocking(inspect_environment).await {
        Ok(report) => report,
        Err(error) => CalendarAccessReport {
            access_status: CalendarAccessStatus::Error,
            api_available: false,
            package_identity: CalendarPackageIdentityReport {
                present: false,
                full_name: None,
            },
            store_available: false,
            diagnostics: vec![format!(
                "The calendar environment diagnostic task could not complete: {error}"
            )],
        },
    }
}

pub async fn request_read_access() -> CalendarAccessReport {
    match tauri::async_runtime::spawn_blocking(request_read_access_mta).await {
        Ok(report) => report,
        Err(error) => CalendarAccessReport {
            access_status: CalendarAccessStatus::Error,
            api_available: false,
            package_identity: CalendarPackageIdentityReport {
                present: false,
                full_name: None,
            },
            store_available: false,
            diagnostics: vec![format!(
                "The calendar permission task could not complete: {error}"
            )],
        },
    }
}

pub async fn get_snapshot() -> CalendarSnapshot {
    match tauri::async_runtime::spawn_blocking(get_snapshot_mta).await {
        Ok(snapshot) => snapshot,
        Err(error) => CalendarSnapshot {
            access_status: CalendarAccessStatus::Error,
            captured_at: String::new(),
            range_start: String::new(),
            range_end: String::new(),
            calendars: Vec::new(),
            appointments: Vec::new(),
            diagnostics: vec![format!(
                "The calendar snapshot task could not complete: {error}"
            )],
        },
    }
}

fn inspect_environment() -> CalendarAccessReport {
    let mut diagnostics = Vec::new();
    let apartment = match RoApartment::initialize() {
        Ok(apartment) => Some(apartment),
        Err(error) => {
            diagnostics.push(format_windows_error(
                "Could not initialize WinRT for the calendar diagnostic",
                &error,
            ));
            None
        }
    };

    let api_available =
        match ApiInformation::IsTypePresent(&HSTRING::from(APPOINTMENT_MANAGER_RUNTIME_TYPE)) {
            Ok(is_present) => is_present,
            Err(error) => {
                diagnostics.push(format_windows_error(
                    "Could not check AppointmentManager availability",
                    &error,
                ));
                false
            }
        };

    let package_identity = inspect_package_identity(&mut diagnostics);

    if apartment.is_none() {
        return CalendarAccessReport {
            access_status: CalendarAccessStatus::Error,
            api_available,
            package_identity,
            store_available: false,
            diagnostics,
        };
    }

    if !api_available {
        diagnostics.push(format!(
            "The WinRT runtime type {APPOINTMENT_MANAGER_RUNTIME_TYPE} is not available."
        ));
    } else {
        diagnostics.push(
            "AppointmentManager does not expose a separate access-status query; use the explicit read-only request to test access."
                .into(),
        );
    }

    CalendarAccessReport {
        access_status: if api_available {
            CalendarAccessStatus::Unspecified
        } else {
            CalendarAccessStatus::Unsupported
        },
        api_available,
        package_identity,
        store_available: false,
        diagnostics,
    }
}

fn request_read_access_mta() -> CalendarAccessReport {
    let mut report = inspect_environment();

    if !report.api_available || matches!(report.access_status, CalendarAccessStatus::Error) {
        return report;
    }

    let _apartment = match RoApartment::initialize() {
        Ok(apartment) => apartment,
        Err(error) => {
            report.access_status = CalendarAccessStatus::Error;
            report.diagnostics.push(format_windows_error(
                "Could not initialize WinRT for the calendar access request",
                &error,
            ));
            return report;
        }
    };

    let result =
        AppointmentManager::RequestStoreAsync(AppointmentStoreAccessType::AllCalendarsReadOnly)
            .and_then(|operation| operation.get());

    match result {
        Ok(_store) => {
            report.access_status = CalendarAccessStatus::Allowed;
            report.store_available = true;
            report.diagnostics.push(
                "RequestStoreAsync(AllCalendarsReadOnly) returned an AppointmentStore.".into(),
            );
        }
        Err(error) => {
            report.access_status = classify_request_error(&error);
            report.store_available = false;
            report.diagnostics.push(format_windows_error(
                "RequestStoreAsync(AllCalendarsReadOnly) failed",
                &error,
            ));
        }
    }

    report
}

fn get_snapshot_mta() -> CalendarSnapshot {
    let captured_at = current_time_iso8601().unwrap_or_default();
    let range_start = match current_windows_date_time() {
        Ok(value) => value,
        Err(error) => {
            return failed_snapshot(
                captured_at,
                String::new(),
                String::new(),
                format_windows_error("Could not calculate the calendar range start", &error),
            );
        }
    };
    let range_length = TimeSpan {
        Duration: SNAPSHOT_DAYS * 24 * 60 * 60 * TICKS_PER_SECOND,
    };
    let range_end = DateTime {
        UniversalTime: range_start.UniversalTime + range_length.Duration,
    };
    let range_start_text = date_time_to_iso8601(range_start).unwrap_or_default();
    let range_end_text = date_time_to_iso8601(range_end).unwrap_or_default();

    let _apartment = match RoApartment::initialize() {
        Ok(apartment) => apartment,
        Err(error) => {
            return failed_snapshot(
                captured_at,
                range_start_text,
                range_end_text,
                format_windows_error(
                    "Could not initialize WinRT for the calendar snapshot",
                    &error,
                ),
            );
        }
    };

    let store = match request_store() {
        Ok(store) => store,
        Err(error) => {
            let status = classify_request_error(&error);
            return CalendarSnapshot {
                access_status: status,
                captured_at,
                range_start: range_start_text,
                range_end: range_end_text,
                calendars: Vec::new(),
                appointments: Vec::new(),
                diagnostics: vec![format_windows_error(
                    "Could not obtain the read-only AppointmentStore for the snapshot",
                    &error,
                )],
            };
        }
    };

    let mut diagnostics = Vec::new();
    let calendars = extract_calendars(&store, &mut diagnostics);
    let appointments = extract_appointments(&store, range_start, range_length, &mut diagnostics);

    CalendarSnapshot {
        access_status: CalendarAccessStatus::Allowed,
        captured_at,
        range_start: range_start_text,
        range_end: range_end_text,
        calendars,
        appointments,
        diagnostics,
    }
}

fn request_store() -> windows::core::Result<AppointmentStore> {
    AppointmentManager::RequestStoreAsync(AppointmentStoreAccessType::AllCalendarsReadOnly)?.get()
}

fn extract_calendars(
    store: &AppointmentStore,
    diagnostics: &mut Vec<String>,
) -> Vec<CalendarSource> {
    let result = store
        .FindAppointmentCalendarsAsyncWithOptions(FindAppointmentCalendarsOptions::IncludeHidden)
        .and_then(|operation| operation.get());
    let calendars = match result {
        Ok(calendars) => calendars,
        Err(error) => {
            diagnostics.push(format_windows_error(
                "Could not retrieve appointment calendars",
                &error,
            ));
            return Vec::new();
        }
    };

    let count = match calendars.Size() {
        Ok(count) => count,
        Err(error) => {
            diagnostics.push(format_windows_error(
                "Could not read the appointment-calendar count",
                &error,
            ));
            return Vec::new();
        }
    };
    let mut normalized = Vec::with_capacity(count as usize);

    for index in 0..count {
        match calendars
            .GetAt(index)
            .and_then(|calendar| extract_calendar(&calendar))
        {
            Ok(calendar) => normalized.push(calendar),
            Err(error) => diagnostics.push(format_windows_error(
                &format!("Could not extract calendar at index {index}"),
                &error,
            )),
        }
    }

    normalized
}

fn extract_calendar(calendar: &AppointmentCalendar) -> windows::core::Result<CalendarSource> {
    let mut diagnostics = Vec::new();
    let source_display_name = optional_text(
        calendar.SourceDisplayName(),
        &mut diagnostics,
        "source display name",
    );

    Ok(CalendarSource {
        id: calendar.LocalId()?.to_string_lossy(),
        display_name: calendar.DisplayName()?.to_string_lossy(),
        source_display_name,
        hidden: calendar.IsHidden()?,
        diagnostics,
    })
}

fn extract_appointments(
    store: &AppointmentStore,
    range_start: DateTime,
    range_length: TimeSpan,
    diagnostics: &mut Vec<String>,
) -> Vec<CalendarAppointment> {
    let result = (|| {
        let options = FindAppointmentsOptions::new()?;
        options.SetIncludeHidden(true)?;
        let properties = options.FetchProperties()?;
        for property in [
            AppointmentProperties::Subject()?,
            AppointmentProperties::Location()?,
            AppointmentProperties::StartTime()?,
            AppointmentProperties::Duration()?,
            AppointmentProperties::AllDay()?,
            AppointmentProperties::BusyStatus()?,
            AppointmentProperties::Sensitivity()?,
            AppointmentProperties::Recurrence()?,
        ] {
            properties.Append(&property)?;
        }

        store
            .FindAppointmentsAsyncWithOptions(range_start, range_length, &options)?
            .get()
    })();
    let appointments = match result {
        Ok(appointments) => appointments,
        Err(error) => {
            diagnostics.push(format_windows_error(
                "Could not retrieve appointments for the seven-day range",
                &error,
            ));
            return Vec::new();
        }
    };

    let count = match appointments.Size() {
        Ok(count) => count,
        Err(error) => {
            diagnostics.push(format_windows_error(
                "Could not read the appointment count",
                &error,
            ));
            return Vec::new();
        }
    };
    let mut normalized = Vec::with_capacity(count as usize);

    for index in 0..count {
        match appointments
            .GetAt(index)
            .and_then(|appointment| extract_appointment(&appointment))
        {
            Ok(appointment) => normalized.push(appointment),
            Err(error) => diagnostics.push(format_windows_error(
                &format!("Could not extract appointment at index {index}"),
                &error,
            )),
        }
    }

    normalized
}

fn extract_appointment(appointment: &Appointment) -> windows::core::Result<CalendarAppointment> {
    let mut diagnostics = Vec::new();
    let start = appointment.StartTime()?;
    let duration = appointment.Duration()?;
    let end = DateTime {
        UniversalTime: start
            .UniversalTime
            .checked_add(duration.Duration)
            .ok_or_else(|| {
                WindowsError::new(
                    windows::core::HRESULT(0x80070057_u32 as i32),
                    "Appointment end time overflowed the WinRT DateTime range",
                )
            })?,
    };

    Ok(CalendarAppointment {
        id: appointment.LocalId()?.to_string_lossy(),
        calendar_id: appointment.CalendarId()?.to_string_lossy(),
        start_at: date_time_to_iso8601(start)?,
        end_at: date_time_to_iso8601(end)?,
        all_day: appointment.AllDay()?,
        subject: optional_text(appointment.Subject(), &mut diagnostics, "subject"),
        location: optional_location(appointment.Location(), &mut diagnostics),
        busy_status: Some(map_busy_status(appointment.BusyStatus()?)),
        sensitivity: Some(map_sensitivity(appointment.Sensitivity()?)),
        is_recurring: appointment.Recurrence().is_ok(),
        diagnostics,
    })
}

fn optional_text(
    result: windows::core::Result<HSTRING>,
    diagnostics: &mut Vec<String>,
    field: &str,
) -> Option<String> {
    match result {
        Ok(value) => {
            let value = value.to_string_lossy();
            (!value.trim().is_empty()).then_some(value)
        }
        Err(error) => {
            diagnostics.push(format_windows_error(
                &format!("Could not read {field}"),
                &error,
            ));
            None
        }
    }
}

fn optional_location(
    result: windows::core::Result<HSTRING>,
    diagnostics: &mut Vec<String>,
) -> Option<String> {
    let location = optional_text(result, diagnostics, "location")?;

    if contains_url_like_value(&location) {
        diagnostics
            .push("Location was omitted because it contains a URL-like meeting link.".into());
        None
    } else {
        Some(location)
    }
}

fn contains_url_like_value(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();

    lower.contains("://")
        || lower.split_whitespace().any(|token| {
            token.starts_with("www.")
                || token.starts_with("msteams:")
                || token.starts_with("zoommtg:")
        })
        || lower.contains("teams.microsoft.com/")
        || lower.contains("zoom.us/")
}

fn map_busy_status(status: AppointmentBusyStatus) -> String {
    if status == AppointmentBusyStatus::Busy {
        "busy"
    } else if status == AppointmentBusyStatus::Tentative {
        "tentative"
    } else if status == AppointmentBusyStatus::Free {
        "free"
    } else if status == AppointmentBusyStatus::OutOfOffice {
        "outOfOffice"
    } else if status == AppointmentBusyStatus::WorkingElsewhere {
        "workingElsewhere"
    } else {
        "unknown"
    }
    .into()
}

fn map_sensitivity(sensitivity: AppointmentSensitivity) -> String {
    if sensitivity == AppointmentSensitivity::Public {
        "public"
    } else if sensitivity == AppointmentSensitivity::Private {
        "private"
    } else {
        "unknown"
    }
    .into()
}

fn failed_snapshot(
    captured_at: String,
    range_start: String,
    range_end: String,
    diagnostic: String,
) -> CalendarSnapshot {
    CalendarSnapshot {
        access_status: CalendarAccessStatus::Error,
        captured_at,
        range_start,
        range_end,
        calendars: Vec::new(),
        appointments: Vec::new(),
        diagnostics: vec![diagnostic],
    }
}

fn inspect_package_identity(diagnostics: &mut Vec<String>) -> CalendarPackageIdentityReport {
    match current_package_full_name() {
        Ok(full_name) => CalendarPackageIdentityReport {
            present: true,
            full_name: Some(full_name),
        },
        Err(error) => {
            diagnostics.push(format_windows_error(
                "The current process has no readable package identity",
                &error,
            ));
            CalendarPackageIdentityReport {
                present: false,
                full_name: None,
            }
        }
    }
}

fn current_package_full_name() -> windows::core::Result<String> {
    Package::Current()?
        .Id()?
        .FullName()
        .map(|full_name| full_name.to_string_lossy())
}

fn current_windows_date_time() -> windows::core::Result<DateTime> {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| {
            WindowsError::new(
                windows::core::HRESULT(0x80004005_u32 as i32),
                format!("System clock predates the Unix epoch: {error}"),
            )
        })?;
    let ticks = WINDOWS_TO_UNIX_EPOCH_SECONDS
        .checked_add(elapsed.as_secs() as i64)
        .and_then(|seconds| seconds.checked_mul(TICKS_PER_SECOND))
        .and_then(|ticks| ticks.checked_add((elapsed.subsec_nanos() / 100) as i64))
        .ok_or_else(|| {
            WindowsError::new(
                windows::core::HRESULT(0x80070057_u32 as i32),
                "System time overflowed the WinRT DateTime range",
            )
        })?;

    Ok(DateTime {
        UniversalTime: ticks,
    })
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

fn current_time_iso8601() -> windows::core::Result<String> {
    current_windows_date_time().and_then(date_time_to_iso8601)
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

fn classify_request_error(error: &WindowsError) -> CalendarAccessStatus {
    if error.code().0 == E_ACCESSDENIED {
        CalendarAccessStatus::Denied
    } else {
        CalendarAccessStatus::Error
    }
}

fn format_windows_error(context: &str, error: &WindowsError) -> String {
    format!(
        "{context}: HRESULT {:#010X}: {error}",
        error.code().0 as u32
    )
}

struct RoApartment;

impl RoApartment {
    fn initialize() -> windows::core::Result<Self> {
        unsafe { RoInitialize(RO_INIT_MULTITHREADED)? };
        Ok(Self)
    }
}

impl Drop for RoApartment {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::core::HRESULT;

    #[test]
    fn access_denied_hresult_maps_to_denied() {
        let error = WindowsError::from_hresult(HRESULT(E_ACCESSDENIED));

        assert!(matches!(
            classify_request_error(&error),
            CalendarAccessStatus::Denied
        ));
    }

    #[test]
    fn unknown_hresult_maps_to_error() {
        let error = WindowsError::from_hresult(HRESULT(0x80004005_u32 as i32));

        assert!(matches!(
            classify_request_error(&error),
            CalendarAccessStatus::Error
        ));
    }

    #[test]
    fn recognizes_url_like_meeting_locations() {
        assert!(contains_url_like_value("https://example.zoom.us/j/123"));
        assert!(contains_url_like_value(
            "Room 3 / teams.microsoft.com/l/meetup"
        ));
        assert!(contains_url_like_value("msteams:/l/meetup-join/opaque"));
        assert!(!contains_url_like_value("Conference Room 3"));
    }
}
