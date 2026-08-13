# ADR 0021: Declare 0.3.0-beta.1 production-ready beta

- Status: accepted
- Date: 2026-08-13

## Context

Milestones 5B and 5C replaced the preserved work-in-progress widget geometry
with the approved compact Option A bar, aligned its clock labels, proved native
mirror slot synchronization, and added bounded appearance and app-order
preferences. The user accepted the resulting UI as substantially improved and
confirmed that remaining visual ideas are non-critical.

The source tree still retained three provider-spike implementations that were
already absent from `lib.rs` and the Tauri command surface: Windows
AppointmentStore, Microsoft Graph environment/helper, and Outlook My Day UI
Automation. Their outcomes are fully recorded in ADRs and milestone evidence.

## Decision

Release the current product slice as `0.3.0-beta.1`, a production-ready beta for
daily dogfooding. Its canonical artifact is one unsigned NSIS installer.

Remove the unreferenced provider-spike Rust modules, the .NET Graph helper, its
build script, and its now-unused .NET/NuGet repository configuration. Preserve
all historical ADR and milestone evidence. Calendar/provider behavior remains
frozen around the saved Published ICS source.

After the canonical installer is copied out of the build tree, remove only
ignored and rebuildable worktree caches. `RUN-ATTENTION-HUB.cmd` remains the
single development test entrypoint and can reinstall frontend dependencies on
demand.

## Beta boundary

The beta retains Teams and Telegram multi-monitor taskbar selection and
activation, Outlook aggregate unread with its explicitly last-observed fallback,
widget position and pinning, clocks, Advanced, saved ICS, acknowledgement,
panel appearance, app ordering, and source-owned attention semantics. DWM
pixels remain visual-only and never become semantic counts.

The beta does not claim code signing, broad-machine installer validation,
telemetry, generalized providers, OCR, Graph access, autostart, or tray support.

## Consequences

The production source tree now matches its runtime command surface, while
historical discovery remains reviewable in documentation and Git history. A
future provider experiment must begin with a new ADR and branch instead of
reactivating dead beta code. The unsigned installer can still trigger
SmartScreen.
