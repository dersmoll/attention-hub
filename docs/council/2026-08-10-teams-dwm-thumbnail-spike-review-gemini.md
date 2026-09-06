# Feasibility Review: Teams Taskbar-Badge DWM Thumbnail Mirror Spike

- Date: 2026-08-10
- Reviewer: Senior Windows Shell, DWM, UI Automation, Rust, & Tauri Reviewer
- Status: Completed (Discussion-Only Audit)
- Target File: `docs/council/2026-08-10-teams-dwm-thumbnail-spike-review-gemini.md`

---

## 1. Verdict

**Approve with changes.**

The proposed DWM taskbar-thumbnail crop spike is technically feasible as a tightly bounded, non-production experiment, but its core technical assumption—that static `rcSource` cropping can securely isolate the Teams badge without exposing neighboring taskbar content during Windows 11 centered-icon reflows—is high risk. 

The spike should proceed **only** after restructuring it into two fast, zero-abstraction feasibility gates that test DWM surface badging and native DPI coordinate conversion before building any UI Automation reflow tracking or Tauri integration.

---

## 2. Verified facts

1. **`DwmRegisterThumbnail` API surface & coordinate rules**  
   `DwmRegisterThumbnail` requires top-level `HWND` handles for both source (`hwndSource`) and destination (`hwndDestination`). Sub-region cropping via `DWM_THUMBNAIL_PROPERTIES.rcSource` is evaluated strictly in the **source window's physical client coordinates**.  
   *Primary Source*: [Microsoft Learn: `DwmRegisterThumbnail`](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmregisterthumbnail), [`DWM_THUMBNAIL_PROPERTIES`](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ns-dwmapi-dwm_thumbnail_properties).

2. **PowerToys Crop and Lock prior art**  
   Microsoft PowerToys' Crop and Lock module proves that `DwmRegisterThumbnail` and `DwmUpdateThumbnailProperties` can mirror cropped sub-rectangles of arbitrary top-level `HWND`s into dedicated native Win32 destination windows without reading pixels into user-mode application memory.  
   *Source Location*: PowerToys Repository [`src/modules/cropandlock/CropAndLockModule/ThumbnailWindow.cpp`](https://github.com/microsoft/PowerToys/blob/main/src/modules/cropandlock/CropAndLockModule/ThumbnailWindow.cpp).

3. **Windows 11 Taskbar composition architecture**  
   On Windows 11 (22H2+), taskbar buttons are hosted inside XAML Islands (`MSTaskListWClass` / `XamlExplorerHostIslandWindow`) within `Shell_TrayWnd` (primary display) or `Shell_SecondaryTrayWnd` (secondary displays).  
   *Primary Source*: [Microsoft Learn: UI Automation Overview](https://learn.microsoft.com/en-us/windows/win32/winauto/entry-uiautocore-overview).

4. **DWM zero-readback memory boundary**  
   DWM thumbnails execute composition entirely within the Desktop Window Manager process (`dwm.exe`) on the GPU graphics pipeline. The destination application (`attention-hub.exe`) receives zero pixel buffers, memory pointers, or bitmap handles, satisfying Attention Hub's zero-readback constraint.  
   *Primary Source*: [Microsoft Learn: Desktop Window Manager Overview](https://learn.microsoft.com/en-us/windows/win32/dwm/dwm-overview).

5. **WebView2 / Tauri destination HWND obstruction**  
   Tauri window client areas are occupied by WebView2 child windows (`Chrome_RenderWidgetHostHWND` / DirectComposition visual trees). Rendering a DWM thumbnail directly onto a Tauri top-level HWND causes WebView2 composition layers to obscure the thumbnail.  
   *Source Location*: [Tauri Architecture: Window Customization & Native Handles](https://v2.tauri.app/concept/architecture/).

---

## 3. Unverified hypotheses

1. **DWM XAML badge inclusion hypothesis**  
   *Hypothesis*: The redirection bitmap of `Shell_TrayWnd` captured by `DwmRegisterThumbnail` includes the rendered XAML overlay badge of Teams, rather than rendering badges on a separate DirectComposition layer that DWM thumbnailing omits.  
   *Verification needed*: Must be tested empirically in Phase 0.

2. **UIA BoundingRectangle to DWM client coordinate translation**  
   *Hypothesis*: Converting UIA `BoundingRectangle` (screen DIPs/pixels) via `MapWindowPoints` / `ScreenToClient` to `Shell_TrayWnd` client coordinates produces exact sub-pixel/pixel alignment without scaling drift across 100%, 125%, 150%, and 200% Per-Monitor DPI settings.  
   *Verification needed*: Must be tested empirically in Phase 1 across DPI topologies.

3. **Taskbar auto-hide & occlusion rendering behavior**  
   *Hypothesis*: When the Windows taskbar auto-hides or is occluded by full-screen windows, DWM continues to maintain a valid, updated thumbnail surface of the Teams button instead of rendering black or freezing.  
   *Verification needed*: Must be tested empirically during state transitions.

4. **Reflow isolation hypothesis**  
   *Hypothesis*: UIA position-change notifications can update `DWM_THUMBNAIL_PROPERTIES.rcSource` quickly enough during Windows 11 taskbar icon reflows (e.g. opening/closing neighboring applications) to prevent adjacent icons from visually sweeping into the cropped frame.  
   *Verification needed*: Must be tested empirically in Phase 2.

---

## 4. Adopt

- **Baseline Criterion 1**: Discovery of Teams taskbar button via UI Automation and unambiguous association with `Shell_TrayWnd` or `Shell_SecondaryTrayWnd`.
- **Baseline Criterion 2**: Successful registration of `DwmRegisterThumbnail` with Explorer taskbar as source and Attention Hub native HWND as destination.
- **Baseline Criterion 4**: Immediate hard stop if output is black, blank, frozen, or badge-excluded.
- **Baseline Criterion 10**: DWM owns composition exclusively; Attention Hub does not access bitmap memory.
- **Baseline Criterion 11**: Click-through behavior on destination window (`WS_EX_TRANSPARENT` / `WS_EX_LAYERED`), ensuring no input forwarding or activation of Teams/taskbar.
- **Baseline Criterion 12**: Zero frame-polling engine; idle CPU remains below 1%, with 0 bytes monotonic memory growth over 5 minutes.
- **Non-negotiable Boundaries**: Strict adherence to no OCR, no WGC/BitBlt pixel scraping, no Teams process injection, no Graph API usage, and no hardcoded coordinates.

---

## 5. Modify

1. **Scope Reduction on Dynamic Tracking**:  
   Do **not** build complex real-time UIA event listeners for taskbar reflow in the initial spike. Windows 11 centered taskbar icons move dynamically whenever any window opens or closes. Attempting to track this smoothly via UIA event callbacks introduces inherent latency (~100–300ms) during which neighboring app icons will sweep through `rcSource`.
2. **Acceptance Criteria 3 & 8 (Neighbor Exposure Protection)**:  
   Change from "No neighboring taskbar content may appear" to:  
   *"If taskbar button reflow or resolution change shifts the button center by >3 pixels, the destination window MUST immediately set `fVisible = FALSE` or blank itself until rediscovery completes."*
3. **Destination HWND Architecture (Criterion F)**:  
   Explicitly mandate a tiny, dedicated Win32 window (`CreateWindowExW`) created directly in Rust for `hwndDestination`. Completely bypass Tauri/WebView2 window layers for this spike to prevent composition layering conflicts.

---

## 6. Reject

1. **Reject rendering DWM thumbnail into Tauri / WebView2 window**:  
   Do not attempt to embed the DWM thumbnail into a Tauri webview layout or use Tauri window handles as `hwndDestination`. WebView2's DirectComposition tree will paint over the DWM thumbnail layer.
2. **Reject broad taskbar capture or multi-app provider abstraction**:  
   Do not design a generic "Taskbar Thumbnail Provider" architecture. This spike is strictly a single-purpose feasibility probe for Teams badge presence.
3. **Reject fallback to Windows Graphics Capture (WGC) or BitBlt upon DWM failure**:  
   If DWM thumbnailing fails (e.g. omits badge or returns black frames), end this research path immediately as required by non-negotiable boundaries.

---

## 7. Smallest proposed spike

### Phase 0: Manual HWND DWM Badge Inclusion Gate (Estimated time: 1 hour)
- **Goal**: Verify if DWM thumbnails of `Shell_TrayWnd` include XAML badge overlays.
- **Action**: Write a minimal standalone Rust test binary that creates a small native Win32 window (`CreateWindowExW`), finds `Shell_TrayWnd`, calls `DwmRegisterThumbnail`, and applies a static client `rcSource` box over the taskbar area.
- **Stop Gate 0**: Open Teams with an active unread badge. Inspect the destination window visually. If the thumbnail displays the Teams icon **without** the red numeric badge, DWM composition bypasses XAML badge overlays. **Stop the spike immediately.**

### Phase 1: UIA Taskbar Button Bounds & DPI Conversion
- **Goal**: Automate exact crop coordinates from UIA to DWM client space.
- **Action**: Use UIA to find the Teams taskbar button (`MSTaskListWClass`), extract `BoundingRectangle`, map screen DIPs/pixels to `Shell_TrayWnd` client coordinates via `ScreenToClient` / `MapWindowPoints`, and update `rcSource`.
- **Stop Gate 1**: Test across 100%, 125%, 150%, and 200% DPI scales. If the crop cuts off the badge or includes neighboring icon pixels at rest, **Stop the spike immediately.**

### Phase 2: State Transitions & Taskbar Reflow Safety
- **Goal**: Measure performance, state responsiveness, and reflow behavior.
- **Action**: Observe badge transitions (0 -> 1 -> 2+). Launch/close adjacent taskbar applications to trigger centered-icon reflow.
- **Stop Gate 2**: If adjacent app icons sweep into the mirrored window during reflow without immediate blanking/hiding, mark visual-only taskbar mirroring as unsafe for production attention display.

---

## 8. Revised pass/fail criteria

- **Pass Criterion 1 (Badge Fidelity)**: The DWM thumbnail of `Shell_TrayWnd` visually displays both the Teams taskbar icon AND its red numeric badge overlay in real-time.
- **Pass Criterion 2 (Zero Memory Readback)**: Zero byte copies or CPU pixel inspections occur in application memory (`attention-hub.exe`).
- **Pass Criterion 3 (Reflow Safety)**: The destination window instantly hides/blanks during taskbar reflow before any adjacent app icon pixel enters the cropped area.
- **Pass Criterion 4 (Resource Efficiency)**: CPU overhead <1.0% over 60 seconds; RAM growth 0 bytes over 5 minutes.
- **Fail Criterion 1 (Badge Omission)**: DWM mirrors the Teams icon but omits the rendered badge circle/number.
- **Fail Criterion 2 (Neighbor Exposure)**: Neighboring app icons (e.g. Outlook, Browser) become visible inside the cropped frame during desktop interactions.
- **Fail Criterion 3 (Surface Blackout)**: Taskbar auto-hide, full-screen apps, or multi-monitor moves result in black, frozen, or corrupted destination frames.

---

## 9. Unresolved questions

1. **XAML Overlay Render Layering**: Does Windows 11 DWM composite XAML Island badge overlays into `Shell_TrayWnd`'s top-level redirection surface, or are badges rendered on a separate hardware swapchain that `DwmRegisterThumbnail` misses? *(Must be answered by Phase 0)*.
2. **Reflow Transient Latency**: Is the latency between Windows Shell icon animation and UIA `BoundingRectangle` property change events small enough to prevent visual tearing/neighbor leakage without mandatory window blanking? *(Must be answered by Phase 2)*.
