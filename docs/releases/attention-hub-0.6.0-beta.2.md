# Attention Hub 0.6.0-beta.2

- Released: 2026-08-21
- Status: public beta
- Platform: Windows x64
- Format: unsigned NSIS setup executable
- Tag: `v0.6.0-beta.2`

## Fix

- Corrected the widget-size migration retained across upgrade or reinstall.
  The former default `auto` preference now opens as **Recommended**, matching a
  fresh installation. Legacy Compact also maps to Recommended; only an
  explicitly selected legacy Wide preference maps to Larger. Current
  Recommended and Larger selections remain stable.

This correction does not clear application data, reset unrelated preferences,
or change installer lifecycle behavior. All Milestone 10 features and trust
boundaries from `0.6.0-beta.1` remain unchanged.

## Download verification

- File: `Attention-Hub_0.6.0-beta.2_x64-setup.exe`
- Size: 3,125,598 bytes
- SHA-256: `1BD4DF4EC7F4EB42EEF28186B2BA59A2265C2467D61B1BEF649595327E8DB098`
- Embedded product/file version: `0.6.0-beta.2`
- Authenticode: not signed

Windows SmartScreen may warn because this beta is unsigned. Verify the checksum
before installation.

## Validation

- The user reproduced the beta.1 reinstall behavior and accepted the corrected
  Recommended-mode result in the refreshed development build.
- Widget preference migration and exact responsive-layout suites passed.
- TypeScript and Vite production build passed.
- Rust unit tests, strict Clippy, Rust formatting, source-diff hygiene, optimized
  executable smoke testing, and the final repository privacy scan passed.

## Known limits

This release remains unsigned and has no installer-managed autostart, Hub tray
process, updater, telemetry, cloud synchronization, attachments, OCR, Microsoft
Graph, generalized provider framework, or reminders while the app is closed.
