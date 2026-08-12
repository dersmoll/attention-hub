# Attention Hub 0.2.0 canonical Windows build

- Date: 2026-08-12 Europe/Kyiv
- Status: built and statically verified
- Canonical format: NSIS setup executable
- Source branch: `codex/m4d-widget-calendar`

## Product boundary

This release includes the persistent widget, Teams and Telegram taskbar visual
mirrors, local and secondary clocks, source-owned attention signals, and the
single saved Published ICS work calendar. It includes 24-hour event ranges,
five-minute warning, started-event alert, **I'm in** acknowledgement, and one
bounded upcoming companion.

Advanced retains secure work-calendar configuration plus attention and
Notification Center diagnostics. Retired calendar provider spikes are not
exposed as controls or IPC commands.

## Artifact

- File: `src-tauri/target/release/bundle/nsis/Attention Hub_0.2.0_x64-setup.exe`
- Size: 2,961,676 bytes
- SHA-256: `15649A2B0576EADF87F76E41118419D07EA2E17E5D6CAB2B8949F13B7A910C99`
- Authenticode: unsigned development release
- Embedded application version: `0.2.0`

Tauri verified the NSIS package during bundling. The optimized executable and
installer were hashed locally. The approval environment did not allow replacing
the already running development process, so this closeout does not claim a
post-build runtime launch of the installer artifact. The same calendar/widget
source passed the live event-boundary acceptance before bundling.

No calendar URL or event value is recorded here.
