# Attention Hub 0.6.0-beta.14

- Released: 2026-09-11
- Status: public beta
- Platform: Windows x64
- Format: NSIS setup executable
- Tag: `v0.6.0-beta.14`

## Milestone 22 — daily workflow and interface polish

- Calendar events can be skipped and restored, with skipped occurrences kept
  distinct from their recurring series.
- Event settings can assign meetings to projects or personal lists inside
  custom categories and open the saved destination in Project Hub.
- Published ICS refresh and replacement handling is more resilient and keeps
  operational health messages separate from the real event state.
- Transient calendar refresh failures retry quietly while a usable event is
  retained; the delayed warning requires three failures and ten minutes since
  the last successful refresh.
- Slow Published ICS feeds now have a 30-second bounded download window inside
  a 35-second native deadline and 40-second Advanced-window deadline. Connection,
  response-size, parse-time, and privacy limits remain unchanged.
- A delayed refresh no longer places text over a cached event. The calendar
  segment uses a thin amber status rail and keeps detailed sanitized context in
  its tooltip; centered warning text is reserved for an empty calendar segment.
- A sanitized 24-hour display cache keeps the last event visible across restart
  and reinstall when the first live refresh fails. Publication URLs, join and
  event tokens, workspace data, links, and diagnostics are never cached.
- Meeting state crosses its scheduled start locally instead of waiting for the
  next feed refresh, and event icons use a dedicated right-side column.
- School mode enters an active lesson automatically while keeping Join as an
  explicit action.
- Medicine schedule times can be edited directly, and extending a completed
  course across today reopens its current schedule.
- Project Hub and the widget rail use a more compact, consistent layout across
  Recommended and Compact single-line modes.
- The secondary clock can be disabled without losing its saved timezone.
- The detached Today popup now has a 300px minimum native and content width.
- Meeting reminders now offer seven persistent sound choices. The frontend
  sends only a stable choice ID and Rust maps it to an allowlisted bundled WAV
  resource; arbitrary sound paths are not accepted.
- The compact work and school attention state now uses the shorter `Soon` pill.

## Candidate validation

- The complete frontend suite passed, including calendar, widget layout,
  preference migration, event workspace, medicine, and School Mode coverage.
- The production TypeScript/Vite build passed.
- Rust formatting passed.
- Rust tests passed: 124 passed, 1 ignored reporting helper.
- Strict all-target/all-feature Clippy passed with warnings denied.
- Package, Cargo, and Tauri versions match `v0.6.0-beta.14`.
- Every configured reminder resource exists and has a valid RIFF/WAVE header.
- The optimized executable and fresh local NSIS installer were produced from
  the final source tree.

Local NSIS candidate:

- File: `Attention.Hub_0.6.0-beta.14_x64-setup.exe`
- Size: 5,496,600 bytes
- SHA-256: `A053D747BEACC38E6A4CA39F2A9910E8074BCF6CFD9E41B69941937A91AD48C8`
- Embedded ProductVersion and FileVersion: `0.6.0-beta.14`
- Authenticode: `NotSigned`

The local packaging run emitted the manual installer successfully and then
stopped at the expected updater-signing step because the protected private key
is available only to the release environment. The tag-triggered release flow
will build and sign the updater artifact separately.

## Human acceptance

- The M22 interface and workflow changes were accepted after hands-on use on
  2026-09-11, including the final reminder-sound selector.
- Installed beta.13-to-beta.14 updater download, replacement, and restart remain
  post-publication acceptance checks and are not implied by source validation.

Publication was explicitly approved on 2026-09-11. Signed Tauri updater
metadata validates in-app beta updates separately from Windows Authenticode
signing, which remains unavailable for this installer.
