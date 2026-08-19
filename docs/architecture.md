# Architecture

## Runtime

Attention Hub is a Windows-only Tauri 2 application. React and TypeScript render
the WebView surfaces; Rust owns operating-system integration, calendar fetching
and parsing, secure link activation, local Later Inbox storage, and native
notifications.

The production bundle is one x64 NSIS installer. The primary window is a
frameless, fixed-height widget with responsive width based on enabled sources
and calendar density. Advanced and Later Inbox are created on demand.

## Main surfaces

### Communication sources

The source list is deliberately fixed: Microsoft Teams, Telegram, New Outlook,
Slack, Viber, and WhatsApp.

- Telegram can expose a numeric application counter.
- Teams can expose bounded activity state without inventing a number.
- Outlook can expose an Inbox count while its semantic label is fresh; hidden
  or unavailable semantic state produces no stale placeholder badge.
- Slack, Viber, and WhatsApp expose process presence, native activation, and
  optional taskbar visuals only.
- Teams and Telegram may also use taskbar visuals, but visual and semantic state
  remain separate.

Native activation selects known main-window classes and supports tray-resident
applications without area-ranking arbitrary hidden windows.

### DWM visual boundary

Taskbar mirrors use Windows DWM thumbnails. They are rendered by Windows into
owned inset surfaces. Attention Hub does not capture, inspect, OCR, classify,
or convert those pixels into semantic state.

### Clocks

The widget shows Local and one stored IANA secondary timezone. Both live times
open the same inline converter. Conversion resolves the entered wall time in
the selected source zone, handles day rollover, and rejects nonexistent DST
times.

### Work calendar

The user may save one HTTPS Published ICS source. Its secret URL is stored under
an application-owned Windows Credential Manager target. Rust performs bounded
fetching, calendar structure validation, recurrence expansion, timezone
mapping, privacy redaction, and active/next selection.

Only event subject, time, classification, all-day state, and meeting-link
presence cross serialized IPC. Allowlisted Teams, Zoom, Google Meet, and Webex
URLs remain in a Rust memory cache. The WebView receives an ephemeral token;
the current URL is resolved and opened only after explicit activation. Google
Meet room URLs are canonicalized without account-specific query or fragment
data.

The provider never controls Outlook. AppointmentStore, Outlook My Day UI
Automation, Microsoft Graph, OCR, and generalized calendar providers are not
part of the production command surface.

### Later Inbox

Later Inbox is a local JSON store in the Tauri application-data directory. The
current schema is versioned and validated before use. Writes use a temporary
file and replacement flow; the previous valid store is retained as a bounded
backup except for destructive content removal.

Items contain a title, Work/Private group, optional project/context, bounded
link-aware text segments, optional HTTP(S) URL, optional follow-up time, state,
and timestamps. Arbitrary HTML and attachments are not stored. Link activation
is revalidated against the saved item.

Follow-up notifications are one-shot per due value and are emitted only while
Attention Hub is running.

## Persistence

- WebView local storage: widget preferences, appearance, source order, calendar
  acknowledgement, and Later Inbox UI preferences.
- Tauri application-data directory: Later Inbox JSON and bounded backup.
- Windows Credential Manager: the single Published ICS source URL.
- Process memory only: current meeting URLs and ephemeral join tokens.

No message bodies, notification bodies, calendar publication URLs, Later Inbox
content, account identifiers, or DWM pixels are written to diagnostics.

## IPC and security

The WebView uses an allowlisted Tauri command surface and a restrictive content
security policy: local assets by default and only Tauri IPC connectivity.
Native inputs are bounded, normalized, and validated again in Rust. External
URLs require HTTPS, reject embedded credentials and non-default ports where
applicable, and open only after explicit user action.

## Lifecycle

The widget polls bounded source snapshots and refreshes the saved calendar at
controlled intervals. Native listeners and taskbar mirrors are cleaned up when
the owning surface exits. There is no installer-managed autostart, Hub tray
process, updater, or closed-app reminder service in this beta.

## Validation

Release gates include TypeScript compilation, Vite production build, focused
frontend model tests, all Rust targets, strict Clippy, Rust formatting, source
hygiene checks, NSIS packaging, checksum verification, and user-run installed
smoke testing.
