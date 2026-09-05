# Teams taskbar-badge DWM mirror spike: feasibility audit (Fable)

- Date: 2026-08-10
- Reviewer role: Windows shell / DWM / UI Automation / Rust / Tauri feasibility review
- Scope: discussion-only audit of the proposed bounded visual-only DWM thumbnail mirror of the Teams taskbar button
- Checkpoint: `agent/m0-notification-feasibility` @ `d942187`, draft PR #2

## 1. Verdict

**Approve with changes.**

The API pattern (DwmRegisterThumbnail + rcSource crop into a process-owned top-level window) is real, documented, and proven in shipping Microsoft code (PowerToys Crop and Lock, thumbnail mode). Nothing in the documentation forbids a shell window as a source, and the official documentation example itself registers a shell-owned window (`Progman`) as a thumbnail source. However, the single load-bearing assumption — that the Windows 11 taskbar's XAML/composition-rendered content, including the badge, actually appears in a DWM thumbnail of `Shell_TrayWnd` — is undocumented and must be treated as the first empirical gate, tested with the cheapest possible probe before any crop, discovery, or lifecycle work is written. Two acceptance criteria (8 and 9) contradict each other as written and must be reconciled with hide-on-doubt semantics. The destination should be a dedicated bare Win32 window, not the Tauri WebView window.

## 2. Verified facts

| # | Fact | Source |
| --- | --- | --- |
| F1 | `DwmRegisterThumbnail` requires both source and destination to be top-level windows; anything else returns `E_INVALIDARG`. `Shell_TrayWnd` and `Shell_SecondaryTrayWnd` are top-level windows, so they are *eligible* parameters. | [DwmRegisterThumbnail (Microsoft Learn)](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmregisterthumbnail) |
| F2 | The destination window must be the desktop window itself or owned by the calling process. The source window has no ownership requirement — mirroring another process's window is the API's designed purpose. | Same page, Remarks |
| F3 | The official documentation example registers `FindWindow(_T("Progman"), NULL)` — a shell-owned window — as a thumbnail source. Shell windows as sources are documented precedent. | Same page, Examples |
| F4 | "Registering a DWM thumbnail relationship will not modify desktop composition." The source window/application is unaffected; this is structurally non-invasive. | Same page, Remarks |
| F5 | `DWM_THUMBNAIL_PROPERTIES` supports `rcSource` ("the region of the source window to use as the thumbnail"), `rcDestination`, `fVisible`, and `fSourceClientAreaOnly`. The docs do **not** specify the coordinate space of `rcSource`. | [DWM_THUMBNAIL_PROPERTIES (Microsoft Learn)](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ns-dwmapi-dwm_thumbnail_properties) |
| F6 | The DWM thumbnail API surface exposes no pixel data to the destination process: the registration returns an opaque `HTHUMBNAIL` usable only for property updates and unregistration. DWM composes the source content directly; there is no readback path in this API family. | API surface of dwmapi.h: `DwmRegisterThumbnail`, `DwmUpdateThumbnailProperties`, `DwmQueryThumbnailSourceSize`, `DwmUnregisterThumbnail` |
| F7 | PowerToys Crop and Lock thumbnail mode implements exactly the proposed pattern: a plain registered Win32 class (`CropAndLock.ThumbnailCropAndLockWindow`), `DwmRegisterThumbnail`, then `DwmUpdateThumbnailProperties` with `DWM_TNP_RECTSOURCE | DWM_TNP_RECTDESTINATION | DWM_TNP_VISIBLE | DWM_TNP_OPACITY` and `fSourceClientAreaOnly = false`. | [ThumbnailCropAndLockWindow.cpp (PowerToys main)](https://github.com/microsoft/PowerToys/blob/main/src/modules/CropAndLock/CropAndLock/ThumbnailCropAndLockWindow.cpp) |
| F8 | Crop and Lock converts its screen-space crop rectangle into the source-window space defined by `DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS)` before assigning `rcSource` (with `fSourceClientAreaOnly = false`). This is the strongest available evidence for the `rcSource` coordinate space, but it is source-code evidence, not documentation. | Same file, `ThumbnailCropAndLockWindow::CropAndLock` |
| F9 | Microsoft's Crop and Lock documentation states the original application "can't be controlled through the thumbnail" — thumbnails do not forward input. Acceptance criterion 11 is satisfied by construction. | [PowerToys Crop And Lock (Microsoft Learn)](https://learn.microsoft.com/en-us/windows/powertoys/crop-and-lock) |
| F10 | UI Automation `BoundingRectangle` is documented as **physical screen coordinates**, and the property is `NULL`/`[0,0,0,0]` when the item is not currently displaying UI. | [UIA_BoundingRectanglePropertyId (Microsoft Learn)](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-automation-element-propids) |
| F11 | Thumbnail registrations are per-process and must be unregistered by the registering process (`DwmUnregisterThumbnail`). | F1 page, Remarks |
| F12 | The Teams taskbar badge is not an unread-message total (already established in ADR 0004). A pixel mirror displays whatever the badge means, which is truthful by construction — it makes no semantic claim. | `docs/decisions/0004-bounded-teams-accessibility-count-experiment.md` |

## 3. Unverified hypotheses

These must be tested empirically; none can be confirmed from documentation.

- **H1 (load-bearing): the Windows 11 taskbar's rendered content appears in a DWM thumbnail of `Shell_TrayWnd`.** The Windows 11 taskbar renders through a XAML/Windows.UI.Composition visual tree hosted in child content-bridge windows inside `Shell_TrayWnd`. Whether DWM's thumbnail of the top-level HWND includes that composition content — or shows black/blank because the content is not in the classic redirection surface — is undocumented in either direction. `E_INVALIDARG` will *not* be returned (F1 is satisfied), so **success of the API call proves nothing; only visible live pixels prove H1.**
- **H2: the numeric badge specifically is included and updates live** in the thumbnail, rather than being rendered in a way DWM's thumbnail path misses or updates lazily.
- **H3: `rcSource` is interpreted relative to `DWMWA_EXTENDED_FRAME_BOUNDS` window space when `fSourceClientAreaOnly = false`** (F8 is strong evidence but from third-party-visible source code, not a documented contract), and behaves consistently for a borderless shell window where window rect, extended frame bounds, and client area likely coincide.
- **H4: `DWMWA_EXTENDED_FRAME_BOUNDS` and UIA physical screen coordinates align without correction when the calling process is Per-Monitor-V2 DPI aware.** Both are physical-pixel-oriented, but mixed DPI-awareness coordinate virtualization is a classic source of off-by-scale bugs; the spike must run PMv2-aware and verify alignment on at least one non-100% monitor.
- **H5: the current Windows 11 build's taskbar UIA tree exposes the Teams task-list button as a distinct element with a stable discovery rule** (AutomationId/AUMID-based, not name-substring or index) and a usable BoundingRectangle. Prior probes (ADR 0004) read taskbar properties successfully, so confidence is moderate, but the discovery *rule* is unproven.
- **H6: auto-hidden taskbar behavior.** When the taskbar slides offscreen, the thumbnail may keep showing live content, freeze, or show the hidden state. Unknown.
- **H7: taskbar HWND recreation (Explorer restart, `TaskbarCreated`) and monitor/DPI topology changes invalidate the thumbnail in a detectable way** rather than leaving a silently frozen image.
- **H8: no display-affinity or shell-protection flag causes black output for the taskbar.** Criterion 4 already treats black output as hard failure; that is the correct handling.

## 4. Adopt

- The overall hypothesis shape: visual-only fallback, no numeric extraction, semantic `activityStatus` boolean remains authoritative. This is the right division of labor.
- All non-negotiable boundaries, especially: no pixel readback, no OCR, no capture-API fallback, and "a failed DWM hypothesis ends this path." These prevent scope-creep into the previously rejected capture space.
- Criterion 4 (black/blank/frozen/badge-excluded output is hard failure) — this is the correct falsifier for H1/H2.
- Criteria 5–6 (three badge states, at least one live transition while the destination stays open) — minimal and sufficient to prove H2.
- Criterion 10 (DWM owns composition, no bitmap access) — satisfied by construction (F6); keep it as a code-review invariant rather than a runtime test.
- Criterion 11 (no input forwarding) — satisfied by construction (F9); keep as a one-time manual check.
- Criterion 13's no-private-screenshot evidence policy, consistent with existing M0/M2A evidence practice.
- The refusal to hard-code coordinates or button indexes, and "ambiguous discovery reports unavailable."

## 5. Modify

1. **Reconcile criteria 8 and 9 with hide-on-doubt semantics.** As written, criterion 8 (an *explicit manual refresh* rediscovers after reflow) and criterion 9 (never leave a stale/wrong crop) contradict each other: between a reflow and the manual refresh, the crop *is* stale and may show a neighboring button. The Windows 11 centered taskbar reflows on every icon add/remove, so this window is not rare. For the spike, redefine: the mirror is allowed to become invalid, but the failure mode must be **hidden (`fVisible = FALSE`) or torn down, never displayed-but-wrong**. A displayed stale crop showing a neighbor is a privacy failure; a hidden mirror is a nonfatal degraded state. Event-driven re-validation is production work and stays out of the spike, but the spike must *demonstrate* hide-on-doubt once.
2. **Destination window: use a tiny dedicated native Win32 top-level window, not the Tauri window.** The thumbnail is composed by DWM relative to the destination window's own content; a Tauri window's client area is covered by a WebView2 child with its own composition visuals, making z-order between thumbnail and web content an additional undocumented variable. Crop and Lock uses a bare registered class (F7). The spike should do the same, created from Rust via the `windows` crate — or as a standalone scratch binary that never touches the Tauri app at all. Do not spend spike budget proving Tauri-window compatibility; that question only matters if the product decision (see §9) is ever taken.
3. **Restrict scope to the primary taskbar (`Shell_TrayWnd`).** `Shell_SecondaryTrayWnd` multiplies discovery ambiguity (Teams button may appear on several monitors) for zero feasibility information. Record its existence as out of scope.
4. **Downgrade criterion 7 (one-second latency) from gate to observation.** DWM thumbnails are live composition, not a polled copy; if H1/H2 hold, latency is effectively frame-level. Record observed latency; do not build measurement machinery for it.
5. **Downgrade criterion 12 (CPU/memory) from gate to recorded measurement plus a code-review invariant.** The correct spike-level guarantee is structural: *the code contains no frame-driven loop at all* (the only timerless work is discovery, registration, and manual refresh). One Task-Manager-level observation over the stated windows is sufficient evidence; do not build instrumentation.
6. **Make the DPI posture explicit in the spike design:** the spike process must set Per-Monitor-V2 DPI awareness (manifest or `SetProcessDpiAwarenessContext`) before creating windows, so UIA physical coordinates (F10), `DWMWA_EXTENDED_FRAME_BOUNDS`, and its own window rects share one physical coordinate space. Verify once on a non-100% scaled monitor (H4).
7. **Specify the coordinate conversion concretely** (answering question C): UIA BoundingRectangle of the Teams button (physical screen px) → subtract the origin of `DwmGetWindowAttribute(Shell_TrayWnd, DWMWA_EXTENDED_FRAME_BOUNDS)` → assign to `rcSource` with `fSourceClientAreaOnly = false`, mirroring Crop and Lock (F8). Set `rcDestination` to the same physical size to avoid scaling blur. Treat this as H3 to confirm, not as settled fact.
8. **Add a zero-code Phase 0** (see §7): attempt the mirror with PowerToys Crop and Lock itself before writing any code. A success conclusively proves H1/H2 for this machine; a failure proves nothing (Crop and Lock requires a croppable foreground window and the taskbar may not qualify for tooling reasons), in which case proceed to the scratch program.

## 6. Reject

- **Any Tauri/React/IPC integration during the spike.** The question is purely native. A scratch binary answers it with fewer variables and zero risk of a temporary diagnostic leaking into the product tree (the M0 Teams diagnostic already had to be removed once).
- **Secondary-taskbar support, multi-monitor Teams-button disambiguation beyond "pick primary, else unavailable."**
- **Event subscriptions (UIA property/structure-change, `TaskbarCreated` listener, WinEvents) during the spike.** Manual refresh plus hide-on-doubt is enough to answer feasibility; event lifecycle is productization.
- **Any generalized "mirror provider" abstraction, settings, or persistence.** Already excluded by the proposal; affirmed.
- **Building latency or resource instrumentation** (per modifications 4–5).
- **Treating `DwmRegisterThumbnail` returning `S_OK` as evidence of anything.** Only rendered pixels count. Success/failure of this path must be judged at criterion 4, not at the HRESULT.

## 7. Smallest proposed spike

All phases are scratch-level work; nothing merges into the product model. Each phase ends at a stop gate; a failed gate ends the path per the stated boundary.

- **Phase 0 — zero-code probe (≤30 minutes).** With Teams showing a badge, focus the taskbar (Win+T) and attempt PowerToys Crop and Lock thumbnail mode on it; alternatively any existing DWM-thumbnail demo tool pointed at `Shell_TrayWnd`.
  - *Gate:* If live taskbar pixels including the badge appear → H1/H2 confirmed on this machine; skip Phase 1's uncropped step. If it fails → inconclusive (tooling may refuse the taskbar); continue.
- **Phase 1 — uncropped mirror (scratch Rust binary, ~50–100 lines).** PMv2-aware process; bare Win32 window; `FindWindowW("Shell_TrayWnd")`; `DwmRegisterThumbnail`; `fVisible = true`, no `rcSource`. Record HRESULTs, Windows build, taskbar class.
  - *Gate (go/no-go for the whole path):* live, updating taskbar pixels including the Teams icon and badge are visible. Black/blank/frozen/badge-missing output → **stop permanently**, record evidence, close the path.
- **Phase 2 — discovery and crop.** UIA: walk the primary taskbar's task-list children, select the Teams button by a stable identity rule (AutomationId/AUMID; if ambiguous or absent → report unavailable and show nothing). Convert BoundingRectangle per §5.7; apply `rcSource`.
  - *Gate:* the crop shows the complete Teams icon/badge and nothing else, across badge-absent and two visibly distinct badge states, with at least one live transition while the destination stays open. Neighbor content in the crop or badge clipped → stop and record.
- **Phase 3 — perturbation and hide-on-doubt.** Force one taskbar reflow (pin or unpin an unrelated app); confirm the mirror is stale; trigger explicit refresh → correct recrop. Quit Teams → mirror hides (no stale image). Optionally: toggle auto-hide, restart Explorer; record behavior without gating on it.
  - *Gate:* at no point is a wrong crop *displayed*; every invalid state resolves to hidden/unavailable. Then **stop** — write evidence to `docs/milestones/evidence/`, and draft an ADR on whether a pixel mirror may ever become product (see §9). No further code.

## 8. Revised pass/fail criteria

**Hard gates (any failure ends the path):**

1. Phase 1: a DWM thumbnail of the primary taskbar HWND renders live, updating pixels that include the Teams icon and its badge. Black, blank, frozen, or badge-excluded output fails.
2. Phase 2: Teams button discovered via UIA using a stable identity rule (no name-substring guessing, no indexes); ambiguity or absence yields "unavailable", never a guess.
3. Phase 2: crop contains the complete Teams icon/badge and zero neighboring-button pixels, verified visually in three states: no badge, and two visibly distinct nonzero badge states.
4. Phase 2: at least one badge transition is reflected in the open mirror without re-registering the thumbnail.
5. Phase 3: after one induced taskbar reflow, the explicit refresh rediscovers and correctly recrops Teams.
6. Phase 3: missing Teams, hidden/invalid taskbar HWND, and ambiguous candidates result in a hidden mirror or "unavailable" — a wrong or stale crop is never *displayed* (hide-on-doubt).

**Code-review invariants (verified by inspection, not runtime):**

7. No frame-driven loop, timer polling, or capture API anywhere in the spike code; the only DWM calls are register/update/query-size/unregister.
8. No pixel readback path exists; no bitmap ever enters application memory.
9. Clicking the destination window never activates Teams or the taskbar (one manual check; expected by construction per F9).

**Recorded observations (evidence, not gates):**

10. Windows build, Teams version, taskbar HWND/class, monitor layout/DPI, all HRESULTs, crop geometry in both coordinate spaces, subjective latency, and one idle CPU/memory observation (expected ~0% / flat). No screenshots containing neighboring taskbar content or private information are committed.
11. Behavior under auto-hide, Explorer restart, and DPI change — recorded if exercised, not required for the verdict.

## 9. Unresolved questions

1. **Product boundary (question H) — the only question that materially affects what happens *after* a successful spike.** A DWM thumbnail does not control, embed, reparent, or read the source (F4, F6, F9), so the *spike* stays inside the observer boundary. But shipping it would introduce a new signal class — re-displayed source-rendered pixels that Attention Hub cannot interpret — into an architecture whose contract is *normalized semantic signals*. Two concrete tensions need an explicit ADR before any product use: (a) the panel cannot make quiet-when-nothing-needs-attention decisions from pixels it is forbidden to read — the only honest gating signal is the existing `activityStatus` boolean (e.g., show the mirror only while `activityStatus = true`); (b) vision.md prefers official APIs and says "observer, not a container" — a live mirror is closer to a viewport than a container, but that reading should be ratified in a decision record, not assumed. Recommendation: the spike is authorized as feasibility evidence only; product retention requires a new ADR.
2. **Is the mirror worth having even if it works?** It shows the user a badge they can already see on the taskbar; the value is proximity/prominence on a large multi-monitor setup. That is a product judgment, not a technical one, and should be answered in the same ADR — ideally after briefly living with the spike output.
3. **rcSource coordinate space (H3)** is inferred from PowerToys source rather than documentation. If Phase 2 crops land consistently offset, the fallback interpretation (client-area-relative) should be tested before declaring failure — this is the one place where a "wrong pixels" result may be a coordinate bug rather than a platform refusal.
