# Attention Hub 0.4.0-beta.1 fixed-source controls beta

- Date: 2026-08-13 Europe/Kyiv
- Status: built, validated, and accepted for daily beta use
- Canonical format: NSIS setup executable
- Source branch: `codex/m6-beta-hardening`
- Release tag: `v0.4.0-beta.1`

## Product boundary

This beta retains the complete `0.3.0-beta.1` product slice and adds bounded
controls for monitoring any subset of Teams, Telegram, and Outlook. Coverage is
computed only from selected sources; selecting none reports **Monitoring
paused**, never **All clear**. Teams and Telegram live taskbar visuals have
separate persistent preferences and remain visual-only.

The widget compresses and centers selected sources plus Advanced while native
visual surfaces follow the same ordered slots. Existing preference records
migrate to all three sources and both visuals enabled. A malformed preference
record now falls back safely for pin, timezone, and position values.

No source meaning changed: Teams remains qualitative, Telegram retains separate
numeric signals, and Outlook remains aggregate Inbox unread with its explicit
in-process last-observed fallback.

## Artifact

- Canonical file: `D:\Work\PetProjects\attention-hub\Attention Hub_0.4.0-beta.1_x64-setup.exe`
- Build-tree file: `src-tauri/target/release/bundle/nsis/Attention Hub_0.4.0-beta.1_x64-setup.exe`
- Size: 2,988,932 bytes
- SHA-256: `E6AAA2E69DB19A37309C07718A736528A2E010402B2BC271A3C4EEFD1E5AE444`
- Authenticode: unsigned beta release
- Embedded application version: `0.4.0-beta.1`

The copied canonical installer hash matched the build-tree installer. No
existing canonical file was overwritten.

## Validation

- Preference migration and attention-coverage tests passed.
- TypeScript and Vite production build passed with 42 transformed modules.
- `cargo test --all-targets` passed 32 library tests and the native example
  target with no failures.
- `cargo clippy --all-targets --all-features -- -D warnings` passed.
- `cargo fmt --all -- --check` and `git diff --check` passed.
- The release build produced exactly one x64 NSIS bundle.
- The optimized executable started without a development server. Win32 reported
  the main window as 960 by 80 and both active native visual surfaces as 40 by
  40; the exact release process then closed normally.
- Live M7 validation covered three, two, one, and zero monitored sources,
  monitoring-paused semantics, native layout compression, source/visual
  independence, restart persistence, reset, and multi-monitor taskbar selection.
- The secret-pattern review found only the masked UI placeholder, documented
  protocol text, and explicit Published ICS parser fixtures; no saved calendar
  URL or credential is present in source or artifact records.

## Distribution note

The installer is not code-signed and can trigger Windows SmartScreen. It has not
been installed during this release pass, so installer execution, in-place
upgrade, uninstall retention, and clean-machine behavior remain unclaimed.

This beta does not add autostart, tray support, an updater, telemetry, OCR,
Graph access, a generalized provider system, or new calendar/provider work.
No calendar value, account identifier, private source label, or DWM pixel is
recorded in this release evidence.
