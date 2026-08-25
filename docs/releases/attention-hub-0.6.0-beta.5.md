# Attention Hub 0.6.0-beta.5

- Released: 2026-08-25
- Status: public beta
- Platform: Windows x64
- Format: unsigned NSIS setup executable
- Tag: `v0.6.0-beta.5`

## Reliability fixes

- Meeting-start audio is now scheduled once for one minute before the earliest
  upcoming timed meeting. Scheduling follows the meeting start time rather than
  depending on a later calendar refresh or on which event occupies the visible
  calendar slot.
- Failed source-app activation now appears as a short-lived tooltip on the
  affected source button. The tooltip suggests starting or restoring the app,
  then disappears without occupying the persistent widget error strip.

These repairs preserve the bundled local WAV playback, the user sound toggle,
single-calendar ICS boundary, local-first storage, meeting-link token boundary,
existing provider semantics, and Windows lifecycle behavior. No new account
integration or telemetry was added.

## Download verification

- File: `Attention-Hub_0.6.0-beta.5_x64-setup.exe`
- Size: 3,255,547 bytes
- SHA-256: `8DBF14F187B37E482515DB68D06AF42F4B0E34544CFED3012996188AA7837BEA`
- Embedded product/file version: `0.6.0-beta.5`
- Authenticode: not signed

Windows SmartScreen may warn because this beta is unsigned. Verify the checksum
before installation.

## Validation

- The user confirmed the repaired meeting-start sound and source-activation
  feedback in the development build.
- Frontend model, layout, preference, focus, timezone, and calendar suites,
  together with the TypeScript and Vite production build, passed.
- Rust formatting, all-target tests, strict all-feature Clippy, optimized
  executable smoke testing, staged privacy scanning, and NSIS bundle
  verification passed.

## Known limits

This release remains unsigned. Installer upgrade/uninstall lifecycle behavior
was not revalidated for this build. Attention Hub remains Windows-only and has
no installer-managed autostart, Hub tray process, updater, telemetry, cloud
synchronization, attachments, OCR, Microsoft Graph, generalized provider
framework, or reminders while the app is closed.
