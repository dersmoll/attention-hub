# Attention Hub

Attention Hub is a local-first Windows desktop widget for communication
attention, two-zone time, work-calendar context, and a small Later Inbox.
It observes source applications without replacing them or collecting account
credentials.

## Current beta

Version `0.5.0-beta.1` is the current public beta.

[Download the unsigned Windows installer](https://github.com/dersmoll/attention-hub/releases/tag/v0.5.0-beta.1)

Windows SmartScreen may warn because this beta is not code-signed. The release
page publishes the exact installer checksum for verification.

## What it does

- Shows fixed Microsoft Teams, Telegram, New Outlook, Slack, Viber, and
  WhatsApp surfaces with truthful source-specific availability.
- Displays Local and a selectable secondary clock. Either clock opens the
  inline converter in the corresponding direction.
- Shows the active or next event from one user-supplied Published ICS calendar.
  Allowlisted Teams, Zoom, Google Meet, and Webex meeting links can be opened
  with the compact **Join** action.
- Provides a compact local Later Inbox with Work/Private grouping, link-aware
  notes, optional follow-up times, and notifications while the app is running.
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
[the 0.5.0-beta.1 release notes](docs/releases/attention-hub-0.5.0-beta.1.md).

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
