# Teams taskbar DWM static-crop Phase 1 evidence

- Date: 2026-08-10 Europe/Kyiv
- Result: discovery and crop passed at rest; static lifecycle failed on reflow
- Scope: primary-taskbar manual diagnostic only

## Boundary

The Phase 1 mode is invoked explicitly with:

```text
cargo run --example taskbar_dwm_probe -- --teams-crop
```

It makes the probe Per-Monitor-V2 DPI aware, traverses the primary taskbar's UI
Automation descendants once, excludes the separate `NotifyItemIcon`, and
selects only one unambiguous visible Teams candidate. It subtracts the DWM
extended-frame origin from the physical UI Automation bounds and supplies that
rectangle directly as `DWM_THUMBNAIL_PROPERTIES.rcSource`.

There are no crop offsets, padding constants, frame polling, UI Automation
events, source control, pixel readback, OCR, capture APIs, Tauri IPC, or React
integration.

## Sanitized discovery result

- Taskbar class: `Shell_TrayWnd`
- Taskbar HWND: `0x10184` (ephemeral run evidence only)
- DWM source size: `48 by 1440`
- DWM extended-frame bounds: `0,0,48,1440`
- Teams taskbar candidates after rectangle deduplication: 1
- Teams notification-area matches excluded: 1
- Selected candidate: Teams name match, Teams identity match, UIA button role
- Selected name length: 48; raw value not logged
- Selected Automation ID length: 41; raw value not logged
- Physical UI Automation bounds: `0,847,48,891`
- DWM source crop: `0,847,48,891`
- Rendered crop size: `48 by 44`

## At-rest observation

The user confirmed that the native destination:

- showed the complete Teams icon and real badge;
- showed no pixels from neighboring taskbar buttons;
- could be moved after the wider-caption adjustment.

A user-supplied screenshot corroborated the isolated Teams crop. It remains
conversation evidence and is not stored in the repository.

## Reflow observation

When a new taskbar icon appeared above Teams, the Teams button moved. The static
`rcSource` remained at the old coordinates and the destination displayed the
different icon that moved into that rectangle.

This confirms the architectural limitation: DWM binds the thumbnail to a source
rectangle, not to a UI Automation element. The at-rest crop is correct, but a
static crop is not safe as a persistent Attention Hub surface.

## Decision

Phase 1 passes the bounded discovery and coordinate-conversion question and
stops before lifecycle work. Reflow invalidation cannot be claimed safe until a
separately approved experiment measures event timing and hide-before-recrop
behavior. Even an event-driven design cannot assume the event arrives before
the first reordered frame; that residual exposure must be measured and judged,
not documented away.
