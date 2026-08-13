# Attention Hub 0.3.0-beta.1 production-ready beta

- Date: 2026-08-13 Europe/Kyiv
- Status: built, validated, and accepted for daily beta use
- Canonical format: NSIS setup executable
- Source branch: `codex/m5b-compact-widget-option-a`

## Product boundary

This beta includes the aligned 960 by 80 Option A widget, Teams and Telegram
multi-monitor taskbar visual mirrors, source activation, Outlook aggregate unread
with its explicitly last-observed fallback, local and configurable secondary
clocks, one saved Published ICS work calendar, active-event acknowledgement,
panel color/opacity preferences, and fixed-source app ordering.

Advanced retains the bounded widget preferences, secure work-calendar setup,
structured attention state, and technical notification diagnostics. Retired
AppointmentStore, Graph-helper, and Outlook My Day spike implementations are
removed from the production source tree; their historical evidence remains.

## Artifact

- Canonical file: `D:\Work\PetProjects\attention-hub\Attention Hub_0.3.0-beta.1_x64-setup.exe`
- Build-tree file: `src-tauri/target/release/bundle/nsis/Attention Hub_0.3.0-beta.1_x64-setup.exe`
- Size: 2,985,139 bytes
- SHA-256: `7396FE53AD6D3F58E03FD8155BDB233D648478E583388583E87D5C7695C2483A`
- Authenticode: unsigned beta release
- Embedded application version: `0.3.0-beta.1`

The copied canonical installer hash matched the build-tree installer before the
rebuildable target directory was removed.

## Validation

- TypeScript and Vite production build passed with 42 transformed modules.
- `cargo test --all-targets` passed 30 library tests and the native example
  target with no failures.
- `cargo clippy --all-targets --all-features -- -D warnings` passed.
- `cargo fmt --all -- --check` and `git diff --check` passed.
- Secret-pattern review found only documented placeholders and explicit parser
  test fixtures; no saved calendar URL is present in source or artifact records.
- Tauri completed one x64 NSIS bundle.
- The optimized release executable started without a development server. Win32
  reported the main window as exactly 960 by 80 and the active native mirror as
  exactly 40 by 40. The bounded validation process was then stopped.

## Distribution note

The installer is not code-signed and can trigger Windows SmartScreen. This beta
does not claim installer execution on a clean machine, autostart, tray support,
telemetry, OCR, Graph access, or a generalized provider system.

No calendar URL, event value, account identifier, or source pixel is recorded
in this release evidence.
