# Feasibility audit: Teams taskbar-badge DWM mirror spike (kimi)

- Date: 2026-08-10
- Scope: discussion-only audit of the proposed visual-only Teams taskbar-badge
  mirror spike. No code, no file changes to the product.
- Checkpoint audited: branch `agent/m0-notification-feasibility`, commit
  `d942187`, draft PR #2.

## 1. Verdict

**Approve with changes** — as a time-boxed, native-only feasibility spike.

The hypothesis is technically coherent and sits on a documented, supported API
family (`DwmRegisterThumbnail`), with a proven Microsoft-owned precedent
(PowerToys Crop and Lock thumbnail mode) for exactly the crop-and-display
mechanics proposed. It is one of the very few capture-adjacent techniques that
can honestly claim "no pixel access by the application," because DWM composes
directly into a destination window the process owns but never reads.

However, two load-bearing assumptions are **not documented anywhere** and are
genuinely likely to fail:

1. that `Shell_TrayWnd` (Windows 11, XAML-rendered taskbar) yields a live,
   content-bearing DWM thumbnail at all, and
2. that the numeric badge overlay is part of the composited surface the
   thumbnail reproduces.

Both are answerable in a tiny experiment (Phase 0 below) without touching
Tauri, UIA, or coordinate math. That experiment must run first, and its failure
must end the path, as the proposal already states.

The approval is also conditional on scoping corrections: one step of the
proposal (step 4, "taskbar-client source coordinates") encodes a coordinate
assumption that contradicts the only authoritative implementation of this
technique (PowerToys), and several acceptance criteria ask the spike to
guarantee things the design provably cannot guarantee (stale-crop safety) or
belong to productization rather than feasibility gating.

---

## 2. Verified facts

Each fact below is confirmed against a primary source. Anything not listed
here is an empirical hypothesis (section 3).

**F1. Both thumbnail source and destination must be top-level windows;
anything else returns `E_INVALIDARG`.**
`Shell_TrayWnd` and `Shell_SecondaryTrayWnd` are top-level windows, so they
pass the API's documented eligibility gate. Passing the gate says nothing about
what the thumbnail will contain.
<https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmregisterthumbnail>

**F2. The destination window must be owned by the calling process (or be the
desktop window).**
Documented explicitly "to prevent applications from affecting the content of
other applications." This is a real, documented security boundary that works
in Attention Hub's favor: the relationship cannot be used to paint into or
modify Explorer's window.
<https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmregisterthumbnail>

**F3. A DWM thumbnail is a live, dynamic, DWM-composited connection, not a
bitmap the application receives.**
"DWM thumbnails ... are ... dynamic, constant connections between a thumbnail
source window and a location on a destination window that receives the live
thumbnail rendering" and "Thumbnails are rendered directly to the destination
window in 2-D." There is no API in this family that hands pixels to the
destination process. Composition is performed by DWM; updates are driven by
the compositor, not by a timer in the calling process. This directly supports
acceptance criteria 10 and 12 *by construction*, provided the spike introduces
no polling of its own.
<https://learn.microsoft.com/en-us/windows/win32/dwm/thumbnail-ovw>

**F4. `rcSource` selects "the region of the source window to use as the
thumbnail"; `rcDestination` is "the area in the destination window where the
thumbnail will be rendered."**
<https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ns-dwmapi-dwm_thumbnail_properties>

**F5. The documented semantics of `rcSource`'s coordinate space are thin; the
authoritative practical recipe is PowerToys Crop and Lock, and it is not
"taskbar-client coordinates."**
In `ThumbnailCropAndLockWindow::CropAndLock`, PowerToys converts the screen-space
crop rectangle into the *source window's space as reported by DWM* by:

1. reading `DwmGetWindowAttribute(source, DWMWA_EXTENDED_FRAME_BOUNDS, ...)`;
2. reading the client rect in screen space;
3. offsetting the crop by `(client.left - frame.left, client.top - frame.top)`;
4. setting `fSourceClientAreaOnly = false` with `DWM_TNP_RECTSOURCE |
   DWM_TNP_RECTDESTINATION | DWM_TNP_VISIBLE | DWM_TNP_OPACITY`.

So the effective origin is the **extended frame bounds** origin, not the client
origin. For a borderless taskbar these origins may coincide, but the proposal's
step 4 ("taskbar-client source coordinates") encodes the wrong assumption and
will produce off-by-frame-offset crops on windows where they differ. Adopt the
PowerToys conversion verbatim.
`src/modules/CropAndLock/CropAndLock/ThumbnailCropAndLockWindow.cpp`,
function `CropAndLock`:
<https://github.com/microsoft/PowerToys/blob/main/src/modules/CropAndLock/CropAndLock/ThumbnailCropAndLockWindow.cpp>

**F6. Crop and Lock's thumbnail mode is non-interactive by design and cannot
control the source window.**
Microsoft's own PR description: "Thumbnail - Creates a thumbnail of the
selected area and leaves the original window untouched. It's not possible to
control the original window through the thumbnail." This supports acceptance
criterion 11 (the destination cannot invoke Teams) at the DWM level; the spike
only needs to not add input forwarding of its own.
<https://github.com/microsoft/PowerToys/pull/27832>

**F7. Crop and Lock uses a dedicated, plain native top-level window (own
`WNDCLASSEX`, `WS_OVERLAPPEDWINDOW | WS_CLIPCHILDREN`) as the thumbnail
destination — not an embedded or child surface.**
Consistent with F1 (child destinations get `E_INVALIDARG`; independent reports
confirm thumbnails vanish when the destination becomes a child).
`src/modules/CropAndLock/CropAndLock/ThumbnailCropAndLockWindow.cpp`,
`RegisterWindowClass` / constructor:
<https://github.com/microsoft/PowerToys/blob/main/src/modules/CropAndLock/CropAndLock/ThumbnailCropAndLockWindow.cpp>

**F8. UI Automation `BoundingRectangle` returns physical screen coordinates,
and a UIA client that is not DPI-aware gets wrong coordinates at non-96 DPI.**
"The UI Automation API does not use logical coordinates... `CurrentBoundingRectangle`
[returns physical coordinates]"; the documented remedy is making the client
DPI-aware at startup. Therefore the spike must run as Per-Monitor-V2 (or at
minimum `SetProcessDPIAware`) and treat UIA bounds as physical pixels.
<https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-screenscaling>

**F9. `DwmQueryThumbnailSourceSize` exists and returns the source size DWM
will use for the thumbnail.**
This is a cheap, documented sanity check for the coordinate conversion: the
reported source size should match the taskbar window's expected extent; a
mismatch is an early signal that the HWND association or DPI handling is wrong.
<https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmquerythumbnailsourcesize>

**F10. Microsoft's own DWM sample registers `Progman` — another shell-owned,
non-application top-level window — as a thumbnail source.**
This is evidence that shell-owned top-level windows are an intended source
category, but it is *not* evidence about `Shell_TrayWnd` specifically.
<https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmregisterthumbnail>

**F11. The Teams badge is not an unread-message count (already established in
this repository).**
ADR 0004 records Microsoft's documentation that the badge combines unread
unmuted chats, @mention/tag channels, and followed threads. The mirror
therefore duplicates a *badge*, whose semantics the product already decided
not to claim as a count. This bounds the product value of the whole path.
`docs/decisions/0004-bounded-teams-accessibility-count-experiment.md`

---

## 3. Unverified hypotheses

These must be tested empirically. None have documented answers, and I found no
credible source (official or otherwise) confirming taskbar mirroring behavior.
I am explicitly **not** claiming documented support for any of the following.

**H-A. `Shell_TrayWnd` yields a content-bearing thumbnail at all.**
F1 guarantees only that the call won't be rejected for window-type reasons.
The Windows 11 taskbar is not a normal GDI window; whether DWM's thumbnail of
it contains the rendered taskbar, a stale surface, transparency, or nothing is
undocumented. A hard `S_OK` from `DwmRegisterThumbnail` plus black output is a
plausible outcome and is a hard failure per criterion 4.

**H-B. The numeric badge overlay is inside the composited surface the thumbnail
reproduces.**
The Windows 11 taskbar renders icons and badge overlays through XAML /
`Windows.UI.Composition`-adjacent surfaces layered over `Shell_TrayWnd`
children. DWM thumbnails historically reproduce a window's composed content,
but whether badge overlays rendered via compositor visual layers appear in the
*thumbnail* is undocumented and is the single most likely technical failure
mode (criterion 4's "badge-excluded output").

**H-C. Behavior when the taskbar is auto-hidden, slid off-screen, or when
Explorer recreates the taskbar.**
Undocumented whether an off-screen-positioned or freshly recreated source
keeps producing live frames. Frozen output is a hard failure.

**H-D. `rcSource` rounding and DPI behavior against the taskbar across mixed-DPI
monitors (`Shell_TrayWnd` vs `Shell_SecondaryTrayWnd`).**
F8 gives the general rule (physical pixels, DPI-aware client), but the exact
rounding of the crop against the frame-bounds origin on each taskbar instance
is empirical.

**H-E. Update latency and liveness of the badge transition in the thumbnail.**
DWM thumbnails are live connections (F3), so sub-second updates are expected,
but the ≤1s requirement (criterion 7) is a measurement, not a documented
guarantee — and *liveness* must be distinguished from *a static frame that
happened to be correct* (see revised criterion R5 below).

**H-F. Idle resource cost.**
Expected to be near zero in the destination process (composition happens in
DWM), but criterion 12 is a measurement task, not a documented property.

---

## 4. Adopt

Baseline items I agree with as stated:

- **Discovery via UIA, no hard-coded coordinates or indexes** (criterion 1,
  boundary). Necessary and consistent with F8's DPI requirement.
- **Ambiguity reports unavailable instead of guessing** (boundary). Correct,
  and matches the repository's evidence-first posture.
- **Destination is an Attention Hub-owned top-level window** (criterion 2).
  Required by F1/F2, not a style choice.
- **No OCR, no readback, no BitBlt/PrintWindow/DD/WGC/screenshot fallback, no
  injection, no input to Teams** (boundaries). The DWM path is uniquely
  compatible with these because of F3; any fallback would break F3's
  no-pixel-access property and is correctly excluded.
- **Black/blank/frozen/badge-excluded output is a hard failure** (criterion 4).
  Exactly right, and it is what makes the cheap Phase 0 decisive.
- **Three badge states with one live transition** (criteria 5–6). Minimum
  viable evidence that this is a live signal and not a lucky static frame.
- **Failure ends the path** (boundary). Especially important here: the two
  plausible failure modes (H-A, H-B) have no compliant workaround, so the
  temptation to reach for a capture API on failure will be real. Pre-commit to
  stopping.
- **Semantic `activityStatus` boolean remains authoritative** (proposal
  statement). The mirror must never be promoted to signal semantics (F11).
- **Evidence records environment/HRESULTs/geometry/latency/resources without
  committing private screenshots** (criterion 13). Consistent with prior M0
  evidence handling.

---

## 5. Modify

Exact changes to scope or acceptance criteria:

**M1. Fix proposal step 4's coordinate assumption (from F5).**
Replace "convert the Teams button rectangle into taskbar-client source
coordinates" with: *convert the UIA screen-space `BoundingRectangle` into the
taskbar window's space using the PowerToys recipe — offset by
`(clientScreenOrigin − extendedFrameBoundsOrigin)`, with
`fSourceClientAreaOnly = false` — and validate with
`DwmQueryThumbnailSourceSize` (F9).* "Client coordinates" is the wrong mental
model and will silently mis-crop whenever frame and client origins diverge.

**M2. Criterion 8 ("stale crop never reveals a neighbor") is not
guaranteeable — restate it as a bounded-staleness requirement.**
`rcSource` is a fixed rectangle in source-window space. On centered-icon
reflow, DPI change, pin/unpin, or taskbar recreation, the crop *will* point at
whatever now occupies those pixels until re-anchoring happens. No design on
this API can guarantee otherwise. The honest, achievable requirement is:

- subscribe to UIA structure-changed / `EVENT_OBJECT_LOCATIONCHANGE` /
  `NameChange`-adjacent events on the taskbar button set (UIA events are
  documented infrastructure the project already uses);
- on any such event, **hide the mirror first** (`fVisible = FALSE`), then
  re-resolve and re-anchor, showing again only after the Teams button is
  re-identified unambiguously;
- on taskbar HWND invalidation (Explorer restart), unregister and report
  unavailable.

Residual risk (stale pixels visible between the reflow and event delivery)
must be **documented as a known limitation**, not claimed away. If the spike
cannot hide-and-reanchor within ~1s of a reflow, that is a product blocker to
record, not necessarily a feasibility failure.

**M3. Split the acceptance criteria into feasibility gates vs deferred
productization (see section 8).** Multi-monitor permutations, auto-hide,
pin/unpin, Teams restart, and DPI-change recovery are *detection* requirements
for the spike ("detect and report unavailable"), not *recovery* requirements.
Full recovery behavior is productization and should stay deferred, exactly as
the milestone defers production UI.

**M4. Criterion 3 needs an explicit "no neighbor" verification method that
doesn't require committing screenshots.** Agree on redacted structural
evidence (crop geometry vs. adjacent-button bounds from UIA, recorded as
numbers) plus a human eyeball check, mirroring the privacy handling used in
`docs/milestones/evidence/m0/2026-08-10-teams-badge-probe.md`.

**M5. Add a liveness-vs-static-frame discrimination step.** A thumbnail can be
a correct-looking *stale* frame. Criterion 7 must be tested as: with the
destination open continuously, cause a badge transition and measure
time-to-match; a thumbnail that only updates on re-registration fails even if
every static comparison passed.

**M6. Name the signal truthfully in any retained output (from F11).** If the
mirror is ever shown outside the spike, it must be labeled as a *visual mirror
of the Teams taskbar badge area* — not an unread count, not an unread-message
indicator. This is a labeling requirement, not new scope.

**M7. Explicitly enumerate both taskbar classes in discovery.** Primary
(`Shell_TrayWnd`) and per-monitor secondary (`Shell_SecondaryTrayWnd`)
instances; the Teams button may exist on more than one. Pick one
unambiguously or report unavailable. This is already implied by criterion 1
but should be stated, because multi-monitor setups are the project's stated
motivation.

---

## 6. Reject

Unnecessary, unsafe, or overbuilt elements:

- **R1. Any guarantee-seeking around stale crops (baseline criterion 8's
  implicit "never").** Replace with M2's bounded-staleness design. Chasing an
  absolute guarantee will produce either over-engineering (per-frame bounds
  re-validation → polling → violating criterion 12's spirit) or a false claim
  in evidence.
- **R2. Tauri/WebView as the thumbnail destination (question F).** Reject for
  the spike. F1 requires a *top-level* destination; a Tauri window's visible
  surface is a WebView2 child that would sit in front of any thumbnail DWM
  paints into the outer HWND. F7 shows the proven pattern: a tiny dedicated
  native top-level window owned by the process. The smallest experiment is a
  standalone native probe binary; Tauri integration is productization and
  stays out.
- **R3. A "taskbar HWND discovery" subsystem.** The spike needs
  `FindWindow`-class lookup of the two documented shell classes plus
  UIA-based button matching. Do not build enumeration/association machinery
  beyond what criterion 1 requires; the "ambiguous → unavailable" rule makes
  the simple version sufficient.
- **R4. Any automatic refresh/retry loop.** Criterion 12 (no frame polling)
  should extend to discovery: re-anchor on UIA events or explicit user
  refresh only. A timer that re-derives the crop "just in case" reintroduces
  exactly the polling the criteria forbid.
- **R5. Production-shaped error surfaces, settings, or positioning logic.**
  Out of scope per the proposal itself; flagged because the mirror's eventual
  placement question ("where does a mirrored badge live in the panel?") will
  try to sneak in. Defer entirely.
- **R6. Generalization to other apps' taskbar buttons.** Even as a
  "the technique obviously generalizes" note in evidence — the proposal
  forbids it and the privacy calculus differs per source.

---

## 7. Smallest proposed spike

Ordered phases, each with a hard stop gate. Total shape: one throwaway native
probe (C++ or Rust with `windows` crate, matching the repo's existing native
boundary), no Tauri, no production architecture. Estimated code volume is in
the low hundreds of lines; PowerToys' `ThumbnailCropAndLockWindow.cpp` (≈180
lines) is the upper bound of complexity for Phases 0–1.

**Phase 0 — Does the taskbar thumbnail exist at all? (Questions A + B)**
1. Native probe: `FindWindow("Shell_TrayWnd")`; create a small black native
   top-level window (F7 pattern); `DwmRegisterThumbnail(dest, tray)`;
   `DwmUpdateThumbnailProperties` with full-source (no `rcSource`), visible,
   opaque.
2. Human inspection: does the destination show the live taskbar, including a
   known badge (generate one Teams notification first)?
3. Also call `DwmQueryThumbnailSourceSize` and record it.

*Stop gate:* registration failure, or blank/black/frozen output, or badge
absent from an otherwise-correct taskbar image → **stop; path ends; record
H-A/H-B negative evidence.** This phase alone answers the two highest-risk
hypotheses and requires no UIA and no crop math. If it fails, the total cost
of the spike is one small probe.

**Phase 1 — Crop math (Question C)**
1. UIA: locate the Teams button on the taskbar, read `BoundingRectangle`
   (process is Per-Monitor-V2 aware per F8). Ambiguous or absent → report
   unavailable (criterion 9), do not guess.
2. Convert via the PowerToys recipe (M1): `DWMWA_EXTENDED_FRAME_BOUNDS` +
   client-origin offset → `rcSource`; destination sized to the crop.
3. Sanity-check with `DwmQueryThumbnailSourceSize` (F9).
4. Verify complete icon+badge, no neighbors (M4 method: record crop rect and
   adjacent buttons' UIA bounds as numbers; eyeball privately).

*Stop gate:* crop cannot exclude neighbors at 100% DPI on the primary
taskbar, or conversion requires undocumented fudge factors → stop; record
H-D negative evidence. (Multi-monitor/DPI permutations are *detection-only*
per M3.)

**Phase 2 — Signal quality (Questions B-liveness, D-bounded)**
1. Compare three states: no badge, two distinct nonzero badges (criterion 5).
2. Keep destination open; cause one transition; measure time-to-match
   (M5; criterion 7).
3. Cause one reflow (pin/unpin an app); verify hide-on-UIA-event then
   re-anchor via explicit refresh (M2; criterion 8 restated).
4. Error paths: Teams closed, Explorer restarted (taskbar HWND invalidated) —
   must be nonfatal, must unregister/hide, never show stale/wrong crop
   (criterion 9).
5. Resources: idle CPU <1% over 60s, memory over 5 min (criterion 12);
   confirm zero polling exists in the probe by code inspection.

*Stop gate:* transition doesn't propagate within ~1s without re-registration;
hide-then-reanchor can't complete within ~1s; or any error path leaves stale
imagery → stop or record as product blocker per M2.

**Phase 3 — Decision memo only.**
Record evidence (criterion 13 list), the M2 residual-risk limitation, and a
retain/drop recommendation addressing question H. No integration code.

---

## 8. Revised pass/fail criteria

**Feasibility gates (must all pass; failure ends the path):**

- G1. `DwmRegisterThumbnail` returns `S_OK` with `Shell_TrayWnd` as source and
  a probe-owned top-level destination. (Documented gate; F1.)
- G2. The thumbnail displays live, recognizable taskbar content — not black,
  blank, or frozen.
- G3. The Teams badge overlay is present in the thumbnail whenever visible on
  the real taskbar. Absence = fail.
- G4. With UIA-derived bounds converted per M1, `rcSource` reproduces the
  complete Teams button including badge, with zero pixels of neighboring
  buttons, verified numerically (crop vs. adjacent UIA bounds) and visually.
- G5. Three badge states (0, and two distinct nonzero) are each correctly
  mirrored.
- G6. With the destination held open, one badge transition appears in the
  mirror within 1 second, with no unregister/re-register cycle (M5).
- G7. Missing Teams, taskbar HWND invalidation, and ambiguous UIA candidates
  each produce an explicit "unavailable" outcome with the thumbnail hidden or
  unregistered — never stale or wrong content.
- G8. Zero pixel access: no bitmap, DC, or capture API is touched by the probe
  (verified by code inspection; this is what F3 buys).
- G9. No input coupling: interacting with the destination does not activate,
  focus, or invoke Teams or the taskbar (F6).
- G10. No polling loops of any kind in the probe; idle CPU <1% over 60s;
  no monotonic memory growth over 5 minutes.
- G11. Evidence note records: Windows build, Teams version, taskbar
  HWND/class, monitor/DPI/layout, all HRESULTs, crop geometry, transition
  latency, resource measurements, and `DwmQueryThumbnailSourceSize` result —
  no committed screenshots.

**Bounded-staleness requirement (restated criterion 8, per M2):**

- G12. After a taskbar reflow, the mirror hides within ~1s of the triggering
  UIA event and re-appears only after unambiguous re-anchoring (automatic via
  event, or via explicit user refresh — pick one for the spike and record
  which). Residual pre-event staleness is documented as a known limitation.

**Explicitly deferred (productization, not feasibility):**

- D1. Multi-monitor / `Shell_SecondaryTrayWnd` recovery, DPI-change recovery,
  auto-hide behavior, Teams-restart recovery: spike must *detect and report
  unavailable* (part of G7), not recover.
- D2. Tauri integration, panel placement, lifecycle management, settings.
- D3. Truthful labeling/UX for the mirror if retained (M6 is the requirement;
  the UI is deferred).

**Immediate stop conditions:**

- S1. G1–G3 fail in Phase 0 (no compliant workaround exists; capture APIs are
  out of bounds).
- S2. Crop cannot exclude neighbors without undocumented heuristics.
- S3. Any temptation-driven scope addition: OCR, readback, capture fallback,
  injection, input synthesis. Any of these voids the approval.

---

## 9. Unresolved questions

Only those that materially affect approval:

- **Q1 (blocks H, the boundary question): is a live visual mirror of shell UI
  "observation" or "embedding"?** My read: technically it stays within the
  observer boundary — F2/F3/F6 mean Attention Hub cannot read, modify, or
  control the source; the mechanism is compositor-level display, identical in
  kind to PowerToys' user-facing thumbnail mode. But it *presents* another
  application's surface inside Attention Hub chrome, which is closer to
  "hosting" than anything in the repo so far. Recommendation: the spike may
  proceed under the existing observer boundary; **retaining** the mirror in
  the product requires an explicit architecture decision record stating that
  DWM-composited visual mirroring (read-only, input-free, pixel-free) is an
  accepted presentation technique. Do not let a successful spike silently
  settle that question.
- **Q2: does the mirror have product value proportional to its risk?** F11:
  the badge is not an unread count, and the authoritative semantic signal
  already exists. The mirror's value is purely "shows the same glyph the
  taskbar shows." If G3 passes, the decision memo must argue value honestly;
  a passing spike with weak product value should still be dropped.
- **Q3: how much of Windows 11 taskbar rendering is version-stable?**
  H-A/H-B outcomes may vary across Windows builds (XAML taskbar revisions).
  G11's build recording mitigates, but a positive result should be re-verified
  on at least one additional Windows build before any retain decision. This
  affects approval only of retention, not of the spike.

---

## Sources

- Microsoft Learn, `DwmRegisterThumbnail`:
  <https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmregisterthumbnail>
- Microsoft Learn, `DWM_THUMBNAIL_PROPERTIES`:
  <https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ns-dwmapi-dwm_thumbnail_properties>
- Microsoft Learn, `DwmUpdateThumbnailProperties`:
  <https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmupdatethumbnailproperties>
- Microsoft Learn, `DwmQueryThumbnailSourceSize`:
  <https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmquerythumbnailsourcesize>
- Microsoft Learn, DWM Thumbnails overview:
  <https://learn.microsoft.com/en-us/windows/win32/dwm/thumbnail-ovw>
- Microsoft Learn, UI Automation and screen scaling (physical coordinates,
  DPI-awareness requirement):
  <https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-screenscaling>
- PowerToys Crop and Lock, `ThumbnailCropAndLockWindow.cpp` (thumbnail
  destination window class, `DWMWA_EXTENDED_FRAME_BOUNDS` + client-offset
  `rcSource` conversion):
  <https://github.com/microsoft/PowerToys/blob/main/src/modules/CropAndLock/CropAndLock/ThumbnailCropAndLockWindow.cpp>
- PowerToys PR #27832 (thumbnail mode is non-interactive by design):
  <https://github.com/microsoft/PowerToys/pull/27832>
- Repository: `docs/decisions/0004-bounded-teams-accessibility-count-experiment.md`,
  `docs/milestones/evidence/m0/2026-08-10-teams-badge-probe.md`,
  `docs/decisions/0007-observe-m365-calendar-companion-before-own-graph-access.md`,
  `docs/vision.md`, `docs/architecture.md`.
