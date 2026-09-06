# Attention Hub 0.6.0-beta.12

- Released: 2026-09-06
- Status: public beta
- Platform: Windows x64
- Format: NSIS setup executable plus signed Tauri updater artifacts
- Tag: `v0.6.0-beta.12`

## Milestone 19 — Medicine tracker

- Adds a separate local Medicine tracker for finite treatments, medicine
  schedules, and dose records, with Take, Skip, and Undo actions in Today, a
  compact popup, and a dedicated manager.
- Adds the optional Meds widget destination, course progress, and explicit
  upcoming, due, missed, taken, and skipped states. Unresolved doses receive
  display priority when a surface reaches its row limit.
- Adds opt-in generic Windows dose reminders while Attention Hub is running.
  The notification never names a treatment or medicine, and the shared grace
  window can be set from 15 to 240 minutes.
- Creates treatments by name only. Their visible course range derives from the
  earliest start and latest end among their medicines.
- Adds a separate portable Medicine JSON export/import flow with a plaintext
  health-data disclosure, count preview, explicit replace confirmation,
  revision and digest checks, and bounded local backup protection.
- Keeps Medicine data outside workspace exports and cloud services. Treatment
  names, medicine details, schedules, notes, and dose history are stored as
  unencrypted local data in the Windows user profile.

## Reliability and interface fixes

- Protects treatment notes when closing Medicine through its title bar,
  Alt+F4, in-app Close, or the whole Hub.
- Makes destructive backup cleanup retryable without repeating the original
  deletion, and identifies recovered backup data on dose-recording surfaces.
- Selects, reports, and marks due-dose notifications from one consistent store
  snapshot and timestamp.
- Enables Meds once for an existing pre-M19 widget profile while preserving
  every later explicit visibility choice.
- Restores the themed background for Today to-do details and improves compact
  popup alignment, hover contrast, recovered-data notices, and manager styling.
- Waits until the Medicine manager is visible and focused before closing its
  popup, removing the alternate-click opening race.
- Retains hardened popup bounds, Escape handling, restored window positions,
  overlapping calendar Join tokens, and strict release workflow gates.

## Compatibility and validation

Installed builds retain the existing Attention Hub profile and Published ICS
credential target. Development builds continue to use their separate `dev`
profile. Release builds permit one running installed instance.

The release gate runs all frontend suites, the production frontend build, Rust
formatting, all-target tests, strict all-target/all-feature Clippy, synchronized
version checks, and signed updater packaging.

Local NSIS candidate:

- File: `Attention.Hub_0.6.0-beta.12_x64-setup.exe`
- Size: 4,316,161 bytes
- SHA-256: `28E77C14C574950EFB234ADF81ADE8B7AD8FCB775E173847B69CB60B6F4F7A28`
- Embedded ProductVersion and FileVersion: `0.6.0-beta.12`
- Authenticode: `NotSigned`

The GitHub workflow builds the signed updater archive from the tagged source;
its remotely published installer checksum is verified separately.

## Known limits

- The Windows installer remains Authenticode-unsigned. Signed Tauri updater
  metadata validates in-app beta updates separately from Windows code signing.
- Notifications run only while Attention Hub is open; there is no tray or
  background service.
- Medicine transfer is manual and replace-only. There is no merge, cloud sync,
  medical guidance, or encryption added by Attention Hub.
- Installed upgrade, rollback, monitor/DPI, and single-instance behavior depend
  on the release environment and remain separate from automated source checks.
