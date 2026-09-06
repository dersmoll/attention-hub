# M10 community-feedback council review — Claude

- Reviewer: Claude (Opus 5)
- Brief: `codex-community-feedback-brief.md`
- Baseline verified: `v0.5.0-beta.1`, commit `1ea5798`, working tree
  `D:\Work\PetProjects\attention-hub` on `codex/m10-community-feedback`.
- Method: read-only inspection. No application code changed, nothing built,
  installed, launched, or stopped. Every geometry number below was recomputed
  from source constants rather than copied from the brief.
- Prior response read: `review-devin.md`. This review is written as **deltas**:
  agreement is stated once, and the body concentrates on findings neither the
  brief nor Devin recorded, plus two corrections.

---

## 1. Verdict

**Decision-ready with modifications — but not in the order the brief proposes.**

The brief's repo claims all hold. I independently confirmed the six-source
default and five visual mirrors (`src/widget-preferences.ts:29-59`), the 85–100
opacity clamp in both normalization (`:67-71`) and the slider
(`src/App.tsx:536-548`), `olk.exe`-only matching in both places
(`attention_signals/windows_adapter.rs:38`,
`teams_mirror/windows_adapter.rs:407`), badge-blind cross-taskbar ranking
(`teams_mirror/windows_adapter.rs:840-856` feeding first-success selection at
`:781-838`), the shared 48×48 settings-button geometry (`.widget-app-slot,
.widget-later, .widget-more` in `src/App.css`), the primary clock's implicit
system zone (`src/WidgetView.tsx:1035-1049`), Later Inbox reminder ownership,
and all five widths in the footprint table (744 / 888 / 984 / 1112 / 1208 —
recomputed from `src/widget-layout.ts`).

Three things change the shape of the milestone:

1. **A2 Compact is a height change, not a width change.** M10-001 alone
   delivers ~75% of the achievable width reduction with no cross-layer work;
   the already-shipping `widthMode` control delivers another 10%. A2 buys the
   last ~44 px of width plus 12 px of height, and it is the only item in M10A
   that touches the React/CSS ↔ Rust DWM geometry contract, the static Tauri
   window constraints, and the layout test extrema simultaneously. It should be
   its own gated slice, not bundled into low-risk polish. (§3.1, §6A)
2. **B2 and C1 as dimensioned are not implementable.** Both specify 20×20
   controls. That violates WCAG 2.2 SC 2.5.8 (24×24) *and* the brief's own A2
   rule ("do not silently shrink below 40 px pointer targets"), and the clock
   zone has zero vertical slack at Compact to host them. Both have a
   zero-new-geometry alternative already shipping in the codebase. (§3.2, §3.3)
3. **M10-006 has an unanswered cross-layer question**: at 25% opacity roughly
   eight objects in the widget stay fully opaque, including the native DWM
   mirrors (`opacity: 255`). "Expand the range to 25%" is two different
   features depending on the answer, one of them ~20 lines and one of them a
   native change. This must be decided before implementation. (§3.4)

The M10A/M10B split itself is correct, and M10B must stay non-blocking.

---

## 2. Adopt

Endorsed as written, no further comment (all independently verified):

- **M10-001** quiet fresh defaults — `monitoredSources: ["teams","outlook"]`,
  `liveVisualSources: ["teams"]`, six-key `appOrder` retained. Adopt with §3.5.
- **M10-008** gear glyph — adopt, but implement it by reusing an existing
  pattern rather than authoring a new one (§3.3).
- **M10-003** `primaryTimeZone: null | IANA` — adopt, with B2′ (§3.2) and
  Devin's converter-coupling requirement, which I confirm: the converter's
  "local" endpoint reads the same `Intl…resolvedOptions().timeZone`
  (`WidgetView.tsx:1035-1039`), so the override must feed both or a converted
  time will contradict the clock directly above it.
- **M10-007** as a shortcut into Later Inbox only, no second scheduler —
  adopt, with the control relocated (§3.3) and the copy fix (§3.6).
- **M10-009** narrowed to clearer fixed-catalog wording — adopt, and it should
  absorb the two verified copy defects in §3.6.
- **M10B evidence gates**, kept separate for presence/activation vs unread
  semantics, and non-blocking for M10A. Adopt; §5 makes the Teams gate cheaper
  and the Outlook gate slightly larger than stated.
- **Reject arbitrary taskbar enumeration/pinning, A3 drag resize, B3, C2/C3,
  OCR/badge-pixel inference, Graph/MAPI.** Agreed with brief and Devin; no
  new argument to add.

---

## 3. Modify

### 3.1 A2 has three hard prerequisites, one of which is blocking (new)

**(a) The static Tauri window constraints are exactly the layout extrema, and
a test pins them.** `src-tauri/tauri.conf.json` declares
`minWidth: 744, maxWidth: 1208, minHeight: 80, maxHeight: 80, resizable: false`.
Those are not round numbers — 744 is exactly `widgetWidth(0, "compact")` and
1208 is exactly `widgetWidth(6, "auto", true)`, and
`scripts/test-widget-layout.mjs:25,28` asserts both. Compact's floor is
**716 px** (§3.7) and its height is **68 px**. Both fall outside the declared
range, so `widgetWindow.setSize()` (`WidgetView.tsx:765-810`) would be clamped
by the window manager while the WebView lays out for the smaller value:

- width: CSS grid columns are fixed px inside `.widget-shell { width: 100% }`,
  so a 744 px window laying out 716 px of columns leaves ~28 px of transparent
  dead space to the right of the calendar zone;
- height: a 68 px layout inside an 80 px window leaves a 12 px transparent
  strip that still belongs to the always-on-top, `data-tauri-drag-region`
  window — the widget would be draggable and click-blocking 12 px below where
  it visibly ends.

This is blocking and cheap: widen the conf range (or set constraints at
runtime) *and* add an assertion that the conf extrema equal the layout
function's extrema across both densities, so the two can never drift again.

**(b) The mask radius is hardcoded against a 40 px mirror.**
`mask_mirror_window` derives the round-rect from
`size.min * (WIDGET_MIRROR_LOGICAL_RADIUS * 2) / WIDGET_MIRROR_LOGICAL_SIZE`
(`teams_mirror/windows_adapter.rs`, `WIDGET_MIRROR_LOGICAL_SIZE = 40` at
`:380-390`). A 36 px Compact mirror yields an ellipse of 14 instead of the
intended 16, i.e. a 7.2 px corner radius against a CSS
`.widget-app-surface { border-radius: 8px }`. Small, but it is exactly the kind
of drift the alignment gate exists to catch; re-derive it, don't scale it.

**(c) The clock zone has no vertical slack at Compact.** `.widget-clock` is a
two-column grid with `padding: 4px 8px` and `gap: 8px`; each column stacks
`.widget-clock__label` (fixed `height: 17px`) + 1 px gap +
`.widget-clock__time-button` (`min-height: 38px`) = **56 px** inside a
`72 − 2 − 8 = 62 px` inner height. Compact's 60 px zone gives 50 px inner, and
17 + 1 + 32 (a 30 px numeral needs ≈32) = **50 px exactly**. Zero slack, before
adding anything. This is the constraint that kills the 20×20 controls in §3.2
and §3.3, and it means Compact re-tunes the clock's internal paddings, the
converter row (`grid-template-columns: auto 88px minmax(0,1fr) 26px`, gap 6 —
132 px of that is already fixed), and the 38 px button floor. Devin flagged
"more than two constants"; the specific number is 50 px of budget for 50 px of
content.

### 3.2 B2 → **B2′**: reuse the shipping select pattern, drop the 20×20 globe (new)

The brief and Devin both specify "a 20×20 globe/select beside the primary clock
label". Three problems: 20×20 is below WCAG 2.2 SC 2.5.8's 24×24 minimum and
below the brief's own 40 px floor; it cannot sit in a 17 px-tall label row; and
at Compact there is no room for it (§3.1c).

The codebase already contains the exact affordance being described. The
**secondary** clock row wraps a native `<select>` in
`.widget-clock__label--select`, filling the full column (≈135 × 17 px) with a
chevron SVG (`WidgetView.tsx:1229-1251`; `.widget-clock select` +
`.widget-clock__label--select > svg` in `src/App.css`). The **primary** row is a
static `<span className="widget-clock__label">Local</span>`
(`WidgetView.tsx:1215`).

**B2′: replace that span with the same construct**, options = `System local
(<resolved zone>)` + the existing curated `TIME_ZONE_OPTIONS` (+ last chosen).
This is strictly better than a new button on every axis the brief cares about:

- zero new geometry, zero new hit target, no Compact re-layout, no width change;
- visually symmetric with the row directly below it;
- the requirement "the visible label changes from `Local` when overridden" is
  satisfied for free, because the select's rendered value *is* the label;
- the "native select can open beyond the fixed-height WebView without a clipped
  HTML popover" property the brief wanted is not a hypothesis — it is already
  shipping in production on the secondary row;
- the effective hit area is ~135 × 17 instead of 20 × 20 (still short of 24 px
  in one dimension, but it inherits an existing shipped target rather than
  adding a new sub-minimum one, and the full validated control remains in
  Advanced at ≥280 px).

Advanced keeps the authoritative control with IANA validation, a System reset,
and the scope explanation. Reject the standalone globe button.

### 3.3 M10-008 and C1: both should reuse `.widget-controls`, not new CSS (new)

**The gear.** `.widget-controls button` (`src/App.css:1637`) is already exactly
what M10-008 asks for: `width/height: 40px`, `min-width/min-height: 40px`,
`border: 0`, `background: transparent`, `place-items: center`, with an existing
focus-visible rule in the shared block. It optionally wraps a 30×30
`.widget-control__surface` (`:1651`) and a 14 px SVG. So the M10-008 fix is:
give the gear that button geometry at the left panel's 48 px slot size, **omit**
the `.widget-control__surface` child (that is the app-like square), and use a
~22 px gear SVG. Pure markup/CSS reuse — no new tokens, no new focus or
forced-colors rules, and the accessible name/title/keyboard order already exist
on the current `.widget-more`.

**The bell.** Given §3.1c, the clock zone cannot host a new control at Compact.
`.widget-controls` can: it is a `display: flex; gap: 4px` cluster in the
calendar zone that already holds pin and close at 40×40 with established
keyboard order (`WidgetView.tsx:1360-1386`). Put the reminder entry there. It
still reads as "next to the time/calendar area", it keeps C1's data contract
unchanged, and it needs no clock re-layout at either density. The cost is 44 px
of calendar text width, which the Compact calendar budget (304/392) should
absorb explicitly rather than accidentally.

**Optional, flag to the user (§8):** if the gear moves into that same cluster,
`widgetLeftWidth`'s `appCount = visible + 2` becomes `visible + 1`, i.e.
**−56 px window width at every source count** (888 → 832, 1112 → 1056) with no
density change at all. That is a real width win but it separates settings from
the icons it configures and costs another 44 px of calendar text. I do not
recommend it by default; it is a legitimate user choice if width dominates.

### 3.4 M10-006 is two different features; the brief does not choose (new)

Only `.widget-zone` consumes `--widget-panel-background`. Everything drawn
inside the zones has a **hardcoded opaque** fill:

| Object | Fill | Count at 6 sources |
| --- | --- | ---: |
| `.widget-app-slot` / `.widget-later` | `#e8edf4` / `#f8fafc` | 7 |
| `.widget-more` | `#f8fafc` | 1 |
| `.widget-app-surface` (mirror backplate) | `#111827` | up to 5 |
| `.widget-control__surface` (pin/close) | `#fff` | 2 |
| `.widget-clock-converter input` | `#fff` | 1 (when open) |
| `.widget-app-badge` / `.widget-later__badge` | `#c62828` / `#1d4ed8` | varies |
| native DWM mirror windows | `opacity: 255` (`windows_adapter.rs` thumbnail properties) | up to 5 |

So at 25% the widget renders as a ghost strip containing roughly eight fully
opaque squares. Two defensible products:

- **Panel background only (recommended).** Pure CSS/TS, no native change, and
  it is *honest*: the range genuinely controls the panel, not the contents. It
  also answers question 7 for the left zone almost for free — those opaque slot
  backplates already are the G145 "minimum effective background" that makes app
  icons and badges legible over arbitrary wallpaper. Document the scope in the
  slider's helper text so the setting does not over-promise.
- **Whole widget.** Requires alpha-ing six hardcoded fills *and* plumbing
  `panelOpacity` into `DWM_TNP_OPACITY` — which is already imported and already
  written on every thumbnail update, so the native hook is cheap, but a 25%
  live Teams badge is unreadable, which is precisely the failure the brief says
  not to claim away.

Consequence for question 7: under the recommended scope, the residual
legibility risk is **confined to the clock and calendar zones**, which draw
text directly on the translucent panel. That is small enough for a targeted
mechanism instead of a bare warning — a text backplate/halo (WCAG G145) on
`.widget-clock time` and `.widget-calendar strong`, engaged below the warning
threshold. Bounded CSS, no new preference, no contrast claim that cannot be
measured. Also note `widgetPanelStyle`'s 4.5:1 and 3:1 gates
(`widget-preferences.ts:237-263`) are computed against the **solid** colour and
become decorative below ~85%; the helper text at `App.tsx:549-551` ("Text and
border colors are selected automatically for contrast") is currently true and
would become misleading — it must change in the same commit.

### 3.5 M10-001 migration: a third option, better than the brief's or Devin's (correction)

Devin's mechanism is right. `normalizeSourceSubset(..., fallback, legacyDefaults,
migrateLegacyCatalog)` (`widget-preferences.ts:123-145`, gated by
`migrateLegacyCatalog = value?.sourceCatalogVersion !== 2` at `:150`) maps a
pre-v2 stored selection that equals the legacy trio onto whatever `fallback`
is. Repointing `DEFAULT_WIDGET_PREFERENCES` therefore silently drops Telegram
for never-upgraded users.

But Devin's remedy — point the legacy migration at the historical all-six set —
**re-creates for the longest-tenured testers the exact six-source noise M10-001
exists to remove.** Those users are the population most likely to be running
the beta daily.

Third option, better than both: **delete the legacy-widening branch.** A legacy
trio then normalizes to the trio it already had
(`["teams","telegram","outlook"]` / `["teams","telegram"]`) — neither noisy nor
lossy. The three newer sources stay discoverable in Advanced because they are
already present in `appOrder` regardless. This also removes a whole conditional
and its two constants rather than adding a third.

Either way, four cases must be distinct and separately asserted in
`scripts/test-widget-preferences.mjs` (which already covers legacy, malformed,
current, paused, and missing at `:26-139` and should be extended):
missing/corrupt → quiet default; legacy v1 → identity; explicit v2 → identity;
"Reset source defaults" → whichever semantics §8 picks.

**Keep both reset affordances.** The current button (`App.tsx:690-700`) writes
`[...DEFAULT_APP_ORDER]` / `[...DEFAULT_LIVE_VISUAL_SOURCES]` and is the *only*
"enable all six" affordance in the product. Repointing it at the quiet default
removes a capability with no replacement. Ship "Reset to defaults (Teams +
Outlook)" **and** "Enable all six sources"; that also dissolves Devin's
question 1 as a blocker.

### 3.6 Two verified user-visible copy defects M10-009 should absorb (one new)

- **New.** `App.tsx:640-644` reads "Showing N of 6 fixed sources. **The first
  three** provide semantic attention state; the messenger additions provide app
  presence and visual-only badges." The list it describes is `appOrder`, which
  the Move up / Move down buttons immediately above (`:589-635`) let the user
  reorder. After any reorder the sentence is false. Name the sources (Teams,
  Telegram, Outlook) instead of their positions.
- **Corroborating Devin §3.3.** `LaterInboxView.tsx:540-543` states a follow-up
  time "does not create a Windows notification", while
  `WidgetView.tsx:612-663` polls `notify_due_later_inbox_items` whenever
  `laterInboxPreferences.dueNotificationsEnabled` is set. Already wrong in
  beta.1; becomes a defect the moment a reminder entry point advertises it. Make
  it conditional on the preference and repeat the running-app limit there.

### 3.7 Compact constants: Devin's rule is right, Devin's numbers are not (correction)

The DPI argument is correct and worth keeping: `scale(v) = v * dpi / 96`
truncates (`position_widget_destination`), so left-panel constants must be
multiples of 4 to be exact at 125% / 150% / 175% / 200%. The brief's 6 px gap
and 10 px padding fail at 125% (stride 50 → 62.5 → alternating 1 px drift).

But Devin's §3.2/§6 are internally inconsistent. They state "app gap 4,
left/right padding 12" while quoting widths (808 / 896 / 1000 / 1088) that
require a **total** outer padding of 20 px — i.e. 10 px per side, which is not a
multiple of 4 and breaks the rule they just proposed. The relevant fact:
`WIDGET_LEFT_PADDING = 24` in `widget-layout.ts` is the **total**, matching
Rust's per-side `WIDGET_LEFT_PANEL_LOGICAL_PADDING = 12` and CSS
`.widget-apps { left: 12px }`. So per-side 12 ⇒ TS 24, and the widths move.

Self-consistent, all multiples of 4 (Rust padding 12 / TS 24; target 44; mirror
36 + inset 4; icon top 12; clock 280; numerals 30; calendar 304/392; zone gap 8):

| Sources | Gap 4 (stride 48) | Gap 8 (stride 52) |
| --- | ---: | ---: |
| 2, one event | **812** | 824 |
| 2, current + next | **900** | 912 |
| 6, one event | **1004** | 1032 |
| 6, current + next | **1092** | 1120 |
| 0, compact calendar | **716** | 724 |

Both columns are exactly DPI-safe (48 and 52 are both multiples of 4), so the
gap is a pure design choice, not a constraint — 4 px between 44 px squares is
visually tight and hurts pointer discrimination between adjacent app targets.
I would take **stride 52 (gap 8, unchanged from today)** unless the screenshot
gate shows it wastes too much, because it preserves the current visual rhythm
and still delivers the height reduction that is the actual complaint.

### 3.8 Latent 1 px mirror misalignment — derived, needs measurement (new)

With `box-sizing: border-box` global (`App.css:13`),
`.widget-shell { padding: 4px 0 }`, `.widget-zone { border: 1px }`, and
`.widget-apps { position: absolute; top: 11px; left: 12px }`, absolute offsets
resolve against `.widget-left`'s padding box, i.e. inside its 1 px border:

- **vertical:** 4 (shell) + 1 (border) + 11 = 16 → surface at 16 + 4 = **20**;
  Rust `scale(16) + inset(4)` = **20** ✓
- **horizontal:** 0 (the shell has no x-padding) + 1 (border) + 12 = 13 →
  surface at 13 + 4 = **17**; Rust `scale(12) + inset(4)` = **16** ✗

The CSS compensates for the border vertically (`11 = 16 − 4 − 1`) but not
horizontally (`12`, where 11 would be needed). That predicts a **1 physical px
horizontal offset** between every app-slot ring and its DWM mirror at 100%
scale, ~1.5 px at 150% — a thin sliver of the `#111827` backplate on one edge.

I could not run the app (the brief forbids it), so this is derived from
constants and **must be confirmed by measurement**, not taken as observed. If
confirmed, fix it as a one-line pre-req (`left: 11px`, or Rust padding 13)
*before* A2, because Compact re-derives these same offsets and would otherwise
bake the error into a second density.

---

## 4. Reject / defer

Agreed with the brief and Devin on all rejections; adding only:

- **The standalone 20×20 globe (B2 as dimensioned).** Reject in favour of B2′
  (§3.2) — sub-minimum target, no room at Compact, and an equivalent shipping
  pattern already exists.
- **A bell in the clock zone (C1 as dimensioned).** Reject the placement, keep
  the flow; relocate to `.widget-controls` (§3.3).
- **Bundling A2 into M10A.** Defer A2 to its own gated slice behind §3.1's
  prerequisites. Not a rejection of the design — A2 remains the right answer to
  the density complaint — but it does not belong in "low-risk community polish"
  when it is the only item touching the cross-layer geometry contract.
- **Whole-widget transparency** (alpha on slot fills + DWM thumbnail opacity) —
  defer unless the user explicitly wants it (§3.4, §8).

---

## 5. Defect analysis

### 5.1 Teams dual-taskbar (M10-002) — the evidence gate is cheaper than stated

Mechanism confirmed exactly as the brief describes: `ordered_taskbars_for_source`
sorts by preferred-source-window monitor (0) → primary (1) → rest (2) with a
stable sort, and `select_taskbar_for_source` returns the first surface whose
`discover_taskbar_button` succeeds. No attention or badge fact participates. So
"Teams window is on monitor 2, the badge is on monitor 1" reproduces the report
without any Windows behaviour needing to be exotic.

**New: the sanitized probe already exists and is almost wired.**
`run_manual_probe()` (`teams_mirror/windows_adapter.rs:297-302`, re-exported at
`mod.rs:155`) wraps `windows_probe::run()`, which parses `--track-reflow` and
`--teams-crop` from `std::env::args()` (`:409-418`) and, in
`ProbeMode::TrackedCrop`, calls `select_taskbar_for_source(..., log_details =
true)`. That path **already prints** exactly the sanitized shape the brief asks
for: `<source>_taskbar_surface_count`, `preferred_monitor_available`,
`<source>_taskbar_selected=primary:<bool> monitor:<label>`,
`<source>_taskbar_candidate_count`, `<source>_notification_area_matches_excluded`,
and per candidate `name_match / identity_match / button_control / name_length /
automation_id_length / bounds` — booleans, counts, and lengths, never a raw
label.

**But nothing calls it.** There is no `[[bin]]` target in `src-tauri/Cargo.toml`
and `lib.rs::run()` (`:423`) never dispatches to it. It is an orphaned entry
point. So the M10B gate is three bounded steps, not new diagnostic machinery:

1. re-wire the entry point (a `[[bin]]` target, or an argv check in `run()`);
2. add **one** boolean per candidate — `name_contains_digit` — derived from the
   `CurrentName()` value that `discover_taskbar_button` already reads in-process
   for matching, so no new data is touched, only a narrower fact is emitted;
3. suppress the raw `bounds` quadruple from the artifact that leaves the
   reporter's machine (it is fine in-process, it is monitor geometry in a shared
   file).

This should be the **first** M10B commit, before any ranking change.

On Devin's specific claim that Windows surfaces `ITaskbarList3::SetOverlayIcon`
description text through the taskbar button's UIA Name: plausible, and it is the
right hypothesis to test, but I would not treat it as established — it is
undocumented for the Windows 11 XAML taskbar, and the failure mode (both
surfaces exposing identical names) is at least as likely as the success mode.
Frame step 2 as a hypothesis test with a pre-committed fallback, and note the
locale dependency: any digit-detection must be Unicode-digit aware, not ASCII
`0-9`, because `source_name_matches` already lowercases ASCII-only.

**New: the per-display fallback needs a stable key, and the current label is
not one.** `monitor_descriptor()` returns `taskbar@<left>,<top>,<right>,<bottom>`
— raw screen coordinates. That string is already serialized to the frontend as
`TaskbarMirrorStatus.taskbar_monitor` (`teams_mirror/mod.rs:124-135`,
`src/attention-model.ts:54-55`), though the UI reads only `taskbarCount`
(`WidgetView.tsx:187`) — so a monitor-geometry string crosses the IPC boundary
today with no consumer, which is worth cleaning up on hygiene grounds alone.
More importantly, raw bounds are **not stable**: they change on resolution
change and on display rearrangement, so a preference keyed on them silently
mis-targets. Recommended contract for `Taskbar surface: Automatic | Display 1 |
Display 2`: persist `GetMonitorInfoW().szDevice` (or a stable hash of it)
locally, render `Display 1 (primary)` in the UI, emit neither in diagnostics,
and normalize to `Automatic` whenever the saved device is absent. Local
persistence of a device name is consistent with `docs/privacy.md`'s boundary —
the brief's constraint is about diagnostics and public evidence, not about local
preference storage.

### 5.2 Classic Outlook (M10-004) — presence/activation is not a one-constant change

The three-capability split is right and matches the code: presence
(`attention_signals/windows_adapter.rs:38`), activation
(`teams_mirror/windows_adapter.rs:407`), and a separate English-Inbox-label UIA
parser with honest `NotExposed` fallbacks. Devin's dual-Outlook precedence gap
is real, and I confirm the presence side is structurally ready for it —
`any_process_running` already takes a slice, so accepting a second executable
costs nothing there.

**New: the copy is per-executable, and the diagnostics are hardcoded to "New
Outlook".** The running-but-unexposed branch
(`attention_signals/windows_adapter.rs:252-270`) emits the literal strings "New
Outlook is running without an accessible top-level window. Open Outlook to
refresh its Inbox state." and "New Outlook is not running with an accessible
top-level window." Adding `outlook.exe` to the executable set without touching
these would make Attention Hub tell a Classic Outlook user a false statement in
a user-visible diagnostic — exactly the truthfulness standard the brief sets for
`notExposed`. So the "safe, low-risk first layer" is one constant **plus**
per-executable diagnostic copy **plus** the precedence rule. Still small, but
scope it honestly.

Also: the unread probe should extend the existing harnesses —
`scripts/windows/inspect-attention-signals.ps1` and
`scripts/windows/test-attention-hub-outlook-fallback.ps1` already exist — rather
than add a new one. And I endorse Devin's point that Classic Outlook spawns
multiple top-level windows (reminders, inspectors, the Explorer), so activation
needs a bounded main-window filter, not "first match".

---

## 6. UI choice

**A — A2 as the design, staged as two slices, with corrected constants.**

- **M10A ships A1** (quiet defaults): 888 px / 984 px at two sources, zero
  cross-layer risk. Plus surface the *existing* `widthMode` control better
  (§7.5) — 856 px at two sources today, with no code change at all.
- **A2 Compact ships as its own gated slice**, after §3.1(a) conf/test
  prerequisite, §3.1(b) mask radius, §3.1(c) clock re-tune, and §3.8
  measurement. Constants: window **68**, zones **60**, hit targets **44×44**,
  mirror **36×36** + inset **4**, icon top **12**, app gap **8** (stride 52;
  gap 4 / stride 48 is the tighter alternative), outer padding **12 per side /
  24 total**, clock zone **280**, numerals **30**, calendar **304 / 392**, zone
  gap **8**. Targets: **824 / 912** at two sources, **1032 / 1120** at six,
  **724** floor (gap-4 variant: 812 / 900, 1004 / 1092, 716). Comfortable
  remains the migrated-user default; Compact becomes the fresh default only
  after the screenshot gate.

Rationale for staging, in numbers: of the 1112 → 812 px best case at six-source
parity, M10-001 supplies 224 px (≈75%), the already-shipping `widthMode`
supplies a further 32 px (≈10%), and A2 supplies the last ~44 px. A2's real
deliverable is the **12 px of height and the 48 → 44 px icon size** — worth
shipping, not worth coupling to the low-risk polish.

**B — B2′** (§3.2). Primary row's static `Local` span becomes a native
`<select>` in the existing `.widget-clock__label--select` construct (full
column, ≈135 × 17 px, existing chevron), listing `System local (<zone>)` +
curated `TIME_ZONE_OPTIONS` + last chosen. Advanced keeps the authoritative
control at ≥280 px with IANA validation, System reset, and the scope statement.
No 20×20 control anywhere.

**C — C1, relocated** (§3.3). Reminder entry as a 40×40 button in the existing
`.widget-controls` cluster (calendar zone, beside pin and close), opening the
existing 360×420 Later Inbox window in create mode with the follow-up prefilled
to the next quarter-hour, Work/Private and validation unchanged, plus the §3.6
conditional copy and the notifications-disabled prompt. No new window, no
second store, no clock-zone re-layout.

---

## 7. Missing acceptance evidence

Beyond the brief's list and Devin's additions:

1. **Window-constraint invariant test**: assert `tauri.conf.json`'s
   `minWidth/maxWidth/minHeight/maxHeight` equal the layout function's extrema
   across both densities, so the pair cannot drift (§3.1a). Today
   `scripts/test-widget-layout.mjs:25,28` pins 744 and 1208 with no link to the
   conf file.
2. **Measured ring-vs-mirror alignment**, before and after Compact, at 100% /
   125% / 150%, for slots 1…8, reported as a per-edge pixel delta rather than
   "looks aligned" (§3.8). This is the only way to settle the derived 1 px
   horizontal offset.
3. **Rendered 25% opacity check with a live DWM mirror running**, since the
   mirror is opaque and the slot backplates are opaque — the screenshot must
   show what the user actually gets, and the decision in §3.4/§8 must be
   recorded in the acceptance note.
4. **Legacy-v1 identity test** (§3.5) plus a test that an "enable all six"
   affordance still exists after the defaults change.
5. **Reorder-then-read-Advanced test** for the positional-copy defect (§3.6):
   move Teams to last, assert the source-monitoring paragraph is still true.
6. **Rust unit test for the Compact mask radius derivation** at 36 px, at 96 /
   120 / 144 DPI (§3.1b).
7. **One probe run on the reporter's dual-monitor PC** from the re-wired entry
   point, with `bounds` suppressed in the shared artifact and
   `name_contains_digit` present (§5.1) — captured *before* any ranking change
   is written.
8. **Forced-colors check specifically at 25%**, not just at the current floor.
   The existing `@media (forced-colors: active)` block only handles
   `[data-health]` outlines and `forced-color-adjust: auto` on
   `.widget-app-surface`; nothing in it constrains panel alpha.
9. **Compact clock zone at 200% text zoom and in a long-label locale** — the
   50-px-content-in-50-px-budget result in §3.1c has no headroom, and the
   secondary select already relies on `text-overflow: ellipsis`.

---

## 8. Unresolved questions for the user

Only decisions that change scope or behaviour:

1. **Opacity scope (blocks M10-006).** Does 25% mean *panel background only*
   (recommended: ~20 lines, honest, no native change, keeps live badges
   readable) or *the whole widget* including app-slot fills and the native DWM
   mirrors (needs `DWM_TNP_OPACITY` plumbing and makes a 25% Teams badge
   unreadable)? §3.4.
2. **Legacy v1 upgrade path (blocks M10-001).** A never-upgraded user whose
   stored selection is the old default trio should get: (a) their trio
   preserved — my recommendation, neither noisy nor lossy; (b) all six —
   Devin's, which re-introduces the noise M10-001 removes; or (c) the new quiet
   two-source default — the brief's implied behaviour, which silently drops
   Telegram. §3.5.
3. **Is A2 in M10A?** Ship A1 now and A2 as a separate gated slice (my
   recommendation, given that M10-001 delivers ~75% of the width and A2 is the
   only cross-layer item), or bundle both into one beta and accept the longer
   acceptance matrix? §6A.
4. **Gear placement.** Restyle in place (recommended: pure CSS, satisfies
   M10-008 exactly), or move it into the pin/close cluster for a further −56 px
   of window width at every source count, at the cost of 44 px of calendar text
   and a weaker association with the icons it configures? §3.3.
5. **Opacity warning threshold.** Endorsing Devin's question; I would set it at
   **below 70%**, paired with the §3.4 text backplate rather than a warning
   alone, so the mechanism is a mitigation and not just a disclaimer.
6. **Dual-Outlook precedence.** Endorsing Devin's question; recommend prefer
   `olk.exe` for the single `outlook` slot, with a truthful diagnostic naming
   which executable is being observed (§5.2 — the diagnostic strings are
   hardcoded to "New Outlook" today and must become per-executable regardless
   of which way this is decided).

Devin's "reset semantics" question is, I think, dissolved rather than answered:
keep both buttons (§3.5), and no capability is lost either way.

---

## Appendix — independently recomputed geometry

`widgetLeftWidth(n) = 24 + (n+2)·48 + (n+1)·8`;
`widgetWidth = left + 296 + calendar + 16`; calendar = 304 (compact) / 336
(auto, one event) / 432 (auto+next or wide).

| Sources | Calendar | Left | Width | Brief |
| ---: | --- | ---: | ---: | --- |
| 0 | 304 | 128 | 744 | 744 ✓ |
| 0 | 336 | 128 | 776 | — |
| 2 | 336 | 240 | 888 | 888 ✓ |
| 2 | 432 | 240 | 984 | 984 ✓ |
| 2 | 304 | 240 | 856 | — (existing `widthMode: compact`) |
| 6 | 336 | 464 | 1112 | 1112 ✓ |
| 6 | 432 | 464 | 1208 | 1208 ✓ |

Zone share at the current fresh default (1112 px): apps 464 (41.7%), clock 296
(26.6%), calendar 336 (30.2%), gaps 16 (1.4%). This is the arithmetic behind
§6A's staging argument — the apps zone is the only one M10-001 touches, and it
is the largest single contributor.
