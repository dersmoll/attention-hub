# Attention Hub 0.5.0-beta.1

- Released: 2026-08-19
- Status: public beta
- Platform: Windows x64
- Format: unsigned NSIS setup executable
- Tag: `v0.5.0-beta.1`

## Highlights

- Added the local-first Later Inbox with Work/Private grouping, link-aware
  notes, optional follow-up times, collapsed review context, and notifications
  while Attention Hub is running.
- Stabilized tray-resident activation for supported messenger applications and
  removed stale or placeholder Outlook badges when semantic Inbox state is not
  exposed.
- Added compact Join actions for allowlisted Teams, Zoom, Google Meet, and Webex
  links without sending raw meeting URLs through serialized IPC.
- Added two-way Local and secondary-zone time conversion.
- Fixed the active-event acknowledgement hover contrast.
- Replaced the application and installer artwork with the Focus Hub icon.

Existing communication semantics remain unchanged: DWM pixels are visual-only,
Slack, Viber, and WhatsApp do not claim unread counts, and unavailable source
state remains explicit.

## Download verification

- File: `Attention-Hub_0.5.0-beta.1_x64-setup.exe`
- Size: 3,115,650 bytes
- SHA-256: `8C2B0D4CBB4A55834FFD69D0B9CC05E908DAC61044538BF09FDFCAC5915DF632`
- Embedded product/file version: `0.5.0-beta.1`
- Authenticode: not signed

Windows SmartScreen may warn because this beta is unsigned. Verify the checksum
before installation.

## Validation

- TypeScript and Vite production build passed.
- Attention, Later Inbox, preferences, time-zone, and responsive layout suites
  passed.
- All 45 Rust tests passed.
- Strict Clippy, Rust formatting, and source-diff hygiene passed.
- The user tested the installed beta over multiple workdays and accepted the
  final release-polish candidate, including the new icon and two-way converter.
- The final repository privacy scan found no personal Windows profile path,
  personal email address, private key marker, real credential, or saved calendar
  secret. Security tests retain only explicit placeholder URLs and credentials.

## Known limits

This release has no code signing, installer-managed autostart, Hub tray process,
updater, telemetry, cloud synchronization, attachments, OCR, Microsoft Graph,
generalized provider framework, or reminders while the app is closed.
