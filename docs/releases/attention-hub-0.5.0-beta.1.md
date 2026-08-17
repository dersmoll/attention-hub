# Attention Hub 0.5.0-beta.1 Later Inbox beta

- Date: 2026-08-17 Europe/Kyiv
- Status: built, validated, installed on the current machine, and accepted
- Canonical format: NSIS setup executable
- Source branch: `codex/m9-later-inbox`
- Release tag: `v0.5.0-beta.1`

## Product boundary

This beta retains the complete `0.4.0-beta.1` product slice and adds the fixed
messenger/time refinements from Milestone 8 plus the local-first Later Inbox
from Milestone 9. Later Inbox supports bounded link-aware notes, Work/Private
organization, collapsed review context, optional follow-up times, and opt-in
native notifications while Attention Hub is running.

Minimized Outlook no longer shows a stale or placeholder badge. The saved work
calendar can open allowlisted Teams, Zoom, Google Meet, and Webex meeting links
through ephemeral Rust-owned tokens; raw meeting URLs do not cross serialized
IPC. Earlier disposable Later Inbox test schemas start clean without migration.

No source meaning changed: DWM surfaces remain visual-only, Slack, Viber, and
WhatsApp remain presence/activation surfaces, and only existing fixed semantic
sources contribute to attention coverage.

## Artifact

- Canonical file: `D:\Work\PetProjects\attention-hub\Attention Hub_0.5.0-beta.1_x64-setup.exe`
- Build-tree file: `src-tauri/target/release/bundle/nsis/Attention Hub_0.5.0-beta.1_x64-setup.exe`
- Size: 3,122,393 bytes
- SHA-256: `EAAE9F4099D8CB8673C68423C46865C1DE0EB20504289B69822304F47B3ECFC4`
- Authenticode: unsigned beta release
- Embedded application version: `0.5.0-beta.1`

The canonical destination did not exist before the copy. Its hash matched the
build-tree installer, and the NSIS directory contained exactly one bundle.

## Validation

- TypeScript and Vite production build passed with 50 transformed modules.
- Attention model, Later Inbox, widget preferences, time-zone, and responsive
  widget-layout regression suites passed.
- `cargo test --all-targets` passed 45 library tests and all zero-test native
  targets with no failures.
- `cargo clippy --all-targets --all-features -- -D warnings` passed.
- `cargo fmt --all -- --check` and `git diff --check` passed.
- The source/fixture scan found no private-key marker, `webcal` value,
  credentialed HTTPS URL, or saved Outlook calendar publication URL.
- The release build produced exactly one x64 NSIS installer with the expected
  embedded file and product version.
- The environment's pnpm shim could not execute the configured pre-build hook.
  The already-passed frontend build was therefore retained, and Tauri bundling
  used a temporary override that disabled only the duplicate hook. The override
  was removed after bundling; dependencies and application source were not
  changed by this workaround.
- The user reported full-workday testing of the completed source build with no
  critical or release-blocking issue and approved release.
- On 2026-08-18, the user ran the exact canonical installer and reported that
  installation/update, launch, retained calendar/preferences, the bounded M9.3
  smoke checks, and close/reopen all passed.

## Distribution note

The installer is not code-signed and can trigger Windows SmartScreen. The exact
canonical installer passed the user-run current-machine checklist, including
installation/update and reopen. Independent clean-machine and uninstall
behavior remain unclaimed.

This beta does not add autostart, tray support, an updater, telemetry, OCR,
Graph access, cloud sync, a generalized provider system, attachments, or
scheduled closed-app reminders. No calendar value, account identifier, Later
Inbox content, private notification body, or DWM pixel is recorded in this
release evidence.
