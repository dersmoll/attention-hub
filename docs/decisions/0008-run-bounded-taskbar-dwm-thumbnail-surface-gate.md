# ADR 0008: Run a bounded taskbar DWM thumbnail surface gate

- Status: Accepted; Phases 0 and 1 passed, Phase 2 passed with a visual caveat
- Date: 2026-08-10
- Last updated: 2026-08-11

## Context

ADR 0004 established that Microsoft Teams exposes a reliable qualitative
activity signal but not its rendered numeric taskbar badge through the bounded
UI Automation properties that were tested. Attention Hub must not relabel that
boolean as an exact count.

A visual-only fallback may still help on the large multi-monitor setup that
motivates the product. Windows DWM thumbnails can ask the compositor to render
one top-level window into another process-owned top-level window without
returning a bitmap to the destination process. The load-bearing unknown was
whether the Windows 11 Explorer taskbar is a content-bearing DWM thumbnail
source and whether its composed surface includes the real Teams badge.

## Decision

Run only the smallest native Phase 0 surface gate:

- create an Attention Hub-owned native top-level diagnostic window;
- register the primary `Shell_TrayWnd` as its DWM thumbnail source;
- display the complete taskbar without UI Automation or source cropping;
- visually compare the real taskbar and mirror while a real Teams badge is
  present and changing;
- return and record only window/DWM metadata, never pixels.

The diagnostic must not use OCR, image recognition, `BitBlt`, `PrintWindow`,
Desktop Duplication, Windows Graphics Capture, Teams process inspection,
input forwarding, Tauri IPC, React, or the normalized attention-signal model.
Failure does not authorize another capture technique.

After Phase 0 passed, a separately approved Phase 1 may use a Per-Monitor-V2
DPI-aware UI Automation client to discover one unambiguous primary-taskbar
Teams button, translate its physical screen bounds against the taskbar's DWM
extended-frame origin, and apply one static `rcSource` crop. It must not add
padding heuristics, polling, reflow tracking, or product integration.

After the user demonstrated the static crop failure, a separately approved
Phase 2 may test lifecycle recovery in the same native example. It remains a
diagnostic: no Tauri integration, normalized signal, OCR, pixel readback, or
input forwarding is added to product code.

## Outcome

On Windows build `26220.9022`, `DwmRegisterThumbnail` accepted the primary
`Shell_TrayWnd` and `DwmQueryThumbnailSourceSize` returned `48 by 1440`, matching
the vertical primary taskbar. The user confirmed that the native destination
showed the complete live taskbar, included the real Teams badge, and reflected
badge changes while the thumbnail registration remained open.

The destination received no bitmap, device context, or pixel buffer. A user
supplied screenshot was inspected in the conversation but is not committed.
The first diagnostic window was only 48 pixels wide and therefore had almost no
draggable caption area; this is a destination-window usability issue, not a DWM
surface failure. The example now keeps a wider caption while preserving the
taskbar thumbnail's aspect ratio.

Phase 1 found exactly one visible Teams taskbar button with both a Teams identity
and UI Automation button role, while separately excluding one Teams
`NotifyItemIcon`. The UI Automation bounds were `0,847,48,891`; the taskbar DWM
extended frame was `0,0,48,1440`; and the resulting unpadded source crop was
`0,847,48,891`. The user confirmed that the movable destination showed the
complete Teams icon and badge with no neighboring pixels at rest.

When another taskbar icon appeared above Teams, the taskbar reordered and the
fixed crop displayed the icon that moved into the old coordinates. This is the
expected static-rectangle limitation. Phase 1 therefore proves discovery and
coordinate correctness at rest but also proves that the static crop is unsafe
as a persistent product surface without separately evaluated invalidation and
recropping behavior.

Phase 2 rejected an Explorer-scoped WinEvent trigger because a controlled new
taskbar button produced no reorder/location event. A taskbar-descendant UI
Automation property-change subscription did fire, but the process then exited
with `STATUS_HEAP_CORRUPTION`; that implementation was removed. The remaining
diagnostic revalidates the semantic Teams UI Automation rectangle every 100 ms,
hides the thumbnail, and updates `rcSource` only when the rectangle changes.
It remained stable during automated checks. A subsequent supervised reflow
produced many real `changed:true` rectangle transitions across the vertical
taskbar, and the crop followed Teams. The user briefly saw another icon during
movement, but described it as fast and barely noticeable and accepted that
tradeoff instead of expanding the spike into a more complex solution. Polling
therefore receives a qualified visual-fallback pass; it is not seamless and is
not, by itself, a product-retention decision.

Full sanitized evidence is recorded in
`docs/milestones/evidence/m0/2026-08-10-teams-taskbar-dwm-thumbnail.md` and
`docs/milestones/evidence/m0/2026-08-10-teams-taskbar-dwm-static-crop.md`.
Phase 2 evidence is recorded in
`docs/milestones/evidence/m0/2026-08-10-teams-taskbar-dwm-reflow.md`.

A separately approved readiness gate replaced repeated full-tree discovery with
a cached Teams UI Automation element. Full taskbar traversal now occurs only
after element or taskbar loss, at most once per second. A 612-second debug-build
run measured 0.018% total CPU, 19.68 MiB average working set, 20.85 MiB maximum
working set, 2.54 MiB average private memory, and 2.77 MiB maximum private
memory. Nine idle timing windows performed no rediscoveries and averaged about
0.7 to 0.9 ms per cached check. Real taskbar movement usually recropped in 0 to
3 ms after a poll fired, with transient 51 and 92 ms update outliers.

Restarting the Explorer process that owned `Shell_TrayWnd` twice caused the
mirror to hide, detect a new taskbar HWND, tolerate the temporarily ambiguous
pin tree, re-register its DWM source, and recover Teams in 208 ms and 270 ms once
the button became available. Closing the Teams main window preserved its pinned
taskbar button and background process, so an unpinned Teams-absence transition
remains untested. Sanitized readiness evidence is recorded in
`docs/milestones/evidence/m0/2026-08-11-teams-taskbar-dwm-readiness.md`.

## Consequences

- The DWM taskbar surface and static Teams crop hypotheses pass at rest on the
  tested machine.
- The existing Teams `activityStatus` boolean remains the authoritative
  semantic signal.
- The 100 ms UI Automation revalidation experiment dynamically recrops after
  real taskbar movement, with a user-accepted brief stale-icon flash. Cached
  element tracking passes the bounded runtime-cost and primary-taskbar restart
  gates on the tested machine. Secondary taskbars, an unpinned Teams absence,
  and product integration remain unimplemented. The static crop must not be
  retained; the cached tracker remains a diagnostic until a separate
  product-retention decision.
- Retaining a live source-pixel mirror as product behavior requires a separate
  architecture/product decision even if a later crop spike succeeds.
