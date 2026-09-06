# Attention Hub

Attention Hub source code is available under the [MIT License](LICENSE).
The bundled meeting sound has separate non-commercial terms documented in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Attention Hub is a local-first Windows desktop widget for communication
attention, multi-zone time, work-calendar context, Projects, and personal to-dos.
It observes source applications without replacing them or collecting account
credentials.

## Current beta

Version `0.6.0-beta.12` is the current public beta.

[Download the Windows beta](https://github.com/dersmoll/attention-hub/releases/tag/v0.6.0-beta.12)

Windows SmartScreen may warn because this beta is not code-signed. The release
page publishes the exact installer checksum for verification. Attention Hub's
separate Tauri updater signature remains the validation path for in-app beta
updates.

## What it does

- Shows a fixed catalog of Microsoft Teams, Telegram, New Outlook, Slack,
  Viber, and WhatsApp surfaces with truthful source-specific availability.
  Fresh installs start with Teams and Outlook shown; the other regional
  messengers remain available as explicit choices in Advanced.
  Semantic attention matching currently depends on English accessibility
  labels from those applications. Other application UI languages can return a
  truthful unavailable state instead of an inferred or stale count.
- Displays two to five clocks in a horizontal or compact vertical layout. The
  entire clock segment can be hidden without losing its configuration. The
  widget uses short city labels and a compact set of human-readable UTC/city
  groups; Advanced can search the full IANA catalog.
  The legacy `Europe/Kiev` alias is normalized to `Europe/Kyiv`. The primary
  timezone can be overridden locally, and either clock opens the inline
  converter in the corresponding direction. Converter mode preserves the live
  clock's centered two-column layout, keeps the day marker on a separate line,
  retains the native time picker, and returns to live clocks with **Esc**.
- Shows the active or next event from one user-supplied Published ICS calendar,
  plus at most one timed event with the same upcoming start or an overlapping
  active time. Teams and Zoom meetings show a compact provider indicator.
  Allowlisted Teams, Zoom, Google Meet, and Webex links use compact **Join**
  actions that appear on hover or keyboard focus. A successful Join
  selects that event and locally hides its parallel peer. Started events also
  expose **I'm in** beside Join until either action acknowledges the event.
  **Finish** locally hides an acknowledged active event until its scheduled end
  or app restart; neither action edits the calendar.
  Clicking the calendar surface opens a compact same-day meeting summary.
  Upcoming and newly started meetings receive a local visual cue, and a bundled
  start sound is enabled by default with an Advanced setting to disable it.
  An unconfigured widget shows a compact **Set up** action that opens Advanced
  at the masked Published ICS field; configured calendars with no current or
  upcoming event retain the ordinary empty state.
- Any non-private event in the main widget or **Today** summary can keep optional local event
  settings: a Project Hub project, an HTTP(S) work link, or both. Recurring events
  share settings across their series; one-off events retain their own link.
  Multiple events may share the same bounded text, bullet, and link-aware
  project notes, useful links, and to-dos. Attention Hub opens saved links in the default browser; it
  does not authenticate with or submit time to an external service.
- Provides one local Project Hub for project notes, typed useful links, project
  to-dos, and personal lists grouped under optional personal categories. To-dos
  support independent optional due dates and reminder times, inline editing,
  completion/restoration, link-aware notes, and local notifications while the
  app is running. A top-level **All To-dos** view provides one chronological
  list across every project and personal list with owner context and inline
  actions. Today includes overdue, due-today, and reminder-relevant items.
  Advanced settings can manually export the complete workspace to a portable
  JSON file and replace the local workspace from a validated export after a
  count preview and explicit confirmation.
- Keeps close, pin, and Advanced in a compact right-side utility rail. A narrow
  destination panel after the calendar opens Today, Projects, or the flat
  All To-dos view without competing with source and calendar actions. Today
  reports meetings and relevant to-dos left; All To-dos shows the active count. Pinning is an
  Appearance preference and native context-menu action.
- App shortcuts, clocks, Today, and Projects/To-dos can be hidden independently
  without changing their configuration or privacy semantics. Native visual
  mirrors pause while app shortcuts are hidden.
- Uses the **Recommended** widget size by default: the dense two-line layout
  with a calendar that expands when current and next events are both visible.
  **Compact single-line** uses a unified horizontal rail with smaller app
  surfaces, inline time-and-city pairs, a one-line calendar, and horizontal
  utility controls. Its persisted value is `slim`. Legacy Compact, Auto, Wide,
  and Larger preferences all migrate safely to Recommended.
  Native DWM mirrors remain synchronized with the selected geometry.
- Organizes Advanced into a PowerToys-inspired two-column layout with a fixed
  navigation sidebar and focused General, Clocks, Apps, Calendar, Reminders,
  and Diagnostics pages. Controls share a compact, consistent visual scale.
- Preserves position, pinning, appearance, source order, calendar selection,
  and unified Project Hub/to-do workspace data locally.

## Trust boundaries

- DWM thumbnails are visual-only. Attention Hub does not read their pixels or
  infer counts from them.
- Telegram may expose a numeric application counter, which uses a neutral badge.
  Telegram's current accessibility totals do not distinguish private messages
  reliably, so Attention Hub does not infer a red private-message state. Teams
  exposes bounded activity state. Outlook shows an Inbox number only while
  Windows exposes a fresh semantic label. Slack, Viber, and WhatsApp remain
  presence, activation, and optional visual surfaces without invented unread
  counts. When enabled, Viber's live visual surface mirrors the Windows-owned
  taskbar icon and its native badge without reading pixels or deriving a
  synthetic count.
- The calendar publication URL is stored in Windows Credential Manager and is
  never written to the WebView, logs, fixtures, or documentation.
- Meeting URLs remain in Rust process memory behind short-lived tokens and open
  only after the user clicks **Join**.
- Raw calendar recurrence UIDs remain native. The Today summary receives only
  an opaque workspace token and user-created project summary for eligible
  recurring, non-private timed events.
- There is no telemetry, cloud backend, account aggregation, OCR, or Graph
  integration.
- Attention Hub does not request access to Windows Notification Center and does
  not read message or notification bodies. Its own to-do and meeting
  reminders are local app-generated notifications and sounds.

See [Privacy](docs/privacy.md), [Architecture](docs/architecture.md), and
[Stable decisions](docs/decisions/README.md) for the public technical boundary.
The current artifact and validation record is in
[the 0.6.0-beta.12 release notes](docs/releases/attention-hub-0.6.0-beta.12.md).

## Development

Requirements: Node.js, pnpm, Rust with the MSVC target, Microsoft C++ Build
Tools with the Desktop C++ workload, and WebView2.

```powershell
pnpm install --frozen-lockfile
pnpm build
cd src-tauri
cargo test --all-targets
cargo clippy --all-targets --all-features -- -D warnings
cd ..
pnpm tauri dev
```

Create the Windows installer with:

```powershell
pnpm tauri build
```

Generated `dist`, Cargo `target`, packages, certificates, and installers are
build output and must not be committed.

## Scope

Attention Hub is currently Windows-only. Autostart, a tray-resident Hub,
updating, signing, arbitrary providers, attachments, closed-app reminders, and
cloud synchronization are intentionally outside this beta.
