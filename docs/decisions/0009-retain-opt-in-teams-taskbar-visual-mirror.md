# ADR 0009: Retain an opt-in Teams taskbar visual mirror

- Status: Accepted for bounded product integration
- Date: 2026-08-11

## Context

ADR 0008 proved that DWM can render the live primary-taskbar Teams icon and
badge into an Attention Hub-owned native window. The cached UI Automation
tracker followed taskbar reordering with a brief user-accepted stale-icon flash,
recovered after two Explorer taskbar-owner restarts, and stayed within the
approved readiness budget during a 612-second debug run.

The mirror still has different semantics from an attention signal. DWM renders
source pixels directly into the destination; Attention Hub does not receive a
bitmap and cannot assert what badge number is visible. Teams' proven
`activityStatus` boolean remains the only normalized semantic Teams value.

The Tauri panel is a webview child window. A DWM thumbnail registered against
the panel's outer native window would render behind that child rather than
inside the React layout. Product integration therefore needs a deliberately
separate native surface.

## Decision

Retain the tracker as an explicitly opt-in, Windows-only visual companion:

- the React panel exposes `Show Teams visual` and `Stop mirror` controls;
- Rust owns one native companion window and its dedicated UI Automation/DWM
  thread for the application lifetime;
- start returns immediately with a `starting` lifecycle; the normal status poll
  observes `running`, `hidden`, `error`, or `stopped` without imposing a fixed
  synchronous discovery timeout;
- the companion is owned by the main Attention Hub window, initially positioned
  beside it, and remains independently movable by its caption;
- closing either the companion or using `Stop mirror` ends the tracker and
  unregisters the DWM thumbnail;
- a missing or rebuilding taskbar/Teams element hides the thumbnail until the
  cached tracker can recover it;
- one process-wide UI Automation gate serializes the existing attention snapshot
  and mirror discovery. Initial mirror discovery has priority after current work
  finishes; cached 100 ms checks skip a turn while the gate is busy;
- IPC exposes lifecycle, visibility, the configured check interval, and stable
  diagnostics only.

This path does not add OCR, image recognition, pixel readback, screenshots,
input forwarding, Teams process inspection, a numeric count, or a new
`AttentionSignal`. Those techniques are not prohibited forever, but any future
pixel interpretation requires a separate privacy, reliability, performance,
and product-semantics decision.

The feature is session opt-in. It does not persist an enabled preference or
start automatically with Attention Hub.

## Consequences

- The user can keep the real Teams badge visible without reserving the full
  taskbar on the working display.
- The companion remains a visual aid, not queryable application state. Product
  copy and serialized fields say this explicitly.
- The accepted reflow caveat remains: another icon can appear very briefly
  during taskbar movement before the next 100 ms rectangle check.
- The current implementation targets the primary `Shell_TrayWnd`; secondary
  taskbars remain outside this decision.
- If Teams cannot be identified unambiguously, the feature reports unavailable
  rather than guessing a crop.
- Calendar-provider selection is unaffected and remains blocked separately.

Live integration evidence is recorded in
`docs/milestones/evidence/m0/2026-08-11-teams-taskbar-dwm-product-integration.md`.
