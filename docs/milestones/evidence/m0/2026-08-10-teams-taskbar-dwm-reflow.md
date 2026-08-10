# Teams taskbar DWM reflow Phase 2 evidence

- Date: 2026-08-10 through 2026-08-11 Europe/Kyiv
- Result: qualified pass; recropping follows reflow with a brief stale-icon flash
- Scope: primary-taskbar native diagnostic only

## Boundary

The Phase 2 mode is invoked explicitly with:

```text
cargo run --example taskbar_dwm_probe -- --track-reflow
```

It starts with the Phase 1 semantic UI Automation discovery and DWM crop. The
retained diagnostic revalidates the Teams UI Automation rectangle every 100 ms.
When a different unambiguous rectangle is observed, it hides the thumbnail,
updates `rcSource`, and shows it again. If Teams becomes absent or ambiguous,
it hides the thumbnail instead of continuing to display the old coordinates.

The mode does not read or classify pixels, use OCR or image recognition, inspect
Teams processes, forward input from the destination, integrate with Tauri IPC,
or alter the normalized attention-signal model.

## Rejected event triggers

An Explorer-process `SetWinEventHook` experiment listened for reorder and
location-change events. It received unrelated startup activity, but opening and
closing a controlled blank Paint window produced no event for the Windows 11
taskbar button path. This trigger did not meet the lifecycle requirement.

A UI Automation bounding-rectangle property-change subscription on taskbar
descendants did fire. After one unchanged refresh, however, Windows terminated
the process with `0xc0000374` (`STATUS_HEAP_CORRUPTION`). The dependency graph
showed the handler and `windows` crate using the same `windows-core` 0.61 line,
so the unstable callback path was removed rather than retained.

## Retained polling result

- Poll interval: 100 ms
- Initial Teams physical bounds: `0,847,48,891`
- Initial DWM source crop: `0,847,48,891`
- Repeated unchanged checks: stable; no process exit or error
- Controlled blank Paint process: opened and closed successfully, but Teams did
  not move
- Two controlled pointer drags within the Teams rectangle: the customized
  vertical taskbar did not reorder the button; Teams remained at the same bounds
- A subsequent supervised user reflow produced many real rectangle transitions
  across the vertical taskbar and many corresponding
  `taskbar_reflow_refreshed ... changed:true` records
- Observed UI Automation discovery and DWM update work per transition: roughly
  35 to 153 ms in the captured log, in addition to scheduling within the 100 ms
  polling interval
- Visual result: the mirror recovered and followed Teams, but the user could
  briefly see another icon during movement; the flash was fast and barely
  noticeable, and the user accepted that limitation rather than expanding the
  spike into a more complex capture or event architecture
- Pixel capture and OCR: not used

The final supervised run therefore proves that periodic semantic rediscovery
updates the DWM crop after real movement. It does not prove seamless tracking:
the source can remain stale for the poll interval plus discovery/update work,
and that residual exposure was visible as a brief wrong icon.

## Decision

Phase 2 receives a qualified lifecycle pass for this visual fallback. Automatic
recropping works, and the user explicitly accepted the short wrong-icon flash as
preferable to a substantially more complex solution.

The example remains a diagnostic. Attention Hub must not integrate this mirror
as persistent product behavior without the separate architecture/product
decision already required by ADR 0008. If retained later, the UI must continue
to treat it as fallible visual context, never an authoritative semantic count.
