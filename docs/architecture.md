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

Fresh preferences show Teams and Outlook, with only the Teams live visual
enabled. Existing explicit selections are preserved. Advanced can reset to the
quiet default, enable the full fixed catalog, or run a one-shot local scan of
all six sources; disabled sources are never added or polled in the background
by that scan.

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

The widget shows a primary clock and one stored IANA secondary timezone. The
primary follows the Windows system timezone unless the user stores an explicit
IANA override. That override affects only the primary clock and converter, not
calendar selection, Later Inbox follow-ups, notifications, or Windows. Both
live times open the same inline converter. Conversion resolves the entered wall
time in the selected source zone, handles day rollover, and rejects nonexistent
DST times. Converter mode keeps the live clock's centered two-column layout,
uses the native time picker, places the target day marker on its own line, and
returns to live clocks with Escape. The widget displays short city labels and
offers a compact list of representative rules formatted as a UTC offset plus
familiar equivalent-city names and the full IANA identifier. Advanced provides
text search across the runtime-supported IANA catalog. The obsolete
`Europe/Kiev` alias is normalized
to `Europe/Kyiv`, while persisted values otherwise remain IANA identifiers.

### Work calendar

The user may save one HTTPS Published ICS source. Its secret URL is stored under
an application-owned Windows Credential Manager target. Rust performs bounded
fetching, calendar structure validation, recurrence expansion, timezone
mapping, privacy redaction, and active/next selection.

Only event subject, time, classification, all-day state, and meeting-link
presence cross serialized IPC. The bounded selection contains one primary
active-or-next event, at most one separately redacted timed event with the same
upcoming start or an overlapping active time, and at most one later upcoming
companion. Allowlisted Teams, Zoom, Google Meet, and Webex URLs remain in a
Rust memory cache. Each exposed event receives its own ephemeral token; the
current URL is resolved and opened only after explicit activation. Google Meet
room URLs are canonicalized without account-specific query or fragment data.

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

The widget reminder action opens the list-first Later Inbox. **Add new
reminder** starts a three-step What/When/Details flow; new reminders require a
follow-up time and start at the next quarter-hour. Step labels are direct
navigation controls; Work/Private and the bounded link-aware notes editor live
in Details. The wizard writes through the existing store and notification
lifecycle, never enables notifications automatically, preserves pre-existing
URL data without exposing a new URL field, and never replaces an existing
unsaved draft. Single-item deletion requires inline confirmation and uses the
same privacy-preserving destructive-write path as bulk deletion, so deleted
content is not retained in the backup.

### Widget composition

The fixed-height widget separates four zones: communication sources, the two
clocks, calendar content, and a 68 px right-side utility rail. The rail owns
pin, close, reminders, and Advanced, so source buttons remain source-only and
calendar width remains available for event text. Full truncated current and
next event text is available through native hover titles. Recommended mode
reduces the source strip from 48 px buttons/8 px gaps to 40 px buttons/4 px gaps with
34 px visual surfaces and reduced padding. Its window height is 68 px, with
60 px panels and a correspondingly smaller utility rail. Its calendar uses
272 px for one event and 392 px for the acknowledged-current plus next-event
composition. A distinct event-state pill, truncated title, and available action
share each header row; acknowledged **In progress** uses a restrained green
state while unacknowledged started-event attention remains red. The native DWM
destination uses the same density flag and geometry, so visual mirrors stay
aligned with React.

Recommended mode uses a 208 px two-zone clock; Larger uses 240 px. Its three
inter-zone gaps use 6 px rather than Larger's 8 px. Larger uses an 80 px window,
48 px source buttons, and a fixed 416 px calendar for either one or two events.
Dual calendar cards align at their top edges. Join and local Finish actions do
not reserve title width: they overlay the card only on hover or keyboard focus.
When two timed events overlap, both active cards take the two bounded columns
and the future event waits until a column becomes available. Finish is a
session-only display suppression until the scheduled event end; it is neither
persisted nor written back to the Published ICS source.

Two timed events with the exact same upcoming start use the same two-card
layout before they begin. Both become unacknowledged **Meeting started** cards
at the transition. A successful Join (or the no-link **I'm in** fallback)
selects that event, locally suppresses its parallel peer, and carries the
selected card into **In progress**. A failed link-open attempt changes no
selection state.

Recommended event cards use a 7 px header-to-detail gap and a separate 3 px gap
before progress. The countdown is a separate higher-contrast text run before
the muted range and online-meeting metadata. Join, I'm in, and Finish remain
hover/focus actions in either calendar column. An unacknowledged started event
shows I'm in and, when available, Join together; successful Join acknowledges
the selected event and removes I'm in. Hover actions sit 4 px from the calendar
panel's top-right edge. Recommended utility surfaces are 26 px with 14 px glyphs
inside unchanged 28 px controls.

Recommended is the fresh preference default and reuses the previously shipped
Compact geometry. Preference normalization maps legacy `compact` and the old
default `auto` to `recommended`; only an explicitly selected legacy `wide`
maps to `larger`. Larger intentionally uses the former fixed-Wide geometry. The
Compact product name is reserved for a future one-line mode and is not exposed
in this milestone.

### Advanced settings

Advanced uses a PowerToys-inspired two-column shell: a fixed 190 px navigation
sidebar and one scrollable active page. The six pages are General, Clocks,
Apps, Calendar, Reminders, and Diagnostics. The window opens at 900×680 px with
a 720×560 px minimum; the content column is capped at 680 px and form controls
use a consistent 32 px height. Pages remain mounted but hidden so local drafts
and listener state survive navigation. The `work-calendar` focus request first
selects Calendar, then focuses the existing masked Published ICS field without
moving the secret URL outside the native credential path.

When the provider reports `notConfigured`, the existing calendar panel keeps
its normal dimensions and shows a compact setup row. Its **Set up** action
opens or focuses Advanced, scrolls to the work-calendar section, and focuses
the masked Published ICS field. The cross-window request carries only the
constant `work-calendar` focus target; the secret URL remains exclusively in
the existing Advanced form and secure native save path. A configured calendar
with no selected event continues to show its ordinary empty state.

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
