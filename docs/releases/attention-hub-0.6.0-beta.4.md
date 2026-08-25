# Attention Hub 0.6.0-beta.4

- Released: 2026-08-25
- Status: public beta
- Platform: Windows x64
- Format: unsigned NSIS setup executable
- Tag: `v0.6.0-beta.4`

## Community-feedback improvements

- Expanded the clock from two to as many as five configured timezones and
  added horizontal and compact vertical layouts with aligned labels and times.
- Added a grouped **Belgrade, Sarajevo, Skopje** clock option while retaining
  IANA timezone identifiers and automatic daylight-saving-time transitions.
- Added a compact same-day meeting summary that opens from the calendar
  surface, stays anchored without moving the widget, and chooses above or below
  placement according to the available screen space.
- Added reduced-motion-safe attention states before and at a meeting start,
  plus a bundled local start sound that is enabled by default and can be
  disabled in Advanced Calendar settings.
- Improved Join/Rejoin and **I'm in** behavior and contrast across light and
  dark widget appearances.
- Kept the live Teams mirror aligned with its source placeholder while calendar
  overlays are open.

These changes preserve the single user-selected Published ICS calendar,
local-first storage, meeting-link token boundary, provider semantics, and
existing Windows lifecycle behavior. No new account integration or telemetry
was added.

## Download verification

- File: `Attention-Hub_0.6.0-beta.4_x64-setup.exe`
- Size: 3,253,930 bytes
- SHA-256: `506366091C365649434927ADFC97218F0CFC306E4134801816067E0998BB2EF4`
- Embedded product/file version: `0.6.0-beta.4`
- Authenticode: not signed

Windows SmartScreen may warn because this beta is unsigned. Verify the checksum
before installation.

## Validation

- The user visually accepted the final clock, calendar-summary, overlay
  positioning, live-mirror alignment, meeting sound, and dark-theme meeting
  action behavior in the refreshed development build.
- All frontend model, layout, preference, focus, timezone, and calendar suites
  passed, together with the TypeScript and Vite production build.
- Rust formatting, all-target tests, strict all-feature Clippy, optimized
  executable smoke testing, staged privacy scanning, and NSIS bundle
  verification passed.

## Known limits

This release remains unsigned. Installer upgrade/uninstall lifecycle behavior
was not revalidated for this build. Attention Hub remains Windows-only and has
no installer-managed autostart, Hub tray process, updater, telemetry, cloud
synchronization, attachments, OCR, Microsoft Graph, generalized provider
framework, or reminders while the app is closed.
