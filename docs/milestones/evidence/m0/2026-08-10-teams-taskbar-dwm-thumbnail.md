# Teams taskbar DWM thumbnail Phase 0 evidence

- Date: 2026-08-10 Europe/Kyiv
- Result: whole-taskbar surface and live Teams badge passed
- Scope: native DWM surface gate only

## Environment

- Windows edition reported by the registry: Windows 10 Pro
- Windows display version: 25H2
- Windows build: `26220.9022`
- Teams process observed: `ms-teams`
- Teams version: unavailable from the read-only process/package metadata used
  during this run
- Taskbar class: `Shell_TrayWnd`
- Observed taskbar HWND: `0x10184` (ephemeral run evidence only)
- DWM thumbnail source size: `48 by 1440`
- Taskbar layout: vertical primary taskbar

## Probe boundary

The manual Cargo example at
`src-tauri/examples/taskbar_dwm_probe.rs` creates one plain native top-level
destination window and registers the complete primary taskbar through
`DwmRegisterThumbnail`. It calls `DwmQueryThumbnailSourceSize` and
`DwmUpdateThumbnailProperties` with no `rcSource` crop.

The default Phase 0 mode contains no UI Automation or source crop. The example
now also contains a separately invoked Phase 1 static-crop mode, documented in
`2026-08-10-teams-taskbar-dwm-static-crop.md`. Neither mode contains a Tauri
command, IPC DTO, React surface, timer, frame loop, OCR, image recognition,
bitmap, device context, capture API, Teams process access, or input forwarding.
DWM retains ownership of live pixel composition.

## Build validation

- `cargo fmt --all -- --check`: passed
- `cargo check --example taskbar_dwm_probe`: passed
- `cargo clippy --example taskbar_dwm_probe -- -D warnings`: passed
- `git diff --check`: passed before the live run

Rust emitted a nonfatal warning that it could not canonicalize
`C:\Users\dersm`; it did not affect formatting, compilation, or execution.
The wider-caption usability adjustment made after the live observation passed
formatting, compilation, Clippy, and the full Rust test suite but was not
visually rerun.

## Live observation

The probe reported successful DWM registration and a `48 by 1440` source. The
user visually confirmed all of the following while the native window remained
open:

- the complete vertical taskbar was mirrored;
- the real Teams numeric badge was present in the mirrored surface;
- Teams badge changes were reflected live;
- the destination could be resized;
- the initial narrow destination left insufficient caption area for convenient
  dragging.

A user-supplied screenshot corroborated the complete mirrored taskbar and the
Teams badge. It is conversation evidence only and is intentionally not stored
in the repository.

## Finding and stop decision

The Windows 11 taskbar is a content-bearing DWM thumbnail source on the tested
machine, and the real Teams badge is part of that live composited surface. This
passes the approved Phase 0 gate.

Phase 0 alone does not prove stable UI Automation button identity,
crop-coordinate correctness, neighbor isolation, taskbar-reflow safety,
multi-monitor behavior, or product value. The subsequently approved Phase 1 is
recorded separately; Phase 0 did not authorize product integration.
