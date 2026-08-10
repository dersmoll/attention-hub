# Teams taskbar DWM mirror readiness evidence

- Date: 2026-08-11 Europe/Kyiv
- Result: bounded runtime and primary-taskbar recovery gates passed
- Scope: native diagnostic only; no Tauri or product-panel integration

## Implementation change

The earlier Phase 2 diagnostic created a UI Automation client and traversed the
complete primary-taskbar accessibility tree every 100 ms. Individual scans took
roughly 35 to 153 ms during the supervised reflow run, making that implementation
unsuitable for retention.

The readiness version performs one full discovery, retains the selected Teams
UI Automation element, and reads only its current rectangle on the 100 ms tick.
When the cached element or taskbar disappears, the mirror hides. Full discovery
is then bounded to at most once per second. A changed `Shell_TrayWnd` causes the
old DWM thumbnail to be discarded, the new source to be registered, and the crop
to remain hidden until one unambiguous Teams button is available.

No pixels are returned to the process. OCR, image recognition, screen capture,
input forwarding, Teams process inspection, Tauri IPC, and semantic-count
extraction remain outside the diagnostic.

## Runtime gate

The debug-build probe ran for 612 seconds while an external sampler collected
600 one-second process samples.

- Total CPU normalized across logical processors: 0.018%
- Working set: 19.68 MiB average; 20.85 MiB maximum
- Private memory: 2.54 MiB average; 2.77 MiB maximum
- Maximum handle count: 258
- Nine idle 60-second metric windows: zero full rediscoveries
- Idle cached-check averages: approximately 0.655 to 0.890 ms
- Largest idle-window check: 36.277 ms
- A movement-heavy window averaged 1.174 ms; its largest check was 92.897 ms
- Real movement updates were usually logged at 0 to 3 ms after a poll fired,
  with transient 51 and 92 ms outliers

The gate thresholds were under 1% total CPU, no unbounded memory growth, cached
checks averaging under 10 ms, and no idle rediscovery churn. The observed run
passed those thresholds. Average and maximum memory stayed within the narrow
ranges above; the sampler did not collect a separate allocation-growth profile.

## Recovery gate

Closing the visible Teams main window was accepted by Teams, its background
process survived, and reopening through the registered `msteams:` protocol
restored one visible window. Teams is pinned on this machine, so its taskbar
button remained present and this did not exercise the absent-element path.

The Explorer process owning `Shell_TrayWnd` was restarted twice:

- the taskbar HWND and owner process changed both times;
- the mirror logged taskbar absence and hid;
- temporary absent/ambiguous Teams discovery did not expose the old crop;
- the DWM thumbnail source was rebound after the new taskbar appeared;
- Teams recovered through full rediscovery in 208 ms and 270 ms once its button
  became available;
- the hardened retest emitted no stale-thumbnail cleanup warning and the probe
  remained running.

## Remaining limits

- A brief wrong-icon flash during ordinary reflow remains the accepted visual
  compromise from Phase 2.
- An unpinned Teams close/reopen transition is not tested.
- Secondary taskbars, display/DPI changes, suspend/resume, long-duration daily
  use, and Tauri-window integration are not tested.
- The mirror is fallible visual context. The proven semantic Teams signal
  remains qualitative `activityStatus`; this diagnostic does not authorize an
  exact count.

## Decision

The cached tracker passes the bounded performance and primary-taskbar restart
gate on the tested machine. It is technically suitable for a separately scoped
product-integration decision, but this evidence does not itself integrate or
retain the mirror in Attention Hub.
