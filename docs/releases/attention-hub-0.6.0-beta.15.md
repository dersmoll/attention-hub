# Attention Hub 0.6.0-beta.15

- Prepared: 2026-09-16
- Released: 2026-09-17
- Status: public beta
- Platform: Windows x64
- Format: NSIS setup executable
- Tag: `v0.6.0-beta.15`

## Milestone 23 — planning, focus, startup, and quick notes

- The detached Today popup can browse yesterday, today, and tomorrow without
  changing the live widget calendar. Tomorrow separates scheduled work from
  still-open items; yesterday is described from retained records rather than
  presented as an exact historical snapshot.
- Date changes use a short reduced-motion-safe transition, with a compact
  centered date row and fixed navigation controls.
- Installed builds can optionally start Attention Hub when the user signs in to
  Windows. Development builds disclose that the setting is unavailable rather
  than registering a development executable.
- Time Focus uses a substantially larger wall clock and offers an optional
  persistent stopwatch with start, pause/resume, and reset controls.
- A new always-available Sticky Note opens one resizable, always-on-top local
  scratchpad. Its text autosaves to a dedicated bounded JSON store, its reachable
  size and position are restored, and saved HTTP(S) links open only after native
  revalidation.
- Compact and Recommended widget geometry account for the new destination icon,
  including the single-line Time Focus layout.

## Privacy and storage

- Adjacent-day calendar requests retain the existing Published ICS privacy
  boundary: publication URLs and raw meeting URLs do not enter the WebView.
- The stopwatch contains elapsed-time state only and creates no background
  service.
- Sticky-note content remains in local plaintext `sticky-note.json`, separately
  from Project Hub export. It is not synchronized and link metadata is not
  fetched.
- Windows startup uses the installed application registration only and adds no
  tray process or closed-app reminder service.

## Candidate validation

- The M23 interfaces were accepted after hands-on use, including the adjacent-day
  popup, Windows-startup setting layout, Time Focus overlap correction, and final
  compact Sticky Note spacing.
- The complete frontend suite passed, including calendar, day-plan, startup,
  stopwatch, sticky-note, widget-layout, workspace, medicine, and School Mode
  coverage.
- The production TypeScript/Vite build passed.
- Rust formatting passed.
- Rust tests passed: 130 passed, 1 ignored reporting helper.
- Strict all-target/all-feature Clippy passed with warnings denied.
- Package, Cargo, lockfile, and Tauri versions match `v0.6.0-beta.15`.
- A targeted privacy scan found no private Windows profile path, real mailbox
  address, or credential-shaped token. Its only broad-pattern match was the
  existing synthetic credentialed-URL rejection fixture.
- The optimized executable and fresh local NSIS installer were produced from
  the versioned source tree.

## Local NSIS candidate

- File: `Attention Hub_0.6.0-beta.15_x64-setup.exe`
- Path: `src-tauri/target/release/bundle/nsis/Attention Hub_0.6.0-beta.15_x64-setup.exe`
- Size: 5,534,549 bytes
- SHA-256: `BC4DFFDC1549FB8D958C5A127A9500A3B6B7032F5E8D5524DE3CB6AFC8D9EF79`
- Embedded ProductVersion and FileVersion: `0.6.0-beta.15`
- Authenticode: `NotSigned`

The local packaging run emitted the manual installer successfully and then
stopped at the expected updater-signing step because the protected private key
is available only to the release environment.

The installed beta.15 candidate, including Windows-startup registration,
launch, and removal, was accepted on 2026-09-17. Publication was approved after
that installed-build check.
