# Attention Hub 0.6.0-beta.1

- Released: 2026-08-21
- Status: public beta
- Platform: Windows x64
- Format: unsigned NSIS setup executable
- Tag: `v0.6.0-beta.1`

## Highlights

- Made the 68 px **Recommended** widget the fresh default and consolidated the
  previous Auto and Wide choices into a roomier **Larger** preset. Native DWM
  surfaces follow the selected geometry.
- Rebuilt Advanced as a compact, PowerToys-inspired settings window with
  General, Clocks, Apps, Calendar, Reminders, and Diagnostics pages.
- Fresh installs now show Teams and Outlook only. Advanced retains the fixed
  six-app catalog, explicit visual-mirror controls, ordering, and a one-shot
  local detection scan.
- Added a local primary-clock timezone override, shorter widget labels, full
  IANA search in Advanced, grouped UTC/city choices, and `Kyiv` normalization.
- Expanded panel opacity to 25–100% with low-opacity readability guidance.
- Reworked Later Inbox into a list-first reminder flow with a three-step
  What/When/Details wizard, reminder badges, compact item actions, and confirmed
  single-item deletion.
- Added bounded simultaneous and overlapping calendar-event display. Join and
  **I'm in** locally select the chosen meeting; **Finish** can hide an
  acknowledged active event until its scheduled end without editing the source
  calendar.
- Added a first-run Calendar setup shortcut, hover details for truncated event
  text, denser calendar cards, and a dedicated utility rail for pin, close,
  reminders, and Advanced.

Existing trust boundaries remain unchanged: taskbar pixels are visual-only,
calendar and meeting URLs stay behind their established native boundaries, and
unavailable source state is reported without invented counts.

## Download verification

- File: `Attention-Hub_0.6.0-beta.1_x64-setup.exe`
- Size: 3,126,066 bytes
- SHA-256: `9254093DCA22A4300205BD885D0DBE0ADBF595E4BE27CB7B311B4D368DC5E9DE`
- Embedded product/file version: `0.6.0-beta.1`
- Authenticode: not signed

Windows SmartScreen may warn because this beta is unsigned. Verify the checksum
before installation.

## Validation

- TypeScript and Vite production build passed.
- Advanced-focus, attention, Later Inbox, preferences, timezone, work-calendar,
  and responsive-layout suites passed.
- All 48 Rust tests, strict Clippy, Rust formatting, source-diff hygiene, and
  the final repository privacy scan passed.
- The user tested and accepted the final Milestone 10 widget, calendar,
  reminders, timezone, and Advanced-settings candidate before release.

## Known limits

This release remains unsigned and has no installer-managed autostart, Hub tray
process, updater, telemetry, cloud synchronization, attachments, OCR, Microsoft
Graph, generalized provider framework, or reminders while the app is closed.
Classic Outlook semantic support and generalized taskbar-item pinning are not
included. On multi-monitor taskbars, Attention Hub does not inspect badge pixels
to choose between visually different surfaces.
