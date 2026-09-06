# Feasibility audit: Teams taskbar-badge DWM mirror spike (swe)

- Date: 2026-08-10
- Scope: discussion-only audit of the proposed visual-only Teams taskbar-badge
  DWM thumbnail mirror spike. No code or files touched.
- Checkpoint audited: branch `agent/m0-notification-feasibility`, commit
  `d942187`, draft PR #2.
- Sibling reviews consulted for cross-check:
  `docs/council/2026-08-10-teams-dwm-thumbnail-spike-review-claude.md`,
  `docs/council/2026-08-10-teams-dwm-thumbnail-spike-review-gemini.md`,
  `docs/council/2026-08-10-teams-taskbar-badge-dwm-mirror-audit-kimi.md`,
  `docs/council/2026-08-10-teams-taskbar-badge-dwm-mirror-audit-fable.md`.

---

## 1. Verdict

**Approve with changes — conditional on a hard stop after Phase 0.**

The DWM thumbnail crop-and-display pattern is real, documented, and shipped by
Microsoft in PowerToys Crop and Lock. It is one of the few Windows techniques
that can honestly claim "the destination process never receives a bitmap." The
proposal's non-negotiable boundaries map cleanly onto the DWM API surface.

However, the two load-bearing assumptions have **no documented or source-level
precedent**:

1. `Shell_TrayWnd` / `Shell_SecondaryTrayWnd` yields a content-bearing DWM
   thumbnail on Windows 11, and
2. The Teams numeric badge overlay is part of that thumbnail surface.

Those two questions must be answered empirically before any UI Automation,
coordinate math, Tauri wiring, reflow tracking, or product discussion. The
proposed spike should therefore be reduced to a 30–60 minute native-only probe.
If Phase 0 shows black, blank, frozen, or badge-free output, this path ends
immediately and the existing qualitative Teams `activityStatus` boolean remains
the authoritative signal.

---

## 2. Verified facts

1. **Both `hwndSource` and `hwndDestination` must be top-level windows.**
   "Setting the source window handle to anything other than a top-level window
   type will result in a return value of `E_INVALIDARG`." `Shell_TrayWnd` and
   `Shell_SecondaryTrayWnd` are top-level, so the API call is not rejected on
   window-type grounds.
   - Source: [Microsoft Learn: `DwmRegisterThumbnail`](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmregisterthumbnail)

2. **The destination must be owned by the calling process; the source has no
   ownership restriction.**
   "The window designated by `hwndDestination` must either be the desktop window
   itself or be owned by the process that is calling `DwmRegisterThumbnail`.
   This is required to prevent applications from affecting the content of other
   applications."
   - Source: same page

3. **Microsoft's own documentation example registers `Progman` — a shell-owned
   top-level window — as a thumbnail source.**
   This is the strongest public precedent for using an Explorer-owned window as
   a DWM source, but it does not prove that the Windows 11 taskbar behaves the
   same way.
   - Source: same page, Examples section

4. **DWM thumbnails are dynamic, composited relationships, not bitmaps delivered
   to the caller.**
   "These are not static snapshots of a window, but are instead dynamic, constant
   connections between a thumbnail source window and a location on a destination
   window that receives the live thumbnail rendering." The API surface returns
   only an opaque `HTHUMBNAIL` handle; there is no pixel buffer, DC, or memory
   pointer.
   - Source: [Microsoft Learn: DWM Thumbnail Overview](https://learn.microsoft.com/en-us/windows/win32/dwm/thumbnail-ovw)

5. **`DWM_THUMBNAIL_PROPERTIES` defines `rcSource` only as "the region of the
   source window to use as a thumbnail."**
   The docs do not specify DPI, physical vs. logical pixels, or client/window
   coordinate space. "By default, the entire window is used as the thumbnail."
   - Source: [Microsoft Learn: `DWM_THUMBNAIL_PROPERTIES`](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ns-dwmapi-dwm_thumbnail_properties)

6. **PowerToys Crop and Lock converts a screen-space crop rectangle into the
   source window's DWM extended-frame-bound space.**
   In `ThumbnailCropAndLockWindow::CropAndLock` the code calls
   `DwmGetWindowAttribute(source, DWMWA_EXTENDED_FRAME_BOUNDS, ...)` and
   `ClientAreaInScreenSpace`, then offsets the crop by
   `(client.left - frame.left, client.top - frame.top)`. `fSourceClientAreaOnly`
   is `false`. The destination is a dedicated native top-level window created
   with `CreateWindowExW` (`WS_OVERLAPPEDWINDOW | WS_CLIPCHILDREN`).
   - Source: [PowerToys `ThumbnailCropAndLockWindow.cpp`](https://github.com/microsoft/PowerToys/blob/main/src/modules/CropAndLock/CropAndLock/ThumbnailCropAndLockWindow.cpp)

7. **UI Automation `CurrentBoundingRectangle` returns physical screen
   coordinates, and a non-DPI-aware client gets wrong values at non-96 DPI.**
   "The UI Automation API does not use logical coordinates. The following
   methods and properties return physical coordinates or take physical
   coordinates as parameters ... `IUIAutomationElement::CurrentBoundingRectangle`"
   The documented remedy is to make the client DPI-aware at startup.
   - Source: [Microsoft Learn: Understanding Screen Scaling Issues](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-screenscaling)

8. **PowerToys documents that thumbnail mode "can't be controlled through the
   thumbnail."**
   DWM thumbnails do not forward input to the source by construction; the spike
   only has to avoid adding any input-forwarding of its own.
   - Source: [Microsoft Learn: PowerToys Crop and Lock](https://learn.microsoft.com/en-us/windows/powertoys/crop-and-lock)

9. **The Teams taskbar badge is not an unread-message count.**
   ADR 0004 records that it is an aggregated activity/mention signal. A visual
   mirror therefore cannot be labeled as an unread-message count even if the
   badge digit is visible.
   - Source: `docs/decisions/0004-bounded-teams-accessibility-count-experiment.md`

10. **`DwmQueryThumbnailSourceSize` provides a cheap sanity check for the
    source size reported by DWM.**
    - Source: [Microsoft Learn: `DwmQueryThumbnailSourceSize`](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmquerythumbnailsourcesize)

---

## 3. Unverified hypotheses

These must be tested empirically. No public documentation or source confirms them.

- **H-A: `Shell_TrayWnd` / `Shell_SecondaryTrayWnd` yields a content-bearing
  DWM thumbnail on Windows 11.**
  The taskbar renders through XAML Islands / `DesktopWindowXamlSource` child
  surfaces. `DwmRegisterThumbnail` may succeed and still return black/blank.

- **H-B: The Teams numeric badge is included in that thumbnail and updates live.**
  Explorer may draw the badge through `ITaskbarList3::SetOverlayIcon` or a
  separate DirectComposition overlay that DWM's thumbnail path does not sample.

- **H-C: `rcSource` is interpreted relative to `DWMWA_EXTENDED_FRAME_BOUNDS`
  when `fSourceClientAreaOnly = false`.**
  PowerToys source is strong precedent, but Microsoft does not document the
  coordinate space contract. For a borderless taskbar the offsets may be zero,
  but this must be verified.

- **H-D: UIA `BoundingRectangle` (physical pixels) aligns with
  `DWMWA_EXTENDED_FRAME_BOUNDS` without manual scaling when the probe is
  Per-Monitor-V2 DPI aware.**
  Mixed-DPI setups are the classic off-by-scale failure mode.

- **H-E: The taskbar UIA tree exposes a stable, unambiguous Teams button with a
  usable `BoundingRectangle`.**
  Discovery by AutomationId / AUMID / localized name is unproven. The prior
  probe read taskbar properties but did not establish a reliable crop rule.

- **H-F: DWM thumbnail survives taskbar auto-hide, Explorer restart, monitor/DPI
  changes, and Teams restart.**
  The thumbnail may need re-registration or may silently freeze; this is
  undocumented for shell sources.

- **H-G: A one-second latency from source change to visible destination update is
  achievable without re-registering the thumbnail.**
  DWM composes asynchronously and may batch/throttle shell-surface updates.

---

## 4. Adopt

- Baseline Criterion 1: UIA discovery of the Teams taskbar button and
  unambiguous association with the correct top-level taskbar HWND.
- Baseline Criterion 2: `DwmRegisterThumbnail` succeeds with Explorer's taskbar
  as source and an Attention Hub-owned native top-level HWND as destination.
- Baseline Criterion 4: Black, blank, frozen, or badge-excluded output is a
  hard failure.
- Baseline Criterion 5: Compare the mirror in no-badge and at least two
  visibly distinct nonzero badge states.
- Baseline Criterion 6: At least one live transition while the destination
  remains open.
- Baseline Criterion 10: DWM owns composition; the destination process never
  receives a bitmap handle, DC, or pixel buffer.
- Baseline Criterion 12: No frame polling; idle CPU < 1% over 60 s and no
  monotonic memory growth over 5 min.
- Baseline Criterion 13: Evidence records Windows build, Teams version,
  taskbar HWND/class, monitor/DPI/layout, HRESULTs, crop geometry, latency, and
  resource measurements without committing private screenshots.
- All non-negotiable boundaries, especially: no OCR, no pixel readback, no
  capture-API fallback, no Teams injection/process access, no Graph/tokens, no
  hard-coded coordinates, no click/focus/invoke, and the rule that a failed DWM
  hypothesis ends this path.

---

## 5. Modify

1. **Criterion 3: replace "no neighboring content" with "hide-on-doubt."**
   A static crop cannot guarantee isolation during Windows 11 centered-icon
   reflow. Replace with:
   > When the correct Teams button location is unknown, ambiguous, or believed
   > to have changed, the destination must set `fVisible = FALSE` or unregister
   > the thumbnail. It must never display a crop whose contents are uncertain.

2. **Criterion 8: make reflow handling a hide-then-refresh cycle, not a live
   tracking guarantee.**
   Replace with:
   > After a taskbar-button reflow, an explicit refresh rediscovers and
   > recrops Teams. Between the reflow and the refresh the destination is
   > invisible. No wrong crop is ever displayed.
   This removes the contradiction with Criterion 9 (never leave a stale/wrong
   crop).

3. **Criterion 7: keep the 1-second target as a measured goal, not an assumed
   pass condition.**
   If DWM updates take longer, the spike records the measured latency and fails
   only if the delay is materially unusable.

4. **Add a Phase 0 content gate before any UIA, coordinate, or Tauri work.**
   The first deliverable is a native-only binary that thumbnails the whole
   taskbar and checks whether the live Teams badge is visible. If it is not,
   stop.

5. **Mandate a tiny dedicated native destination window for the spike.**
   Do not use a Tauri / WebView2 HWND. Use `CreateWindowExW` with a plain
   top-level `WNDCLASSEX`, matching PowerToys.

6. **Require Per-Monitor-V2 DPI awareness in the probe process.**
   Declare it in the manifest or call
   `SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)`
   before any UIA or window-rect call. Without this, coordinates from UIA and
   DWM will disagree on scaled monitors.

---

## 6. Reject

- **Rendering the DWM thumbnail into a Tauri / WebView2 window.**
  The WebView2 `Chrome_RenderWidgetHostHWND` / DirectComposition child visual
  will paint over the DWM thumbnail layer.
- **Building a generic "taskbar thumbnail provider" or capture framework.**
  This is a single-purpose feasibility probe for Teams only.
- **OCR, pixel readback, Windows Graphics Capture, Desktop Duplication,
  `PrintWindow`, or `BitBlt` as fallback.**
  If DWM fails, the path ends. Period.
- **Real-time UIA event-driven reflow tracking in the spike.**
  UIA position-change notifications have latency; neighboring icons can sweep
  through the crop before an update arrives. Hide-on-doubt is the correct and
  smaller primitive.
- **Production UI, styling, persistence, settings, or autostart.**
  The spike must not produce a product surface.
- **Committing screenshots or raw taskbar pixel data to the repository.**
  Evidence is text, geometry, and measurements only.
- **Exposing the badge as a numeric `count` or labeling it as
  "unread messages."**
  The existing semantic `activityStatus` boolean remains authoritative. The
  mirror is a visual artifact, not a normalized count.

---

## 7. Smallest proposed spike

### Phase 0: Native-only DWM content gate (~30–60 minutes, run first)

1. Create a minimal Rust or C++ native binary in a throwaway directory (do not
   wire into Tauri yet).
2. Register a plain top-level `WNDCLASSEX` and create a destination window with
   `CreateWindowExW` (`WS_OVERLAPPEDWINDOW | WS_CLIPCHILDREN`).
3. Find `Shell_TrayWnd` (and optionally `Shell_SecondaryTrayWnd`) with
   `FindWindowW`.
4. Call `DwmRegisterThumbnail(hwndDest, hwndTaskbar, ...)` and
   `DwmUpdateThumbnailProperties` with `fSourceClientAreaOnly = false` and an
   `rcSource` covering the entire taskbar surface (use `DwmQueryThumbnailSourceSize`
   as a sanity check).
5. Open Teams and produce a visible numeric badge.
6. Visually inspect the destination window: does it show the live taskbar,
   the Teams icon, and the red numeric badge?

**Stop Gate 0:** If the thumbnail is black, blank, frozen, or shows the icon
without the badge, **stop immediately**. Do not build Phases 1–3.

**Go Gate:** The badge is visible and updates. Record Windows build, Teams
version, taskbar HWND/class, monitor/DPI, `DwmQueryThumbnailSourceSize` result,
and `HRESULT`s.

### Phase 1: UIA bounds to DWM crop (~1–2 hours, only if Phase 0 passes)

1. Mark the process Per-Monitor-V2 DPI aware.
2. Use UIA to find the Teams taskbar button. Require an unambiguous match by a
   combination of process, `AutomationId`, and/or `Name`. If ambiguous, report
   `unavailable`.
3. Read `CurrentBoundingRectangle` (physical screen pixels).
4. Call `DwmGetWindowAttribute(hwndTaskbar, DWMWA_EXTENDED_FRAME_BOUNDS, ...)`
   and obtain the client rect in screen space (e.g. `GetClientRect` +
   `ClientToScreen`).
5. Convert the UIA screen rect to the DWM frame-space origin using the
   PowerToys recipe: offset by `(client.left - frame.left, client.top - frame.top)`
   and subtract the frame origin.
6. Set `rcSource` to the resulting rect and `rcDestination` to a matching area
   in the destination window.
7. On 100% DPI and one non-100% DPI monitor, verify the crop shows the full
   Teams icon + badge and no neighboring pixels at rest.

**Stop Gate 1:** If alignment is off by more than 2 pixels, the badge is cut off,
or neighbors appear, **stop**.

### Phase 2: Live transitions and reflow hide-on-doubt (~1–2 hours, only if
Phase 1 passes)

1. Keep the destination open. Produce badge changes 0→1 and 1→2 (or 2→0).
   Record whether the mirror updates within 1 second and whether the thumbnail
   ever required re-registration.
2. Trigger one taskbar reflow (open/close a window). The probe must detect that
   the UIA bounds changed or that confidence is lost, immediately hide the
   thumbnail (`fVisible = FALSE`), and await an explicit refresh. The explicit
   refresh then rediscovers and recrops.
3. Record idle CPU over 60 s and memory over 5 min.

**Stop Gate 2:** If transitions blank/freeze for >1 s, or if a reflow leaves a
wrong crop visible, **stop**.

### Phase 3: Failure-mode inventory (if time remains)

- Missing Teams, hidden/auto-hide taskbar, invalid HWND, ambiguous candidates,
  secondary taskbar, Explorer restart, and monitor/DPI changes must all be
  nonfatal and leave no stale visible crop.

**Stop Gate 3:** Any crash, stale visible crop, or unhandled failure is a hard
failure.

---

## 8. Revised pass/fail criteria

1. **Content gate (hard fail):** `DwmRegisterThumbnail` succeeds AND the
   destination displays a live taskbar surface that includes the Teams icon with
   the numeric badge in at least two distinct nonzero states and the no-badge
   state. Black, blank, frozen, or badge-free output fails.
2. **Crop isolation (hard fail):** At rest, `rcSource` contains the full Teams
   button (icon + badge) and zero neighboring taskbar pixels. During any
   interval where the correct crop is uncertain, `fVisible` is `FALSE`.
3. **Coordinate correctness (hard fail):** The crop is derived from UIA
   `BoundingRectangle` and `DWMWA_EXTENDED_FRAME_BOUNDS` with the probe process
   Per-Monitor-V2 DPI aware. Misalignment > 2 px on any tested DPI fails.
4. **Transition latency:** A badge change (0↔1 or 1↔2) is reflected in the
   destination within 1 second without unregistering/re-registering the
   thumbnail, measured over at least one transition.
5. **Reflow safety (hard fail):** After a taskbar reflow, an explicit refresh
   rediscovers and recrops Teams. Between reflow and refresh the destination is
   invisible. A visible wrong crop at any time fails.
6. **Error handling (hard fail):** Missing Teams, hidden taskbar, invalid HWND,
   ambiguous candidates, Explorer restart, or monitor/DPI change must be
   nonfatal and leave no stale/wrong visible crop.
7. **Resource budget:** No frame polling. Idle CPU < 1% over 60 s; working set
   does not grow monotonically over 5 min.
8. **Input isolation:** Clicking the destination window does not activate,
   focus, or invoke Teams or the taskbar (manual one-time check; satisfied by
   DWM construction provided the probe does not forward input).
9. **No pixel access (hard fail):** The probe may not call `BitBlt`,
   `PrintWindow`, Desktop Duplication, Windows Graphics Capture, or any API that
   reads the badge pixels into application memory. `DwmRegisterThumbnail` /
   `DwmUpdateThumbnailProperties` is the only capture path.
10. **Evidence only:** Record Windows build, Teams version, taskbar HWND/class,
    monitor/DPI/layout, `HRESULT`s, crop geometry, transition latency, and
    resource numbers. Do not commit screenshots or private content.

---

## 9. Unresolved questions

Only questions that can change the approval materially.

1. **Does `Shell_TrayWnd` produce a live, content-bearing DWM thumbnail on the
   test machine?** Answered only by Phase 0.
2. **If the badge is included, does it update within the 1-second transition
   window?** DWM composes asynchronously; no public latency bound exists.
3. **Is there a stable, unambiguous UIA discovery rule for the Teams taskbar
   button that does not rely on localized strings or screen position?**
4. **Does the thumbnail survive an Explorer restart / `TaskbarCreated` event, or
   must the probe re-register and rediscover?**
5. **If the technical spike passes, is Attention Hub's product/architecture
   boundary prepared to explicitly authorize a persistent visual mirror of a
   source application's rendered pixels?** This is the only unresolved question
   that can block adoption even if DWM works.
