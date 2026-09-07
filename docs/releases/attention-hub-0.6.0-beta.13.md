# Attention Hub 0.6.0-beta.13

- Released: 2026-09-07
- Status: public beta
- Platform: Windows x64
- Format: NSIS setup executable
- Tag: `v0.6.0-beta.13`

## Milestone 21 — School calendar source

- Adds an optional School mode that describes the current school day from the
  same user-provided Published ICS calendar used by the work-calendar surface.
- Accepts published Outlook and Google Calendar ICS links while keeping the
  one-source, local-first boundary.
- Keeps calendar source changes explicit. Existing event-to-project
  associations are carried only when the replacement feed contains the same
  opaque series identities, with a visible count or sanitized failure result.
- Treats an empty or finished calendar day as a successfully read day instead
  of a verification failure.
- Keeps the Rust-produced viewer day and the sanitized day-event snapshot in
  one contract consumed by both the widget and Today.

## Reliability and interface fixes

- Applies source-change association remapping while the calendar request gate
  is held, so a later save cannot overtake ownership of an earlier remap.
- Distinguishes credential-read, credential-write, and carry-over failures
  without exposing the publication URL or raw calendar details.
- Uses provider-neutral publication consent and placeholder text for Outlook
  and Google Calendar sources, while retaining provider-specific setup help.
- Limits every compact single-line timezone label to three visible characters.
- Removes the development-only Project Hub preview action from Advanced.

## Compatibility and validation

Installed builds retain the existing Attention Hub profile and Published ICS
credential target. Development builds continue to use their separate `dev`
profile. Release builds permit one running installed instance.

The release candidate is checked with all frontend suites, the production
frontend build, Rust formatting, all-target tests, strict all-target/all-feature
Clippy, synchronized version checks, and local NSIS packaging.

Local NSIS candidate:

- File: `Attention.Hub_0.6.0-beta.13_x64-setup.exe`
- Size: 4,342,926 bytes
- SHA-256: `87991196EAB8F59427662C39DAEF8AD18BFE3D719D6D2649ED2BE4FE6F319156`
- Embedded ProductVersion and FileVersion: `0.6.0-beta.13`
- Authenticode: `NotSigned`

The local beta.12 installation upgraded in place to beta.13. The installed
executable launched successfully as one release process, and the existing
Published ICS credential target and local profile directories remained present.

## Known limits

- The Windows installer remains Authenticode-unsigned. Signed Tauri updater
  metadata validates in-app beta updates separately from Windows code signing.
- The supported source remains one user-provided Published ICS feed. There is
  no Graph, OCR, cloud synchronization, or multi-calendar aggregation.
- Source scope is session-local, carry-over is limited to series present in the
  replacement feed, and `RANGE=THISANDFUTURE` is not supported.
- Installed visual acceptance of the three polish fixes remains a human check.
