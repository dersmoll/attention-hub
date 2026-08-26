# Attention Hub 0.6.0-beta.6

- Built: 2026-08-26
- Status: release candidate; not yet published
- Platform: Windows x64
- Format: unsigned NSIS setup executable
- Intended tag: `v0.6.0-beta.6`

## Milestone 12

- App shortcuts and clocks can be hidden independently without losing their
  saved configuration. The controls live together on General and are also
  available through the widget's native right-click menu.
- Compact single-line mode places enabled panels and smaller utility actions in
  one horizontal rail. Its calendar width follows bounded content density and
  a dedicated dotted handle keeps the widget draggable when other panels are
  hidden.
- The Today summary opens on the available side of the widget with a stable
  five-pixel gap. Its height follows the rendered event count, completed events
  are muted and crossed out, and compact rows no longer inherit global list
  spacing.
- Telegram's numeric application counter uses a neutral badge. Available
  accessibility totals include channel activity and cannot reliably identify a
  private message, so Attention Hub does not infer a red private-message state.

## Pre-release hardening

- The source is licensed under MIT using the public project identity
  `dersmoll`. The bundled ElevenLabs free-plan meeting sound remains a separate
  attributed, non-commercial asset and is excluded from the MIT grant.
- The retired Windows Notification Center listener and unused mirror commands
  were removed. Attention Hub still creates only its own local meeting and
  Later Inbox reminders.
- Startup now begins hidden, applies saved and monitor-clamped geometry, then
  shows the widget. Native visual polling is limited to enabled sources and
  stable desired-state transitions.
- Raw widget failures were replaced with short-lived user-safe notices. Failed
  calendar verification retains the entered URL for retry, Advanced displays
  the running app version, and the Today surface supports keyboard activation.
- Documentation now states the English accessibility-label limitation and the
  explicit notification/privacy boundary.

## Download verification

- File: `Attention-Hub_0.6.0-beta.6_x64-setup.exe`
- Size: 3,187,441 bytes
- SHA-256: `840E2E96C93C922D688D8938821413163E470FDAA7ECBDCE6DD7E602A55EDCF6`
- Embedded product/file version: `0.6.0-beta.6`
- Authenticode: not signed

Windows SmartScreen may warn because this beta is unsigned. Verify the checksum
before installation.

## Validation

- The user visually accepted compact layout, popup placement, finished-event
  styling, and neutral Telegram counter behavior in the development build.
- All seven frontend suites and the TypeScript/Vite production build passed.
- Rust formatting, 44 all-target tests, and strict all-target/all-feature Clippy
  passed.
- The optimized executable remained running during a bounded startup smoke
  test, and the NSIS bundle's size, checksum, embedded version, and unsigned
  status were verified locally.

## Known limits

This candidate has not been installed over the previous public beta, tagged,
or published. Attention Hub remains Windows-only and has no
installer-managed autostart, Hub tray process, updater, telemetry, cloud
synchronization, attachments, OCR, Microsoft Graph, generalized provider
framework, or reminders while the app is closed. Semantic app matching still
depends on English accessibility labels.
