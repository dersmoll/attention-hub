# Attention Hub

Attention Hub is a local-first Windows desktop widget for communication
attention, two-zone time, work-calendar context, and a small Later Inbox.
It observes source applications without replacing them or collecting account
credentials.

## Current beta

Version `0.6.0-beta.3` is the current public beta.

[Download the unsigned Windows installer](https://github.com/dersmoll/attention-hub/releases/tag/v0.6.0-beta.3)

Windows SmartScreen may warn because this beta is not code-signed. The release
page publishes the exact installer checksum for verification.

## What it does

- Shows a fixed catalog of Microsoft Teams, Telegram, New Outlook, Slack,
  Viber, and WhatsApp surfaces with truthful source-specific availability.
  Fresh installs start with Teams and Outlook shown; the other regional
  messengers remain available as explicit choices in Advanced.
- Displays a primary clock that follows Windows by default and a selectable
  secondary clock. The widget uses short city labels and a compact set of
  human-readable UTC/city groups; Advanced can search the full IANA catalog.
  The legacy `Europe/Kiev` alias is normalized to `Europe/Kyiv`. The primary
  timezone can be overridden locally, and either clock opens the inline
  converter in the corresponding direction. Converter mode preserves the live
  clock's centered two-column layout, keeps the day marker on a separate line,
  retains the native time picker, and returns to live clocks with **Esc**.
- Shows the active or next event from one user-supplied Published ICS calendar,
  plus at most one timed event with the same upcoming start or an overlapping
  active time. Allowlisted Teams, Zoom, Google Meet, and Webex links use compact
  **Join** actions that appear on hover or keyboard focus. A successful Join
  selects that event and locally hides its parallel peer. Started events also
  expose **I'm in** beside Join until either action acknowledges the event.
  **Finish** locally hides an acknowledged active event until its scheduled end
  or app restart; neither action edits the calendar.
  An unconfigured widget shows a compact **Set up** action that opens Advanced
  at the masked Published ICS field; configured calendars with no current or
  upcoming event retain the ordinary empty state.
- Provides a compact local Later Inbox with Work/Private grouping, link-aware
  notes, optional follow-up times, and notifications while the app is running.
  The widget reminder control opens its list-first view; **Add new reminder**
  starts a three-step What/When/Details flow with the next quarter-hour
  prefilled. Reminder cards provide compact complete, edit, and confirmed
  delete actions.
- Keeps pin, close, reminders, and Advanced in a compact right-side utility
  rail, separate from communication sources and calendar content.
- Uses the **Recommended** widget size by default: a 68px window with 60px
  panels, 40px source buttons, 34px visual surfaces, 4px source gaps, and a
  208px two-zone clock. Its calendar is 272px wide for one event and expands to
  392px while current and next events are both visible. The **Larger** option
  uses an 80px window, 48px source buttons, a 240px clock, and a fixed 416px
  calendar. Legacy Compact and old-default Auto preferences migrate to
  Recommended; an explicitly selected legacy Wide preference migrates to
  Larger. The Compact name is reserved for a future one-line mode.
  Native DWM mirrors remain synchronized with the selected geometry.
- Organizes Advanced into a PowerToys-inspired two-column layout with a fixed
  navigation sidebar and focused General, Clocks, Apps, Calendar, Reminders,
  and Diagnostics pages. Controls share a compact, consistent visual scale.
- Preserves position, pinning, appearance, source order, calendar selection,
  and Later Inbox data locally.

## Trust boundaries

- DWM thumbnails are visual-only. Attention Hub does not read their pixels or
  infer counts from them.
- Telegram may expose a numeric application counter. Teams exposes bounded
  activity state. Outlook shows an Inbox number only while Windows exposes a
  fresh semantic label. Slack, Viber, and WhatsApp remain presence, activation,
  and optional visual surfaces without invented unread counts.
- The calendar publication URL is stored in Windows Credential Manager and is
  never written to the WebView, logs, fixtures, or documentation.
- Meeting URLs remain in Rust process memory behind short-lived tokens and open
  only after the user clicks **Join**.
- There is no telemetry, cloud backend, account aggregation, OCR, or Graph
  integration.

See [Privacy](docs/privacy.md), [Architecture](docs/architecture.md), and
[Stable decisions](docs/decisions/README.md) for the public technical boundary.
The current artifact and validation record is in
[the 0.6.0-beta.3 release notes](docs/releases/attention-hub-0.6.0-beta.3.md).

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
