# Architecture

## Runtime

Attention Hub is a Windows-only Tauri 2 application. React and TypeScript render
the WebView surfaces; Rust owns operating-system integration, calendar fetching
and parsing, secure link activation, unified local workspace storage, and the app's
own local reminders.

The production bundle is one x64 NSIS installer. The primary window is a
frameless, fixed-height widget with responsive width based on enabled sources
and calendar density. Advanced, Project Hub, Today, and project panels are created on demand.

## Main surfaces

### Communication sources

The source list is deliberately fixed: Microsoft Teams, Telegram, New Outlook,
Slack, Viber, and WhatsApp.

Fresh preferences show Teams and Outlook, with only the Teams live visual
enabled. Existing explicit selections are preserved. Advanced can reset to the
quiet default, enable the full fixed catalog, or run a one-shot local scan of
all six sources; disabled sources are never added or polled in the background
by that scan.

- Telegram can expose a numeric application counter, which the widget shows
  with a neutral badge. The available accessibility totals include channel
  activity and cannot reliably prove a private message, so the widget does not
  infer a red private-message state.
- Teams can expose bounded activity state without inventing a number.
- Outlook can expose an Inbox count while its semantic label is fresh; hidden
  or unavailable semantic state produces no stale placeholder badge.
- Slack, Viber, and WhatsApp expose process presence, native activation, and
  optional taskbar visuals only.
- Teams and Telegram may also use taskbar visuals, but visual and semantic state
  remain separate.

Native activation selects known main-window classes and supports tray-resident
applications without area-ranking arbitrary hidden windows.

Semantic attention matching currently depends on English accessibility labels
exposed by the observed applications. Other UI languages can report a truthful
`notExposed` state; the app does not infer a count when the expected semantic
label is unavailable.

### DWM visual boundary

Taskbar mirrors use Windows DWM thumbnails. They are rendered by Windows into
owned inset surfaces. Attention Hub does not capture, inspect, OCR, classify,
or convert those pixels into semantic state.

### Clocks

The widget shows a primary clock and one stored IANA secondary timezone. The
primary follows the Windows system timezone unless the user stores an explicit
IANA override. That override affects only the primary clock and converter, not
calendar selection, to-do reminders, notifications, or Windows. Both
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

Only event subject, time, classification, all-day state, meeting-link presence,
and bounded Today-workspace metadata cross serialized IPC. Raw recurrence UIDs
stay native; eligible recurring non-private timed events receive source-scoped
SHA-256 identities and opaque process tokens. The bounded selection contains one primary
active-or-next event, at most one separately redacted timed event with the same
upcoming start or an overlapping active time, and at most one later upcoming
companion. Allowlisted Teams, Zoom, Google Meet, and Webex URLs remain in a
Rust memory cache. Each exposed event receives its own ephemeral token; the
current URL is resolved and opened only after explicit activation. Google Meet
room URLs are canonicalized without account-specific query or fragment data.

The provider never controls Outlook. AppointmentStore, Outlook My Day UI
Automation, Microsoft Graph, OCR, and generalized calendar providers are not
part of the production command surface.

### Project Hub, event settings, and to-dos

One versioned `workspace.json` store owns projects, personal categories and
lists, useful project links, project/personal to-dos, and calendar bindings.
The store is created lazily on its first mutation, limited to 4 MiB, validated
before use, and written through `workspace.pending.json` with one bounded
`workspace.backup.json`. A first write after backup recovery preserves the
known-good backup rather than copying a corrupt primary over it.

Advanced settings can export that workspace into a user-selected, versioned
JSON transfer file. The transfer excludes widget preferences and the Published
ICS credential. Import is replacement-only: Rust validates the bounded file,
returns content counts for confirmation, then re-reads it and verifies both the
preview digest and current workspace revision before writing. A successful
import increments the local revision, preserves the previous workspace as the
bounded backup, and emits `workspace-changed` to every open consumer.

Each mutation increments a monotonic workspace revision and emits
`workspace-changed`; all mounted consumers refetch the authoritative snapshot.
Cascading project/list/category/delete-all actions preflight backend-owned
counts and reject a confirmation whose revision has gone stale. Archive is the
normal reversible project action; archived project data and calendar bindings
remain intact, while its to-dos are excluded from global Today/widget attention.

Projects contain bounded link-aware notes, useful HTTP(S) links, timestamps,
and a notes-specific revision. Notes autosave optimistically across windows:
rename/archive/reorder cannot create a false conflict, a rejected save retains
the user's draft, and edits typed during an in-flight save remain dirty. Saved
links are looked up and revalidated in Rust immediately before Windows opens
them; no favicon or service API request is made.

Every to-do is owned by a project or personal list. It has a title, bounded
link-aware notes, independent optional `dueOn` (a local `YYYY-MM-DD`) and
`remindAt` (an RFC3339 instant), and completion/notification timestamps. To-do
order is derived from completion and the earliest due/reminder value; projects,
personal categories/lists, and useful links use explicit ordering controls.
Notifications are one-shot per reminder value and only run while Attention Hub
is open.

Event settings can bind a non-private event to a project and either a selected
project link or a direct HTTP(S) fallback. Recurring events use source-scoped
series identity; one-off events use source-scoped event identity. Today can open
the complete anchored project panel, a Notes-only panel, or a pending-To-dos
panel. Project Hub has top-level Projects and All To-dos views. Projects uses a
two-column manager with Projects and grouped Personal lists in the sidebar and
Notes/Links/To-dos in the detail pane. All To-dos uses the full window for one
chronological cross-owner list; each row identifies its project or personal
list and preserves inline completion, notes, edit, and delete actions.

### Widget composition

The fixed-height widget separates communication sources, clocks, flexible
calendar content, a narrow destination panel, and the original three-control
close/pin/Settings utility rail. The destination panel has a Today segment and
a vertically split Projects/All To-dos segment. Today reports meetings and
actionable to-dos left; All To-dos retains the active count while attention is
expressed as a stronger tone. Destination labels remain in Recommended mode
and collapse to icons in Compact single-line. All four optional content panels
(shortcuts, clocks, Today, and Projects/To-dos) can be hidden independently.
Full truncated current and
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

Recommended mode is the standard two-line clock layout. Dual calendar cards
align at their top edges. Join and local Finish actions do not reserve title
width: they overlay the card only on hover or keyboard focus.
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

Recommended is the fresh preference default. Preference normalization maps
legacy `compact`, `auto`, `wide`, and `larger` values to `recommended`.
Compact single-line is the only alternate size preset.

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
  acknowledgement, to-do notification preference, and floating-window geometry.
- Tauri application-data directory: one unified `workspace.json` plus pending
  and bounded-backup files.
- User-selected files: optional manual workspace exports containing Project Hub
  and to-do data, written only after an explicit Export action.
- Windows Credential Manager: the single Published ICS source URL.
- Process memory only: current meeting URLs and ephemeral join tokens.

No message bodies, notification bodies, calendar publication URLs, raw
recurrence UIDs, Project Hub content, account
identifiers, or DWM pixels are written to diagnostics.

Attention Hub does not request Windows Notification Center access, enumerate
other applications' notifications, or read their notification payloads. The
meeting sound and to-do notifications are generated locally by Attention
Hub from its own calendar and reminder state.

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
