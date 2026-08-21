# Attention Hub 0.6.0-beta.3

- Released: 2026-08-21
- Status: public beta
- Platform: Windows x64
- Format: unsigned NSIS setup executable
- Tag: `v0.6.0-beta.3`

## Fixes

- Kept the inline timezone converter within the same two-column visual system
  as the live clocks: equal centered columns, matching labels and numerals, and
  a persistent midpoint separator.
- Shortened visible converter timezone labels without changing their full
  accessible names or stored IANA identifiers.
- Moved `today`, `tomorrow`, and other target-day context to a separate line so
  the converted time remains readable in Recommended mode.
- Retained a compact native time-picker control and made **Escape** return to
  live clocks, including while the time input is focused.

These corrections are confined to the clock/converter presentation and
keyboard interaction. Provider semantics, calendar selection, reminders,
privacy boundaries, local storage, and installer lifecycle behavior are
unchanged from `0.6.0-beta.2`.

## Download verification

- File: `Attention-Hub_0.6.0-beta.3_x64-setup.exe`
- Size: 3,128,715 bytes
- SHA-256: `4F971CE0F3E4D8492EF2407DC98C5ED743AB18818AA40C28EA740D0AB6CF1449`
- Embedded product/file version: `0.6.0-beta.3`
- Authenticode: not signed

Windows SmartScreen may warn because this beta is unsigned. Verify the checksum
before installation.

## Validation

- The user visually accepted the final converter layout, day-line spacing,
  native picker size, and live-clock parity in the refreshed development build.
- Timezone conversion and responsive widget-layout suites passed.
- TypeScript and Vite production build passed.
- All 48 Rust tests, strict Clippy, Rust formatting, optimized executable smoke
  testing, repository privacy scan, and NSIS bundle verification passed.

## Known limits

This release remains unsigned and has no installer-managed autostart, Hub tray
process, updater, telemetry, cloud synchronization, attachments, OCR, Microsoft
Graph, generalized provider framework, or reminders while the app is closed.
