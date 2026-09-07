# Attention Hub 0.6.0-beta.11 — M19 release candidate

Status: local release candidate, not published. Version 0.6.0-beta.11 was
approved for installer verification. This is not an installed-test record.

- Adds a local Medicine tracker for finite treatments, medicine schedules and
  dose records, with Take, Skip and Undo in Today, a dedicated popup and manager.
- Adds an optional Meds widget segment, course progress and explicit
  upcoming/due/missed/recorded states. Unresolved doses receive row priority.
- Adds opt-in generic Windows reminders while the app runs, with a shared
  15–240 minute grace setting. Notifications never name a medicine.
- Adds medicine storage counts, plaintext disclosure and guarded deletion.
  Medicine data stays outside workspace exports; no medicine import/export,
  cloud synchronization or medical guidance is provided.
- Aligns Medicine and Project Hub controls through the shared manager kit.
- Hardens popup bounds, Escape handling, restored window positions, overlapping
  calendar Join tokens and PR/release validation gates.
- Protects notes on native, in-app and whole-Hub close. Partial backup-cleanup
  failure is persistent and has a dedicated retry that preserves active data.
- Selects and records due-dose reminders from one timestamp-consistent store
  view, and identifies recovered backup data on every dose-recording surface.

## Compatibility and verification

Installed builds retain the existing profile and calendar credential target.
Development builds use a separate `dev` data profile and credential. Existing
development data is not automatically migrated. Release builds allow one
instance; simultaneous development instances remain unsupported.

Before publication, complete M19 plan §14 and installer checks U1–U10. Verify
upgrade preserves projects, to-dos, calendar configuration and preferences;
verify rollback and repeated installed launch. Do not use development testing
as evidence of installed upgrade behavior.


Local validation: 14 frontend scripts, TypeScript, production frontend build,
96 Rust tests (one reporting helper ignored), strict Clippy and formatting passed.
The local NSIS review build omits updater signatures; signed updater publication
and installed acceptance are separate outstanding gates.

A backup-cleanup warning survives restart through a content-free status marker.
Advanced can remove only the retained backup after checking the active store;
the retry never repeats the original deletion.

## Corrected local candidate

Feedback from the first local install found that Meds remained hidden for an
upgraded preference record and that Today opened to-do details without its
themed card background. The corrected candidate enables Meds once for an
existing pre-M19 profile while preserving later explicit visibility choices,
and supplies the shared manager color tokens to every project quick view. The
artifact checksum below identifies this corrected candidate and supersedes the
first local beta.11 build.


## Local review artifact — 2026-09-06

- Installer: `Attention.Hub_0.6.0-beta.11_x64-setup.exe` in the repository root.
- Size: 4,311,915 bytes.
- SHA-256: `2251C7D02F652D61D3283BB672F75C65D555D59AB2D5404B24585E92884EBBBD`.
- Release executable ProductVersion and FileVersion: `0.6.0-beta.11`.
- Native optimized release build and NSIS packaging passed. The root copy's
  checksum matches the bundled output. This artifact includes the final
  whole-Hub note protection, guarded backup cleanup, timestamp-consistent
  reminders, recovery notices, Meds migration and popup/hover repairs.
- Authenticode status: NotSigned. No updater signature was generated for this
  local review build; do not substitute it for the signed publication workflow.
- Source: `c8bc7b7` plus the uncommitted M19 closeout changes in this checkout.
- Not performed: installation, upgrade/rollback, live native window acceptance,
  signed updater verification, commit, push, tag or publication.
