# Feasibility Review: Teams Taskbar-Badge DWM Thumbnail Mirror Spike

- Date: 2026-08-10
- Reviewer: independent second-opinion pass (Windows shell / DWM / UIA / Rust / Tauri)
- Status: discussion-only audit, no code or files touched
- Sibling review consulted for cross-check: `docs/council/2026-08-10-teams-dwm-thumbnail-spike-review-gemini.md`

This review reaches the same overall verdict as the sibling review but disagrees with it on evidence quality in several places (two citations in that review do not hold up under check — noted below) and proposes a smaller, cheaper Phase 0 split that isolates the two independent go/no-go questions before any coordinate math is written.

---

## 1. Verdict

**Approve with changes.**

The mechanism is officially documented, has a shipped Microsoft reference implementation (PowerToys Crop and Lock) for the general "crop a top-level HWND into a native destination window via `DwmRegisterThumbnail`" pattern, and every non-negotiable boundary in the request maps cleanly onto that mechanism's actual capabilities (opaque handle only, no pixel readback, no input forwarding). The two load-bearing assumptions — that `Shell_TrayWnd` is an eligible thumbnail *source* at all, and that its composited surface includes the `SetOverlayIcon`-drawn badge — have no public precedent either way and must be settled empirically before anything else is built. Both are answerable in under an hour with zero UI Automation and zero Tauri involvement, which is smaller than the spike as proposed. Everything downstream (UIA discovery, DPI conversion, reflow safety, Tauri destination wiring) should stay gated behind that result exactly as the request already intends.

---

## 2. Verified facts

1. **`DwmRegisterThumbnail` requires both handles to be top-level windows.** "Setting the destination window handle to anything other than a top-level window type will result in a return value of E_INVALIDARG" — and the identical sentence applies to `hwndSource`. Neither parameter description places any restriction on the source window's *owning process* or window class. [Microsoft Learn: `DwmRegisterThumbnail`](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmregisterthumbnail)

2. **Only the destination window is process-restricted.** "The window designated by `hwndDestination` must either be the desktop window itself or be owned by the process that is calling `DwmRegisterThumbnail`. This is required to prevent applications from affecting the content of other applications." No equivalent restriction exists for `hwndSource` — Microsoft's own canonical example thumbnails `Progman` (owned by Explorer, not the caller) from an arbitrary caller-owned destination. [Same page as above] This is the strongest documented analogy for "an Explorer-owned shell window can be a source," and it directly supports Question A — but `Progman` is a plain legacy window with no XAML Islands, so it only proves *ownership* isn't the blocker, not that a modern composited shell window like `Shell_TrayWnd` behaves the same way.

3. **`DWM_THUMBNAIL_PROPERTIES.rcSource` is documented only as "the region of the source window to use as the thumbnail. By default, the entire window is used as the thumbnail."** [Microsoft Learn: `DWM_THUMBNAIL_PROPERTIES`](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ns-dwmapi-dwm_thumbnail_properties) — this page states nothing about DPI, physical-vs-logical pixels, or client-vs-window coordinate space. Any claim that the prose reference "specifies" a coordinate space is not supported by the primary source (see correction to the sibling review below).

4. **The coordinate space is instead established by convention, in two independent code sources, not by API prose.** Raymond Chen's DWM thumbnail sample and PowerToys' shipped `ThumbnailCropAndLockWindow.cpp` both compute `rcSource` by taking a rectangle already expressed in the source window's own top-left-relative space (offsetting by `-rcSource.left, -rcSource.top`, or by subtracting the source window's own screen-space origin before assigning `rcSource`). Neither does a `MapWindowPoints`/`ScreenToClient` call against the *destination* window, because `rcSource` is never destination-relative. This answers Question C for the source side: convert UIA `BoundingRectangle` (screen pixels) → `Shell_TrayWnd`-relative pixels by subtracting `Shell_TrayWnd`'s own screen-space window-rect origin, not by any DWM-specific API. [PowerToys `ThumbnailCropAndLockWindow.cpp`](https://github.com/microsoft/PowerToys/blob/main/src/modules/CropAndLock/CropAndLock/ThumbnailCropAndLockWindow.cpp), [Old New Thing: "How can I display a live screenshot of a piece of another application?"](https://devblogs.microsoft.com/oldnewthing/20130513-00/?p=4393)

5. **PowerToys Crop and Lock's Thumbnail mode is real, shipped prior art for the general mechanism — for ordinary top-level application windows, using a plain `CreateWindowExW` Win32 destination window, not a WinUI/XAML/WebView2 host.** Confirmed directly from source at `src/modules/CropAndLock/CropAndLock/ThumbnailCropAndLockWindow.cpp` (main branch): the destination is created with `CreateWindowExW`/`WS_OVERLAPPEDWINDOW`, `DwmRegisterThumbnail(m_window, m_currentTarget, ...)` registers it, and resize is handled by recomputing `rcDestination`/`rcSource` on `WM_SIZE`/`WM_SIZING` and re-calling `DwmUpdateThumbnailProperties`. This directly answers Question F: a tiny dedicated native window, not a Tauri/WebView2 HWND, is both the proven pattern and the smallest correct choice.
   *Correction to the sibling review*: the file path it cites, `src/modules/cropandlock/CropAndLockModule/ThumbnailWindow.cpp`, does not exist in the repository. I confirmed the actual directory listing via the GitHub API (`src/modules/CropAndLock/CropAndLock/`, containing `ThumbnailCropAndLockWindow.cpp`/`.h`, `ReparentCropAndLockWindow.cpp`, `ScreenshotCropAndLockWindow.cpp`, etc.). The conclusion the sibling review drew from this citation happens to be correct, but the citation itself was fabricated and should not be trusted or reused as-is.

6. **PowerToys' own issue tracker documents that this general family of low-level HWND-composition techniques has a real history of breaking on modern XAML/UWP-hosted windows** — e.g. "[Crop and Lock] Thumbnailing a Reparented Window leads to crash" (#32363) and community reports of black/white-screen failures when *reparenting* (not thumbnailing) modern WinUI/UWP windows. This is Reparent mode (`SetParent`), a different mechanism from Thumbnail mode (`DwmRegisterThumbnail`), so it does not directly transfer as a failure precedent for this spike — but it is documented evidence that Microsoft's own shipped tooling in this exact API family is fragile against modern composited UI on Windows 11, which is directly relevant context (not proof) for the Windows 11 taskbar's XAML-Islands-based rendering. [PowerToys issue #32363](https://github.com/microsoft/PowerToys/issues/32363)

7. **`DwmRegisterThumbnail` and `DwmUpdateThumbnailProperties` never pass a pixel buffer, DC, or memory pointer across the API boundary in either direction** — `DwmRegisterThumbnail` returns only an opaque `HTHUMBNAIL` handle, and `DwmUpdateThumbnailProperties` takes only rectangles/opacity/visibility flags. Zero-readback is guaranteed by the function signatures themselves, not merely by an architectural inference about "the DWM process does compositing." This is a stronger and more precise statement of the sibling review's Fact 4, which cited the general DWM overview page rather than the API signatures that actually make the guarantee load-bearing.

8. **UI Automation `BoundingRectangle` correctness across monitors depends on the *calling process's* DPI awareness, not on any property of the element itself.** A UI Automation client that is not Per-Monitor-V2 DPI aware receives coordinates that Windows has already virtualized/scaled to the client's assumed DPI context, which will not agree with physical-pixel window/screen coordinates on a monitor at a different scale factor. Microsoft's documented fix is to make the whole process DPI-aware (`SetProcessDpiAwarenessContext`/manifest) so `BoundingRectangle`, `GetWindowRect`, and `MonitorFromWindow`-family APIs all agree in physical pixels. [Microsoft Learn: Understanding Screen Scaling Issues](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-screenscaling) — this answers the DPI-awareness half of Question C directly, and is a concrete implementation prerequisite that neither the request nor the sibling review calls out explicitly: the probe process must declare Per-Monitor-V2 DPI awareness *before* the first UIA or window-coordinate call, or Phase 1 will silently misbehave only on non-primary or non-100%-scaled monitors.

---

## 3. Unverified hypotheses

These require empirical testing; none are confirmable from documentation or source alone.

1. **Source-surface badge inclusion (highest-leverage, cheapest to test).** Does `DwmRegisterThumbnail`'s live surface for `Shell_TrayWnd` include the bitmap that Explorer draws via `ITaskbarList3::SetOverlayIcon`, or is that overlay composited through a separate DirectComposition visual / hardware overlay plane associated with the XAML Island that a standard DWM thumbnail does not reference? No public source, PowerToys issue, or blog post documents anyone thumbnailing `Shell_TrayWnd` itself (as opposed to thumbnailing an ordinary application window). This is the single fact the entire spike hinges on. *(Question A, B)*

2. **Source eligibility of the taskbar window itself.** Is `Shell_TrayWnd`/`Shell_SecondaryTrayWnd` excluded from thumbnail registration by some undocumented shell-specific rule (distinct from the documented top-level-window and destination-ownership rules), the way DRM-protected playback surfaces are excluded from capture APIs? No evidence either way was found. *(Question A)*

3. **Coordinate-pipeline accuracy across mixed-DPI multi-monitor topologies**, specifically the case the sibling review's Phase 1 does not call out: primary monitor at 100% and a secondary monitor (hosting `Shell_SecondaryTrayWnd`) at a different scale factor simultaneously, tested with the probe process's DPI-awareness context fixed as in Fact 8 above. Single-monitor tests at 125%/150%/200% (as the sibling review proposes) do not exercise the cross-monitor transform at all. *(Question C)*

4. **Auto-hide, occlusion, and non-primary-desktop-session behavior.** Whether DWM keeps the thumbnail surface live and current when the source window is auto-hidden (moved off-screen, not destroyed), covered by a full-screen exclusive app, or on a monitor that goes to sleep. *(Question D, G)*

5. **Reflow-event timing.** Whether a UIA bounds-changed/structure-changed event on the taskbar's button container reliably fires *before* the visual reflow animation completes, or only after — this determines whether an event-driven blank-then-recrop policy can avoid a visible flash of neighboring content, or whether a brief mandatory blank window is unavoidable. *(Question D)*

---

## 4. Adopt

- **Baseline criteria 1, 2, 4, 10, 11, 12** as written — they are precise, measurable, and already correctly scoped to feasibility rather than production polish.
- **All non-negotiable boundaries as written**, especially "a failed DWM hypothesis ends this path; it does not authorize a different capture technique" — this is the single most important sentence in the request, because it is the only thing standing between a clean stop and a slide into `PrintWindow`/WGC/OCR after the DWM path disappoints. Treat it as load-bearing, not aspirational.
- **The requirement that discovery report "unavailable" rather than guess.** This is consistent with how ADR 0004 and ADR 0007 already resolved ambiguity in this project — both stopped rather than shipped a heuristic with no semantic marker. The same discipline should apply here.
- **A tiny dedicated native Win32 destination window (Question F).** Confirmed by Fact 5 above as both the proven pattern and the only one that avoids WebView2's child-HWND compositing sitting on top of the thumbnail region. Tauri may *position* this window (it already owns a top-level HWND it can parent/co-locate against) but must not attempt to render the thumbnail through its own webview surface.

---

## 5. Modify

1. **Split "Phase 0" into two independent, smaller gates before any UI Automation code is written** (see §7). The request's own Phase-0-equivalent already computes a crop rectangle over "the taskbar area," which conflates two separately-failable things: (a) is the taskbar thumbnailable at all, and (b) does the composited surface include badge content. Testing them separately means a failure on (a) costs minutes, not the hour the combined test would take, and a failure on (b) doesn't get muddied by coordinate-guessing error.

2. **Replace pixel-delta reflow heuristics with an event-driven blank-before-recrop policy, not a distance threshold.** Any specific pixel-shift threshold (e.g. ">3 pixels") is an invented number with no cited basis in either review, and checking it requires *some* form of periodic sampling — which sits uncomfortably close to the "no frame polling" budget in criterion 12. The lower-risk design: subscribe to UIA `StructureChanged`/bounds-changed notifications scoped to the taskbar's button container; on any such event, immediately set `fVisible = FALSE` on the thumbnail and only re-show after a fresh discovery+recrop succeeds. This is push-driven, not poll-driven, and needs no magic-number tuning. *(modifies Criterion 3 & 8 as proposed by the sibling review)*

3. **Use a controllable, repeatable badge instead of waiting for Teams to badge naturally, for the Phase 0b go/no-go test.** ADR 0004's own evidence file (`docs/milestones/evidence/m0/2026-08-10-teams-badge-probe.md`) records exactly this failure mode already: two probe screenshots ended up sharing one stale timestamp because a naturally-occurring badge transition couldn't be captured cleanly on demand. A disposable throwaway test binary that calls `ITaskbarList3::SetOverlayIcon` on *its own* taskbar button produces a badge on command, any number of times, without touching Teams at all — this makes the highest-leverage go/no-go test in the whole spike reproducible instead of opportunistic.

4. **Explicitly require Per-Monitor-V2 DPI awareness on the probe/spike process before the first coordinate call**, per Fact 8. Neither the request nor the sibling review states this as a prerequisite; without it, Phase 1's DPI matrix will pass on the primary monitor by accident (system-DPI-aware processes are usually correct there) and fail only on secondary/non-100% monitors, which is the worst kind of result to debug later.

5. **Add mixed-DPI, multi-monitor topology explicitly to the Phase 1 test matrix**, not just sequential single-monitor scale changes. *(modifies the sibling review's Phase 1, per hypothesis 3 above)*

---

## 6. Reject

1. **Any fallback to `PrintWindow`, `BitBlt`, Windows Graphics Capture, or OCR if the DWM path fails.** Already a non-negotiable boundary; restated here because it is the reject-item most likely to get quietly reconsidered under schedule pressure after a disappointing Phase 0b result. It should not be.
2. **A generic taskbar/thumbnail provider abstraction, multi-app support, or anything reusable beyond this one bounded question.** The request already says this; agreeing with the sibling review here.
3. **Attempting secondary-taskbar (`Shell_SecondaryTrayWnd`) and multi-monitor support in the same pass as primary-taskbar feasibility.** It is a distinct, less-documented window with its own monitor/DPI transform; prove the primary case first and treat the secondary taskbar as a separate follow-up decision, not a parallel track in this spike.
4. **Building real-time UIA reflow tracking, animation smoothing, or any "keep it perfectly glued during the 100-300ms reflow animation" logic in this spike.** A brief, correctly-blanked gap during reflow is an acceptable, honest result for a feasibility spike; masking it with interpolation or prediction is exactly the kind of unbounded-effort creep the non-negotiable boundaries are trying to prevent.
5. **Rendering the DWM thumbnail inside or behind the Tauri/WebView2 window.** Confirmed unsound by Fact 5/Adopt §4 above; the destination must be a separate native top-level HWND.

---

## 7. Smallest proposed spike

### Phase 0a — Whole-bar thumbnail sanity check (no cropping, no UIA)
- **Action**: `FindWindow(NULL, ...)` / `GetShellWindow`-adjacent lookup for `Shell_TrayWnd`; create one tiny native destination window; call `DwmRegisterThumbnail` with no `rcSource` override (whole window, per the documented default); make it visible.
- **Stop gate**: any HRESULT other than `S_OK` from registration, or a black/blank/frozen destination for the *entire* mirrored bar, ends the path immediately — this settles Question A/hypothesis 2 before any coordinate work exists to debug.

### Phase 0b — Controlled badge-inclusion test (still no UIA)
- **Action**: build a disposable test binary that calls `ITaskbarList3::SetOverlayIcon` on its own taskbar button to produce a known, repeatable badge; manually measure and hardcode a temporary `rcSource` over that one button (throwaway constant, explicitly not shipped); confirm the badge is visible in the mirror.
- **Stop gate**: badge absent from the mirror while present on the real taskbar ends the path immediately, per the non-negotiable "a failed DWM hypothesis ends this path" — this settles hypothesis 1, the single highest-leverage question in the whole spike.

### Phase 1 — UIA discovery + DPI-correct coordinate conversion
- **Action**: set the process to Per-Monitor-V2 DPI awareness; discover the real Teams taskbar button via UIA; convert `BoundingRectangle` to `Shell_TrayWnd`-relative pixels by subtracting the taskbar window's own screen-space origin (Fact 4); replace the Phase 0b hardcoded rect with this computed one.
- **Stop gate**: crop must show the complete icon+badge and zero neighboring pixels at rest, across 100/125/150/200% single-monitor and at least one genuinely mixed-DPI two-monitor layout (modified per §5.5).

### Phase 2 — State transitions with the destination open throughout
- **Action**: observe badge 0 → 1 → 2+ transitions (using the controllable test badge from 0b as a rehearsal, then a real Teams transition) without unregistering/reopening the thumbnail.
- **Stop gate**: per original criteria 4–6.

### Phase 3 — Reflow, auto-hide, and monitor-change safety (event-driven, no polling)
- **Action**: subscribe to UIA structure/bounds-changed notifications on the taskbar button container; on any relevant event, blank the destination, rediscover, recrop, then re-show (§5.2); trigger real reflows by opening/closing neighboring taskbar apps, toggling auto-hide, and changing monitor topology.
- **Stop gate**: per original criteria 8–9, plus zero neighboring-content frames observed across a fixed number of manually-triggered reflows.

### Phase 4 — Resource measurement and evidence capture
- **Action**: confirm the native destination window integrates correctly whether owned/positioned standalone or co-located with the Tauri window (never rendered through it); measure idle CPU/memory per criterion 12; capture evidence per criterion 13.
- **Stop gate**: CPU/memory criteria as originally specified.

No phase here builds anything beyond what the next phase's test needs; Phase 0a+0b together are smaller and cheaper than the single combined Phase 0 in the request and in the sibling review, because they fail fast on the cheaper question first.

---

## 8. Revised pass/fail criteria

1. **(new, gates everything)** `DwmRegisterThumbnail(destination, Shell_TrayWnd)` returns `S_OK` and the unmodified whole-bar mirror is live, not black/blank/frozen. Fail ends the spike.
2. **(new, gates everything)** A `SetOverlayIcon`-drawn badge on a controllable test window is visible in a manually-cropped mirror of that window's taskbar button. Fail ends the spike per the non-negotiable stop rule.
3. Teams is discovered via UIA and associated unambiguously with the correct top-level taskbar HWND — original criterion 1, unchanged.
4. The computed crop shows the complete icon+badge and zero neighboring content at rest across 100/125/150/200% single-monitor DPI **and** at least one mixed-DPI two-monitor layout — extends original criterion 3/Phase-1 gate.
5. Black, blank, frozen, or badge-excluded output at any point is a hard failure — original criterion 4, unchanged.
6. At least three visually distinct badge states are observed, with at least one transition while the destination stays open and registered — original criteria 5–6, unchanged.
7. Visual latency between source and mirror stays under one second without unregister/reopen — original criterion 7, unchanged.
8. An event-driven bounds/structure-changed handler blanks the destination before any reflow-affected frame is shown, and correctly rediscovers/recrops afterward — replaces the pixel-delta version of original criterion 8.
9. Missing Teams, hidden taskbar, invalid HWND, and ambiguous candidates are nonfatal and never leave a stale/wrong crop visible — original criterion 9, unchanged.
10. DWM owns composition; the destination process never receives a pixel buffer, DC, or pointer — verifiable directly from the API signatures (Fact 7), not just by absence of a bug — original criterion 10, made stronger.
11. Clicking the destination never activates Teams or invokes the taskbar — original criterion 11, unchanged.
12. Idle CPU stays under 1% over 60 seconds with the event-driven (non-polling) design from criterion 8; no monotonic memory growth over five minutes — original criterion 12, unchanged, now explicitly compatible with the reflow-safety mechanism.
13. Evidence records Windows build, Teams version, taskbar HWND/class, monitor/DPI/layout (including the mixed-DPI case), HRESULTs from both Phase 0a and 0b, crop geometry, latency, and resource measurements, without committing private screenshots — original criterion 13, unchanged.

---

## 9. Unresolved questions

Only questions that materially affect approval of the next step:

1. **Does `Shell_TrayWnd`'s composited surface include the `SetOverlayIcon` badge bitmap, or is it rendered through a compositor path a DWM thumbnail doesn't reference?** This is the one question the entire spike exists to answer, and Phase 0b answers it directly and cheaply. Nothing else should be built before this returns.
2. **Is `Shell_TrayWnd` itself an eligible, non-excluded DWM thumbnail source on the target Windows 11 build at all**, independent of the badge question? Phase 0a answers this first, ahead of 0b, at even lower cost.
3. **Does the DPI-aware coordinate pipeline hold across genuinely mixed-DPI multi-monitor layouts**, not just sequential single-monitor scale changes? Materially affects whether Phase 1's pass/fail claim can be trusted on the kind of multi-monitor setup this product is explicitly built for (per `docs/vision.md`'s "large multi-monitor setup" problem statement).
4. **Should retaining this technique beyond the spike require a new ADR**, given it would be the first mechanism in Attention Hub that renders another application's live pixels inside its own window, as opposed to reading a semantic property and rendering Attention Hub's own representation of it (Telegram/Outlook/Teams today)? This does not block the bounded spike — Milestone 0's non-goals already exclude production UI — but it should be answered before this path is referenced as anything beyond a spike in a future milestone plan, because "observer boundary" as currently written in `docs/vision.md` was written against semantic-property observation, not visual passthrough, and deserves an explicit ruling rather than an implicit one.
