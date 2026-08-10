# Microsoft 365 Calendar companion UI Automation evidence

Date: 2026-08-10

## Environment

- Installed package: `Microsoft.M365Companions`
- Package version: `2.2605.21000.0`
- Calendar process: `Calendar.exe`
- Runtime shape: Microsoft-signed full-trust MSIX application with a WebView2
  calendar surface
- Declared capabilities observed: full trust, package management, and internet
  client; no Windows appointments capability was present
- Microsoft documents the companion as powered by Microsoft Graph

The version and executable path are test-machine evidence, not stable product
contracts.

## Windows appointment-store comparison

Installing and running the companion did not change the Windows
`AppointmentStore` result:

- access result: allowed
- calendars: 11
- hidden calendars: 0
- distinct source display names: 1
- appointments in the bounded seven-day range: 13

`AllCalendarsReadOnly` already asks Windows for every calendar published into
that store. Attention Hub can choose among those returned calendars, but it has
no API switch that makes New Outlook or the companion publish a missing work
account into the store.

An exploratory count-only attempt to follow each calendar's
`UserDataAccountId` crashed the isolated live test process with
`STATUS_ACCESS_VIOLATION` twice. The probe was removed and no decision relies on
it. The stable `SourceDisplayName` result above is sufficient to establish that
the companion did not add another published provider.

## Sanitized accessibility observations

The probe was bounded to 16 native windows, 10,000 elements, 500 returned
candidates, and five seconds. It returned only structural metadata. Raw event
subjects, people, account identifiers, locations, ARIA values, and meeting URLs
were never logged or returned through Tauri.

### Companion flyout visible

A successful visible sample found:

- 1 visible companion window, approximately 450 by 724 pixels
- 139 accessibility elements
- 31 sanitized calendar/time candidates
- at least 3 distinct event-row controls
- time-like values and busy/tentative markers
- URL-like content detected but not emitted
- event-like rows exposing the UI Automation Invoke pattern

This proves the visible companion surface is structurally observable.

### Companion closed/backgrounded

With the flyout closed, the process tree still owned 13 hidden native windows
and exposed 13 accessibility roots, but only 21 elements and one shell-level
candidate were present. There were zero time-like, URL-like, or invokable
time-like candidates. A repeat after 0.5, 1.5, and 3 seconds produced the same
result.

The event WebView accessibility tree is therefore loaded for the visible
flyout and removed when the flyout closes. Hidden HWND presence is not a usable
background agenda source.

## Finding

The companion is a viable manual foreground observation surface but not a
reliable passive provider for Attention Hub. Automatically opening or flashing
the taskbar flyout to refresh data would control another application and create
visual interruption, conflicting with the observer-only and persistent,
non-interruptive product principles. Caching the last user-opened view would be
manual and potentially stale.

Decision: do not implement normalized agenda extraction from this surface and
do not retain it as an authoritative calendar provider. Keep the Graph spike
paused unless the organization explicitly approves an application registration
and delegated consent.
