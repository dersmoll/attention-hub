# M10 community-feedback council review — Devin
 
- Reviewer: Devin
- Brief: `codex-community-feedback-brief.md`
- Verified baseline: `v0.5.0-beta.1`, commit `1ea5798`, inspected read-only via
  the `codex/m10-community-feedback` worktree
  (`C:/Users/dersm/.codex/worktrees/a27b/attention-hub`). Note: the primary
  workspace checkout is on `agent/m0-notification-feasibility`, which does not
  contain the M9 code the brief describes; all findings below were verified
  against the baseline worktree, not the stale checkout. No application code
  was changed.
 
## 1. Verdict
 
**Decision-ready with modifications.** The brief's repo claims are accurate —
I independently confirmed defaults, the 85–100 opacity clamp, `olk.exe`-only
Outlook matching, taskbar ranking without badge awareness, the shared 48×48
settings-button geometry, Later Inbox reminder ownership, and I recomputed
every width in the table (1112/1208/888/984/744 px all correct against
`src/widget-layout.ts` and `tauri.conf.json`). The M10A/M10B split is the right
boundary. Three findings require plan changes before implementation: a legacy
migration hazard in the new-defaults plan, DPI-unfriendly Compact constants,
and a contradictory Later Inbox notification copy string that the quick
reminder would amplify.
 
## 2. Adopt
 
- **M10-001 quiet fresh defaults** (`monitoredSources: ["teams","outlook"]`,
  `liveVisualSources: ["teams"]`, full six-key `appOrder` retained). Verified:
  `DEFAULT_WIDGET_PREFERENCES` currently enables all six sources and five
  mirrors (`src/widget-preferences.ts:29-59`). Adopt with the migration
  modification in §3.
- **M10-006 opacity 25–100.** Verified the clamp at
  `src/widget-preferences.ts:67-71` and the slider `min="85"` at
  `src/App.tsx:538-539`. The brief's contrast honesty is correct: the
  foreground algorithm compares against the **solid** panel color only
  (`widgetPanelStyle`, `src/widget-preferences.ts:237-254`); alpha is applied
  afterward. Warning + one-click 100% reset is the right truthful scope. The
  forced-colors media block already exists (`src/App.css:1682-1692`) and must
  be re-verified after the change.
- **M10-008 gear glyph.** Verified `.widget-app-slot, .widget-later,
  .widget-more` share the identical 48×48 bordered rounded-square rule
  (`src/App.css:1128-1143`), and `.widget-more` even carries an app-like
  `#f8fafc` fill (`:1221-1226`). A transparent-surface gear with the same hit
  target and existing focus-ring rule is a pure CSS/markup fix. Adopt.
- **M10-003 primary clock timezone override** as `primaryTimeZone: null | IANA`
  with `null` = system. Verified the primary clock and converter derive the
  local zone from `Intl.DateTimeFormat().resolvedOptions().timeZone`
  (`src/WidgetView.tsx:1035-1039`). Scope isolation is achievable because the
  work-calendar and Later Inbox paths do not read that variable. See §3 for
  one converter-coupling requirement.
- **M10-007 reminder shortcut = entry into Later Inbox (C1).** Verified Later
  Inbox already owns `followUpAt`/`notifiedFollowUpAt` (schema v3,
  `src/later-inbox-model.ts:22-41`), the due-notification loop gated on
  `dueNotificationsEnabled` (`src/WidgetView.tsx:617-663`), and the 360×420
  window geometry (`later-inbox-model.ts:4-9`). No second scheduler. Adopt
  with the copy fix in §3.
- **M10-009 narrowed** to clearer fixed-catalog wording plus optional
  detected/running state on the existing six checkboxes
  (`src/App.tsx:638-701`). Reject arbitrary enumeration (§4).
- **M10B evidence gates** for dual-taskbar Teams and Classic Outlook,
  including keeping M10B non-blocking for M10A.
 
## 3. Modify
 
### 3.1 New defaults: separate "fresh default" from "legacy migration target" (blocking)
 
`normalizeSourceSubset` (`src/widget-preferences.ts:123-145`) maps a legacy
(pre-v2) stored selection that equals the legacy defaults
`["teams","telegram","outlook"]` / `["teams","telegram"]` onto the current
`fallback` argument, which today is `DEFAULT_WIDGET_PREFERENCES`. If the plan
simply repoints the defaults at Teams+Outlook, a never-upgraded legacy user
who kept the old default trio would be silently **downgraded to two sources,
losing Telegram** — exactly the "preserve existing selections" violation the
brief forbids. Required change: introduce distinct constants
(`FRESH_MONITORED_DEFAULT` vs the historical all-six migration target), keep
the v1→v2 legacy migration pointing at the historical sets, and add an
explicit regression test for the legacy-trio case. No `sourceCatalogVersion`
bump is strictly required because v2 writes always persist explicit arrays
(`writeWidgetPreferences`, `:193-202`), but the test suite
(`scripts/test-widget-preferences.mjs`) must gain: fresh-null → quiet default;
legacy trio → historical six; corrupt JSON → quiet default (behavior change
from today's all-six recovery — acceptable, but assert it deliberately).
 
### 3.2 Compact preset (A2): fix DPI-hostile constants (blocking for A2)
 
Rust positions DWM mirrors with truncating integer scaling
(`scale = value * dpi / 96`, `windows_adapter.rs:1320-1333`) while CSS
subpixel-renders. Today every left-panel constant (48, 8, 12, 16) is a
multiple of 4, so 125% and 150% scale are exact. The proposed Compact 6 px gap
and 10 px padding are **not**: at 125%, slot stride 50 logical → 62.5 physical,
so every second mirror drifts up to 1 px against its CSS ring. Counter-proposal
keeping the same footprint spirit, all multiples of 4:
 
- hit target 44×44 (44 → 55 px at 125%, exact); mirror 36×36, inset 4
  (36+2×4 = 44, consistent with the current 40+2×4 = 48 scheme);
- app gap 4, left/right padding 12 (stride 48 → 60 exact);
- icon top offset 12 ((68−44)/2, → 15 exact);
- window 68 px, zone 60 px, clock zone 280 px, numerals 30 px, calendar
  304/392 px, zone gap 8 (keep — 6 is fractional at 125%).
 
Resulting widths: Teams+Outlook 808 px (896 dual); all six 1000 px (1088
dual); zero-source compact floor 708 px. Close to the brief's 810/898/1010/1098
targets with deterministic alignment. Two additional implementation
consequences the brief understates:
 
- `tauri.conf.json` window constraints are static (`744–1208 × 80`,
  `resizable: false`). Density switching requires runtime min/max/size updates
  from code plus a persisted `density` preference with normalization — this is
  a preference-schema addition that needs its own migration test.
- Compact must re-audit clock internals: `.widget-clock__time-button` has
  `min-height: 38px` and numerals are 36 px in a 72 px zone
  (`src/App.css:1341-1360`); a 60 px zone with 30 px numerals changes several
  dependent paddings, not just two constants.
 
### 3.3 Later Inbox copy contradiction (fold into C1)
 
`src/LaterInboxView.tsx:540-543` unconditionally states a follow-up time
"does not create a Windows notification," while `WidgetView.tsx:617-663`
does send due notifications whenever `dueNotificationsEnabled` is on. This is
already misleading in v0.5.0-beta.1 and becomes a defect once the clock bell
advertises reminders. C1 must make this helper text conditional on the
preference and repeat the running-app limitation there.
 
### 3.4 Primary timezone override: converter coupling
 
The clock converter's "local" side reuses the same resolved zone
(`WidgetView.tsx:1036-1039`). The override must feed both the primary clock
display and the converter's local endpoint, or a converted time will disagree
with the clock above it. Add a conversion test where `primaryTimeZone` is set
and the local↔secondary conversion uses the override, plus the DST-gap case
(the existing "Unavailable at the DST transition" path, `:1040-1049`).
 
## 4. Reject / defer
 
- **Arbitrary taskbar-app enumeration/pinning (M10-009 wide form).** New
  generalized-provider scope; contradicts the fixed-catalog decision and risks
  private window titles in UI. Reject for M10.
- **A3 continuous drag-resize.** Verified the cross-layer coupling is real:
  Rust duplicates icon size/gap/padding/top as native constants
  (`windows_adapter.rs:380-387`) and repositions per slot
  (`:1311-1358`). Continuous scaling multiplies the DPI truncation problem in
  §3.2 across an infinite range. Defer; two presets first.
- **B3 timezone popover window** and **C2/C3 new reminder surfaces.** Each adds
  window lifecycle, focus-return, and accessibility surface around data that
  existing surfaces already own. Defer unless B2/C1 fail with testers.
- **Classic Outlook unread semantics without a probe.** The new-Outlook parser
  is explicitly English-Inbox-label based with minimized-state honesty
  (`attention_signals/windows_adapter.rs:256-350`); assuming it transfers to a
  Win32 MAPI-era UIA tree is unjustified. Keep behind the sanitized-evidence
  gate.
- **Any badge-pixel/OCR inference for M10-002.** Correctly out of scope.
 
## 5. Defect analysis
 
### Teams dual-taskbar (M10-002)
 
Confirmed mechanism: `ordered_taskbars_for_source` sorts surfaces by
preferred-source-window monitor → primary → rest (`windows_adapter.rs:840-856`)
and `select_taskbar_for_source` returns the **first** surface with one
unambiguous button (`:781-838`). No attention/badge fact participates.
Windows renders the numeric badge only on one taskbar in several
multi-display configurations, so "Teams window monitor ≠ badge monitor"
reproduces the report exactly.
 
Concrete non-pixel candidate signal for the probe: the button **UIA Name is
already read in-process** for matching (`discover_taskbar_button`,
`:1075-1081`) and only lengths/booleans are logged (`:1145-1159`). Windows
surfaces overlay-badge accessibility text (e.g. the description supplied via
`ITaskbarList3::SetOverlayIcon`, and equivalent badge text for packaged apps)
through that Name. The sanitized probe should therefore record, per surface:
`has_digit_in_name`, `name_length`, `button_control`, `identity_match` — never
the raw string. Risks to test for: localization of the badge phrase, and both
surfaces exposing identical names (likely on "show badges on all taskbars"
configurations). If no stable distinction exists, the Advanced per-display
fallback (`Automatic | Display 1 | Display 2`) is the correct product answer;
it must be a normalized preference that degrades to Automatic when the saved
display disappears.
 
### Classic Outlook (M10-004)
 
The three-capability split is correct and matches the code: presence is one
executable constant (`attention_signals/windows_adapter.rs:38`), activation is
a second (`teams_mirror/windows_adapter.rs:407`), and unread is a separate
English-label UIA parser with honest `NotExposed` fallbacks (`:256-350`).
Presence + bounded activation for `outlook.exe` is low-risk; note Classic
Outlook spawns multiple top-level windows (reminders, inspectors), so
main-window selection needs a class/bounds filter analogous to the existing
"usable window" checks. Unread semantics stay evidence-gated. One gap the
brief does not resolve: Microsoft confirms both Outlooks run side by side, and
the catalog has a **single** `outlook` slot — precedence when both processes
run must be specified before implementation (see §8).
 
## 6. UI choice
 
- **A: A2**, with §3.2 revised constants — 68 px window, 60 px zones, 44 px
  targets, 36 px mirrors + 4 px inset, 4 px app gap, 12 px outer padding,
  12 px icon top, 280 px clock, 30 px numerals, 304/392 px calendar, 8 px zone
  gap → 808/896 px (two sources), 1000/1088 px (six). Comfortable stays the
  migrated-user default; Compact becomes fresh default only after the
  screenshot gate.
- **B: B2** — 20×20 globe/select beside the primary clock label, curated list
  (System + existing `TIME_ZONE_OPTIONS` + recent), full validated control in
  Advanced; label switches from `Local` to a short zone label when overridden.
- **C: C1** — 20×20 bell in the clock zone opening the existing 360×420 Later
  Inbox window in create mode, follow-up prefilled to the next quarter-hour,
  including the §3.3 copy fix and the notifications-disabled prompt.
 
## 7. Missing acceptance evidence
 
Beyond the brief's list, require:
 
1. Migration regression test: legacy-default trio (`no sourceCatalogVersion`)
   normalizes to the historical six-source set, **not** the quiet default
   (§3.1); plus corrupt-JSON → quiet default asserted deliberately.
2. A layout unit test asserting every Compact left-panel constant and stride
   is a multiple of 4 (guards the §3.2 DPI contract), and a manual 125% DWM
   alignment check specifically on slots 3–8.
3. Runtime window-constraint evidence after density switch (min/max/height
   applied without restart; position preserved).
4. Converter test with `primaryTimeZone` overridden (§3.4), including the DST
   nonexistent-time path.
5. Quick-reminder prefill tests across midnight and DST transitions
   (next-quarter-hour rounding), and verification the §3.3 helper text now
   tracks `dueNotificationsEnabled`.
6. Both-Outlooks-running manual case: single `outlook` slot behavior,
   activation target, and diagnostics wording.
7. "Reset source defaults" behavior test matching whichever semantics the user
   picks in §8 (button currently writes the all-six set,
   `src/App.tsx:690-700`).
8. Gear button: forced-colors and focus-ring re-verification, since it leaves
   the shared `.widget-more` square rules.
 
## 8. Unresolved questions for the user
 
1. **Reset semantics:** should Advanced "Reset source defaults" restore the new
   quiet default (recommended, with a separate "Enable all six sources"
   affordance) or the historical all-source set?
2. **Dual-Outlook precedence:** when Classic and new Outlook run
   simultaneously, which process owns the single `outlook` slot's presence and
   activation? (Recommended: prefer `olk.exe`, diagnostic note for the other.)
3. **Compact rollout:** fresh installs default to Compact after screenshot
   acceptance (brief's proposal), or Compact ships opt-in for one beta first?
4. **Opacity warning threshold:** at what value does the "may be hard to read"
   label engage (I suggest below 60%)? This is copy/UX, but it changes the
   acceptance matrix.