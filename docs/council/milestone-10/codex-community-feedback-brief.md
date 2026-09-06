# Attention Hub M10 community-feedback council brief

- Status: **council complete; bounded M10A implementation through M10A6 approved**
- Baseline: public `v0.5.0-beta.1`, commit `1ea5798`
- Prepared branch: `codex/m10-community-feedback`

This file began as the read-only discovery record. The user subsequently
approved the bounded M10A1 implementation below and, after testing it, approved
the M10A2 Option A refinement recorded next. Native provider, DWM, installer,
and lifecycle work remain discussion-only.

## Approved M10A2 Option A boundary

- Keep the widget 80 px high. Use source-only left width, a 240 px clock, a
  320 px single-event or 416 px dual-event calendar, and a dedicated 68 px
  right utility rail with four 32 px hit areas. Expected widths are 780 px for
  a fresh two-source layout, 1004 px for six sources, and 1100 px for six
  sources with two calendar events.
- Move pin and close out of the calendar. Put pin, close, reminder, and Advanced
  in the right rail. The reminder bell owns the open/due badge; remove the old
  left Later icon. Use a compact, symmetric Windows settings glyph with an
  adaptive foreground and no app-like square background.
- Reduce clock whitespace to 4 px per side, remove the inter-clock gap, use a
  30 px condensed Windows-first number stack, and show IANA identifiers on the
  widget. Advanced exposes both primary and secondary clocks using the same
  runtime-supported IANA catalog and current UTC offsets.
- Give truncated current and next calendar event text native hover titles.
- Open Later Inbox at 360 x 560 px in a list-first state. **Add new reminder**
  starts a horizontal What/When/Details wizard. New reminders require a time,
  prefilled to the next quarter-hour; Details remains optional and link-aware.
  Do not expose a Task URL field, but preserve URLs already stored on existing
  items.
- Preserve existing Later Inbox storage, notification opt-in, running-app-only
  notification lifecycle, provider/DWM semantics, privacy boundaries, and
  validated M9 behavior.
- Keep Classic Outlook, Teams dual-taskbar ranking, Graph/OCR, generalized
  providers, installer lifecycle, autostart, tray, updater, recurrence, snooze,
  closed-app notifications, continuous resize, and a separate density setting
  out of this implementation.

## M10A3 tester correction

The follow-up tester screenshots authorized a bounded polish pass: render the
gear with the same adaptive mini-button surface as pin, close, and reminder;
show short city labels with a compact timezone list in the widget and full-IANA
search in Advanced; make wizard steps aligned and clickable; move Space into
Details and keep the rich notes editor visibly available; enlarge already-open
Later windows when needed; and replace open-item text actions with compact,
accessible complete/edit/delete icons. Single-item deletion requires inline
confirmation and must not retain deleted content in the local backup.

## M10A4 tester correction

The next tester pass authorized compact mode to reduce the source strip itself:
40 px buttons, 34 px visual surfaces, 4 px gaps, and smaller padding, with the
same compact flag propagated to native DWM placement. Timezone choices use
`(UTC offset) city aliases — IANA identifier`, normalize `Europe/Kiev` to
`Europe/Kyiv`, and keep the short widget label stable while the native selector
opens. Wizard navigation no longer blocks Details when an earlier required
field is incomplete; Save remains the validation boundary. Step controls share
an explicit height/alignment, and the redundant in-content Later Inbox Close
button is removed because the decorated window already owns native Close.

## M10A4.1 tester correction

The invisible native timezone selector remains absolutely positioned while it
has focus; the visible short label therefore no longer shifts when the popup
opens. Compact mode reduces the calendar from 304 px to 272 px and places the
event state, truncated title, and available action on the same row. Standard
and wide calendar composition remains unchanged, and native hover text still
exposes the full subject and details.

## M10A4.2 tester correction

Compact mode reduces the whole widget from 80 px to 68 px and its panels from
72 px to 60 px. Source surfaces and the native DWM destinations move upward in
lockstep; normal and wide modes remain 80 px tall. The compact calendar uses a
distinct status pill and a 5 px header-to-detail gap. The reminder wizard uses
fixed grid rows for aligned step markers, adds separation before its actions,
and visually hides redundant field labels while retaining their accessible
names.

## M10A4.3 tester correction

Compact calendar width is density-aware: 272 px for one event and 392 px when
an acknowledged current event exposes the next event beside it. The widget
resizes automatically as that state changes. Acknowledged **In progress** uses
a green status pill; the red unacknowledged meeting-started state is unchanged.

## Approved M10A5 calendar-density and overlap correction

Compact mode reduces the clock from 240 px to 208 px. Single-event calendar
width remains 272 px; any bounded two-card state uses 392 px and aligns both
cards at the top. Join and local Finish actions overlay only on hover or
keyboard focus, so they reserve no title width by default.

The Rust semantic boundary exposes at most one additional active timed event
alongside the primary selection, with independent private-title redaction and
ephemeral Join-token mapping. Two active events occupy the two cards instead
of showing a future third card. Finish suppresses only the chosen active event
in current WebView memory until its scheduled end or app restart; it does not
persist event content or write to the source calendar.

## M10A5.1 simultaneous-event correction

The bounded companion is now exposed before start when two timed events have
the exact same start. Both upcoming cards remain visible and both transition
to unacknowledged **Meeting started** states. A successful Join selects its
event and locally suppresses the parallel card; a failed link open changes no
selection state. The no-link **I'm in** fallback follows the same selection
rule. The chosen event becomes **In progress**, while provider data and the
source calendar remain unchanged.

## M10A5.2 final compact polish

Compact inter-panel gaps reduce from 8 px to 6 px without changing normal-mode
geometry. Event headers use a 7 px gap before their detail row. Countdown text
is rendered separately at higher contrast and weight before muted range and
meeting metadata. Hover actions move to a 4 px visual inset from the calendar
panel's top-right corner.

## M10A5.3 active-card and utility polish

The 7 px compact-card breathing room applies only between the header and detail
row; progress follows at 3 px so active dual cards remain inside the 60 px
panel. Both primary and companion no-link **I'm in** actions use the same
hover/focus overlay. Compact utility surfaces increase from 22 px to 26 px and
their glyphs from 12 px to 14 px inside the unchanged 28 px controls, reducing
the apparent empty space without enlarging the rail.

## M10A5.4 paired meeting-start actions

Each unacknowledged started-event card exposes **I'm in** and its available
**Join** action together on hover or keyboard focus. Join stays rightmost. A
successful Join follows the existing local selection contract, acknowledges
that event, suppresses its parallel peer, and therefore removes **I'm in**.
Events without a safe join token continue to expose only **I'm in**.

## M10A5.5 first-run calendar setup shortcut

Only the provider's explicit `notConfigured` state replaces the generic empty
calendar copy with **Calendar · Connect work calendar**, a short Published ICS
instruction, and a 24 px **Set up** action inside the unchanged calendar panel.
The action opens or focuses Advanced at its existing masked calendar field.
No calendar URL crosses the focus event, enters widget storage, or bypasses the
existing title-capability confirmation and secure verification path.

## M10A6 Advanced navigation and size-preset migration

Approved Option 1 replaces the long mixed Advanced form with a
PowerToys-inspired shell: a fixed 190 px left navigation and one scrollable
active page on the right. The pages are General, Clocks, Apps, Calendar,
Reminders, and Diagnostics. The 900×680 px window retains a 720×560 px minimum;
page content is capped at 680 px and text fields, selects, and primary controls
use a consistent 32 px height. Hidden pages remain mounted so unsaved local UI
state is not discarded while navigating. The first-run calendar shortcut opens
the Calendar page and focuses the existing masked Published ICS field.

The previously shipped Compact geometry becomes **Recommended** and is the
fresh default: 68 px window, 60 px panels, 40 px source buttons, 208 px clock,
6 px inter-panel gaps, and a 272/392 px calendar. The former Auto and Wide
choices merge into **Larger**, using an 80 px window, 48 px source buttons,
240 px clock, 8 px gaps, and a fixed 416 px calendar. Migration maps legacy
`compact` to `recommended` and legacy `auto`/`wide` to `larger`. A future thin
one-line Compact mode is explicitly reserved and not implemented here. Native
DWM density geometry continues to follow the selected preset; provider,
privacy, storage, and lifecycle contracts do not change.

## M10A6.1 reinstall preference correction

Tester evidence showed that reinstalling retains the WebView preference record,
so the former default `auto` value reopened as Larger under the first M10A6
migration. The corrected migration maps legacy `auto` to `recommended`, matching
the new default after upgrade or reinstall. Explicit legacy `wide` remains
`larger`, and current `recommended`/`larger` choices remain stable. No installer
data deletion or broader lifecycle behavior is introduced.

## M10A6.2 compact converter containment

The clock converter previously retained full IANA labels and a single-row form
inside the 208 px Recommended clock panel, allowing long zones such as
`Africa/Johannesburg` to overlap Calendar. Converter mode now uses the existing
short city labels and a contained two-row source control: the source label sits
above its time input, the converted zone/result stays in its own column, and a
smaller close action remains inside the clock panel. Full zone names remain in
accessible labels and hover text.

## Approved M10A1 boundary

- Fresh or corrupt preferences show Teams and Outlook; only the Teams live
  visual is enabled. Existing explicit selections remain exact, including the
  legacy Teams/Telegram/Outlook trio. Advanced offers both a quiet reset and an
  explicit enable-all action.
- Panel-background opacity expands to 25–100% with a warning below 60%; app and
  DWM surfaces remain opaque.
- The primary clock gets a nullable IANA override in Advanced and a full-row
  System/curated selector in the widget. Calendar, reminder, and Windows time
  semantics do not change.
- A 40×40 reminder action reuses Later Inbox and prefills the next quarter-hour.
  It does not enable notifications automatically or promise closed-app alerts.
- The ellipsis becomes an unbordered gear in its existing 48×48 hit target.
- Source controls name semantic capabilities accurately and add an explicit
  one-shot scan of only the six fixed apps. No arbitrary taskbar catalog is
  introduced.
- Teams dual-taskbar ranking, Classic Outlook support, compact density, and
  continuous resize remain separately gated follow-up work.

## Decision point

Several testers supplied overlapping reports about first-run defaults, source
compatibility, multi-monitor taskbar mirroring, clock controls, reminders,
widget size, transparency, and settings discoverability. The goal is not to
implement every suggestion literally. The goal is to select one bounded M10
scope that fixes credible defects and high-value friction while preserving the
validated M9 architecture and behavior.

Council reviewers should treat the recommendations below as proposals, verify
repo-specific claims, and return adopt/modify/reject decisions. A vote is not
enough; explain the evidence and smallest safe implementation.

## Non-negotiable baseline

- Attention Hub remains a local-first Windows observer.
- Source apps continue to own messages, unread state, windows, and interaction.
- DWM pixels remain visual-only. Do not OCR, capture, persist, inspect for
  content, or convert taskbar pixels into semantic counts.
- The production catalog remains fixed to Teams, Telegram, Outlook, Slack,
  Viber, and WhatsApp unless a later milestone explicitly approves a generalized
  provider architecture.
- The saved Published ICS calendar remains the only production calendar
  provider. Do not reopen Graph, AppointmentStore, Outlook My Day UIA, OCR, or
  generalized calendar work.
- Later Inbox remains local. Notifications are promised only while Attention
  Hub is running; Close exits the process.
- Do not introduce autostart, a Hub tray process, updater, signing, telemetry,
  cloud sync, installer lifecycle changes, or closed-app reminder guarantees.
- Preserve existing user preferences through explicit normalization/migration.
- Keep raw UIA labels, taskbar pixels, account identifiers, messages, and other
  private content out of diagnostics and public evidence.

The stable decisions are recorded in `docs/decisions/README.md`; architecture
and privacy boundaries are in `docs/architecture.md` and `docs/privacy.md`.

## Normalized feedback ledger

Severity scale: P0 security/data/release blocker; P1 core behavior materially
wrong or unusable; P2 significant friction with a workaround; P3 polish or
optional convenience.

| ID | Normalized feedback | Classification | Current confidence | Severity | Proposed disposition |
| --- | --- | --- | --- | --- | --- |
| M10-001 | Fresh installs should show only Teams and Outlook; regional messengers should be opt-in. | Confirmed first-run UX friction, not a runtime defect. | Repo-confirmed: all six sources and all five visual mirrors are enabled by default. | P2 | Include. Change fresh/reset defaults only; preserve existing explicit selections. |
| M10-002 | With Teams on two monitor taskbars, Hub may mirror the surface with a dot instead of the surface with a numeric badge. | Credible native defect; tester repro exists but has not been reproduced in this workspace. | Likely mechanism repo-confirmed: taskbars are ordered by the monitor containing a preferred Teams window, then primary monitor; the first unambiguous Teams button wins. Badge value is not part of ranking. | P1 | Investigate first. Implement only after sanitized dual-monitor evidence identifies a stable non-pixel signal or a safe manual fallback. |
| M10-003 | The primary/“Local” clock needs a manual timezone override in Advanced and a compact shortcut beside its label. | Confirmed capability gap and new bounded preference. | Repo-confirmed: primary clock always uses the WebView/system zone; only the secondary IANA zone persists. | P2 | Include as a **primary clock timezone** override. It must not change Windows, ICS interpretation, or calendar rendering semantics. |
| M10-004 | Classic Outlook should be recognized as well as new Outlook. | Compatibility request within an existing fixed source family; not a defect against the documented “New Outlook” scope. | Repo and Microsoft-confirmed: current adapter accepts only `olk.exe`; Classic Outlook uses `outlook.exe`. Its UIA tree is not yet validated. | P1 | Gate in two layers: safe process detection/activation first; unread semantics only if a sanitized Classic Outlook UIA probe proves a bounded, truthful contract. |
| M10-005 | Widget footprint is too large on laptop screens; clock and app areas can be denser; consider drag resize. | Repo-confirmed UX friction plus one high-risk solution idea. | Current all-source width is 1112 px normally and 1208 px with current+next calendar; fixed height is 80 px. | P1/P2 by display | Include a preset Compact density. Do not include continuous drag resize in the recommended M10 scope. |
| M10-006 | Expand background opacity from 85–100% to 25–100%. | Confirmed bounded preference change with legibility risk. | Repo-confirmed: both the range input and normalization clamp to 85%. | P3 | Include 25–100 with an explicit low-opacity readability warning and 100% reset. Do not claim guaranteed contrast over arbitrary desktop content. |
| M10-007 | Add a small reminder action to the time panel. | New product surface, but it overlaps existing Later Inbox follow-up notifications. | Repo-confirmed: Later Inbox already owns persisted follow-up times, one-shot notification state, and running-app lifecycle limits. | P2 | Include only as a shortcut into the existing Later Inbox reminder flow; do not create a second scheduler/store. |
| M10-008 | The square ellipsis settings button is mistaken for an app/source icon. | Confirmed visual-hierarchy friction. | Repo-confirmed: it shares the same 48×48 bordered square geometry as app and Later Inbox slots. | P3 | Include. Use a standalone gear glyph within the same accessible hit target, without an app-like square surface. |
| M10-009 | Let users manually choose detected taskbar items to pin/mirror. | Partly already available for the fixed catalog; arbitrary taskbar enumeration is new generalized-provider scope. | Repo-confirmed: Advanced already controls show/hide and live visuals for six fixed sources, but does not show “detected now” state and cannot mirror arbitrary apps. | P2 request / large scope | Narrow to clearer fixed-catalog controls and optional detected/running state. Reject arbitrary app pinning for M10. Consider a per-display taskbar-surface fallback for M10-002. |

## Repository findings

### 1. Defaults and migration

`src/widget-preferences.ts` currently defines:

- `DEFAULT_APP_ORDER`: all six fixed sources;
- `monitoredSources`: all six sources;
- `liveVisualSources`: Teams, Telegram, Slack, Viber, and WhatsApp;
- `sourceCatalogVersion: 2` and local-storage key
  `attention-hub.widget.v1`.

The Advanced view already provides show/hide, visual-mirror toggles, and source
ordering (`src/App.tsx:587-701`). The missing behavior is a quieter fresh
default and better wording/discoverability, not a new arbitrary provider UI.

Recommended fresh/reset default:

- `monitoredSources: ["teams", "outlook"]`;
- `liveVisualSources: ["teams"]`;
- keep all six in `appOrder` so users can enable them in Advanced;
- existing schema-v2 selections must round-trip unchanged;
- decide explicitly whether “Reset source defaults” means the new quiet default
  (recommended) or the historical all-source set.

Migration tests in `scripts/test-widget-preferences.mjs` already cover malformed,
legacy, current, paused, and missing preferences and should be extended rather
than replaced.

### 2. Why the dual-taskbar Teams report is credible

`src-tauri/src/teams_mirror/windows_adapter.rs:781-855` currently:

1. enumerates primary and secondary taskbars;
2. finds the preferred monitor from a usable Teams top-level window;
3. sorts that monitor first, primary second, other monitors last;
4. returns the first taskbar with one unambiguous Teams button.

Within one taskbar, identity/button/name matching is careful and ambiguity-safe
(`:1056-1246`), but cross-taskbar selection does not rank a numeric badge over a
dot. This explains the report without proving that Windows exposes a stable
numeric distinction through UI Automation.

Safe decision order:

1. collect sanitized UIA metadata for both Teams taskbar buttons on the affected
   PC (boolean/ranked facts only in final evidence; no raw labels);
2. if a stable accessible status distinguishes numeric from dot, rank
   “numeric-attention surface” first, then saved display preference, preferred
   source-window monitor, primary, and remaining displays;
3. if no stable distinction exists, add an Advanced fixed-source fallback:
   `Taskbar surface: Automatic | Display 1 | Display 2`, rather than inspecting
   pixels or guessing a count;
4. keep the numeric value visual-only unless it independently arrives through
   an already-approved semantic source contract.

Do not log monitor device identifiers publicly. A sanitized label such as
`Display 1 (primary)` is enough for user-facing selection and evidence.

### 3. Classic Outlook is three separate capabilities

Current Outlook support should not be treated as one boolean:

1. **Presence:** `attention_signals/windows_adapter.rs` checks only `olk.exe`.
2. **Activation:** `teams_mirror/windows_adapter.rs` matches only `olk.exe` for
   `AttentionAppSource::Outlook`.
3. **Unread semantics:** the current UIA capture scans non-minimized `olk.exe`
   roots for English Inbox accessibility labels and explicitly reports
   unavailable state when minimized or not exposed.

Microsoft documents `outlook.exe` for Classic Outlook and `olk.exe` for new
Outlook. Adding `outlook.exe` to bounded process matching and activation is
plausible. Reusing the new-Outlook Inbox parser without a Classic Outlook probe
is not justified: the executable, desktop UI framework, window classes, UIA
tree, localization, and minimized behavior may differ.

Recommended M10 acceptance boundary:

- identify Classic Outlook as running/not running;
- activate only a bounded, usable `outlook.exe` top-level main window;
- expose `notExposed` rather than zero when no validated unread label exists;
- add Classic unread support only if the tester provides sanitized evidence for
  open, minimized, zero-unread, nonzero-unread, and ideally non-English states;
- do not introduce Graph, MAPI account access, message content access, or an
  Outlook DWM mirror by default.

### 4. Current footprint and DWM coupling

The current layout constants in `src/widget-layout.ts` are:

- window height: 80 px; zone height: 72 px;
- app hit target: 48×48 px; DWM visual inset: 40×40 px;
- app gap: 8 px;
- clock zone: 296 px; clock numerals: 36 px;
- calendar: 304/336/432 px depending on width mode and event density;
- zone gaps: 8 px.

Calculated current widths:

| Visible sources | Calendar state | Width |
| --- | --- | ---: |
| 0 | explicit Compact calendar | 744 px |
| 2 (proposed fresh default) | Auto, one event | 888 px |
| 2 | Auto, current + next | 984 px |
| 6 (current fresh default) | Auto, one event | 1112 px |
| 6 | Auto, current + next | 1208 px |

This is cross-layer geometry. React/CSS positions app slots, while Rust uses
matching hard-coded sizes, gaps, top offsets, and insets for separate native
DWM destination windows (`teams_mirror/windows_adapter.rs:380-386,
1311-1358`). Any density change must update both sides and prove alignment at
multiple DPI scales.

Tauri 2 supports resizable windows, resize-dragging, size constraints, resize
events, and scale-factor events. Therefore mouse resize is technically possible,
but it would require continuous React layout, persisted geometry, calendar
reflow rules, native DWM destination reflow, min/max constraints, and
per-monitor DPI testing. It is not equivalent to changing `resizable` to true.

### 5. Clock timezone semantics

The primary clock currently formats without an explicit zone, and
`Intl.DateTimeFormat().resolvedOptions().timeZone` supplies the converter’s local
zone (`src/WidgetView.tsx:1035-1049`). The secondary IANA zone is stored and
normalized.

Use the name **Primary clock timezone**, not “change system timezone.” Proposed
preference:

- `primaryTimeZone: null | IANA string`;
- `null` means `System local (<resolved zone>)`;
- a stored IANA zone affects the primary clock and the clock converter only;
- it does not change Windows, ICS parsing, work-calendar event timestamps, Later
  Inbox timestamps, or notification scheduling;
- when overridden, show a short city/zone label instead of implying that it is
  the machine’s local zone.

### 6. Reminder reuse

Later Inbox already has:

- versioned Rust-owned local persistence;
- title, Work/Private scope, and optional follow-up time;
- one-shot `notifiedFollowUpAt` state;
- 30-second due polling while Attention Hub runs;
- opt-in Windows notifications;
- the explicit no-closed-app guarantee.

A time-panel reminder should be a focused entry path into that contract. It
must explain that Attention Hub must remain running for an on-time notification.
If notifications are disabled, the flow should offer to enable the existing
Later Inbox due-notification preference rather than silently saving a reminder
that cannot alert on time.

### 7. Transparency and contrast

`normalizeOpacity` and the Advanced slider both enforce 85–100%. The foreground
color algorithm tests contrast against the selected **solid** panel color, not
against the unknown desktop pixels composited behind a 25% panel. At low
opacity, guaranteed text contrast is therefore impossible without an additional
backplate, halo, or minimum effective background.

M10 may still honor 25–100% as a user-controlled appearance option, provided it:

- labels values below a chosen threshold as potentially hard to read;
- preserves fixed, opaque warning surfaces for calendar urgency;
- remains usable in Windows forced-colors/high-contrast mode;
- keeps a one-click reset to 100%;
- does not claim the current automatic foreground selection guarantees WCAG
  contrast over arbitrary wallpaper at 25%.

### 8. Settings icon hierarchy

The current ellipsis uses the same 48×48 bordered rounded square as source
icons. The bounded correction is a standard gear SVG in a transparent button:

- Comfortable density hit target: 48×48 px;
- Compact density hit target: 44×44 px;
- glyph: approximately 20–22 px;
- no persistent square fill or app-like inset surface;
- retain `aria-label`, title, keyboard focus ring, and a subtle circular/neutral
  hover state.

## Dimensioned UI alternatives

### A. Footprint strategy

#### Alternative A1 — quiet defaults only

- Keep current 80 px height, 48 px app targets, 36 px clocks, and all current
  zone widths.
- Fresh two-source width becomes 888 px normally / 984 px with current + next.
- Lowest cross-layer risk, but it does not answer the height/icon-size complaint
  and existing all-source users remain at 1112–1208 px.

#### Alternative A2 — Comfortable + Compact presets (**recommended**)

- Preserve current Comfortable geometry for migrated users.
- Make Compact the proposed fresh-install density:
  - window 68 px high; zones 60 px high;
  - app/Later/gear hit targets 44×44 px;
  - live DWM surface 36×36 px;
  - app gap 6 px; 10 px left/right outer padding;
  - clock zone 280 px; numerals 30 px;
  - calendar 304 px for one event / 392 px for current + next;
  - zone gaps 6 px.
- With Teams + Outlook + Later + gear, target width is 810 px normally and
  898 px with current + next.
- With all six sources, target width is 1010 px normally and 1098 px with
  current + next.
- Exact constants remain subject to rendered screenshot validation at 100%,
  125%, and 150% scale; do not silently shrink below 40 px pointer targets.

#### Alternative A3 — continuous mouse drag scale

- Expose a 16×16 resize affordance.
- Dynamic range would interpolate roughly between Compact and Comfortable:
  68–80 px high and, for two sources, 810–984 px wide depending on calendar
  density; all-source range is roughly 1010–1208 px.
- Requires resizable Tauri configuration, dynamic constraints, resize and
  scale-factor listeners, saved size, content breakpoints, and live Rust DWM
  destination reflow.
- Highest regression risk and least deterministic across mixed-DPI monitors.
  Defer unless council evidence shows two presets cannot satisfy testers.

### B. Primary clock timezone control

#### Alternative B1 — Advanced-only setting plus shortcut

- Add a full-width Advanced control (minimum 280 px) with System reset and IANA
  validation.
- Add a 20×20 globe button beside the primary clock label that opens/focuses
  that Advanced control.
- Safest and clearest, but not a one-click in-widget change.

#### Alternative B2 — compact native select plus Advanced setting (**recommended**)

- Add a 20×20 globe/select beside the primary clock label.
- Quick list: System plus the existing curated zones and recently chosen value.
- Advanced retains the full validated choice and explanatory scope.
- Native select can open beyond the fixed-height WebView without introducing a
  clipped HTML popover. The visible label changes from `Local` when overridden.

#### Alternative B3 — separate timezone popover

- Add a 280×240 on-demand popup window with search and recent zones.
- Most discoverable for a large IANA catalog, but introduces another window,
  focus-return behavior, positioning, and lifecycle surface. Not recommended for
  M10 unless curated/native selection proves inadequate.

### C. Time-panel reminder entry

#### Alternative C1 — focus the existing Later Inbox form (**recommended**)

- Add a 20×20 bell action to the clock zone.
- Open the existing 360×420 Later Inbox window with create mode focused and a
  follow-up time prefilled (proposed: next quarter-hour).
- Keep Work/Private choice, title validation, storage, notification preference,
  and one-shot semantics in one place.

#### Alternative C2 — inline quick editor

- Temporarily replace the clock zone with a 280×60 editor containing time,
  scope, minimal title, Save, and Cancel.
- Faster, but very dense at Compact size and duplicates validation/error UI.

#### Alternative C3 — dedicated reminder popup

- Open a new approximately 320×220 reminder window.
- Cleaner than inline editing but creates a new surface around an existing data
  model. Only consider if focused Later Inbox is judged too heavy.

## Recommended bounded M10 scope

### M10A — low-risk community polish

1. Quiet fresh/reset source defaults: Teams + Outlook, with Teams live visual.
2. Preserve existing schema-v2 user source selections; add explicit migration
   tests.
3. Add Compact/Comfortable density presets using Alternative A2; Compact only
   becomes the fresh default after screenshot acceptance.
4. Replace the app-like ellipsis with the standalone accessible gear.
5. Expand opacity to 25–100% with truthful readability guidance and reset.
6. Add the primary clock timezone override using Alternative B2.
7. Add the clock reminder shortcut using Alternative C1 and the existing Later
   Inbox notification lifecycle.
8. Rename/restructure Advanced source controls so they clearly say which fixed
   apps are shown, monitored, visually mirrored, and currently detected. Do not
   enumerate arbitrary taskbar applications.

### M10B — evidence-gated Windows compatibility

1. Reproduce M10-002 on the colleague’s dual-monitor PC using sanitized
   metadata; implement accessible-status ranking or a per-display fallback only
   after the evidence gate.
2. Add bounded Classic Outlook process detection and activation.
3. Add Classic Outlook unread semantics only after a sanitized UIA contract is
   demonstrated across the required states. Otherwise report `notExposed`
   truthfully and document the remaining limit.

M10B should not block shipping M10A unless the branch/release strategy chooses
one combined beta. It must not turn into a generalized taskbar or Outlook
provider framework.

## Dependencies and risks

- New defaults and Compact density jointly determine first-run width. Validate
  them together, not as isolated screenshots.
- Compact density changes shared React/CSS and native Rust DWM geometry.
- Primary clock override needs preference normalization/migration and conversion
  tests, but must not leak into calendar semantics by accident.
- Quick reminder depends on Later Inbox notification opt-in and running-app
  lifecycle copy.
- Teams cross-taskbar ranking depends on what Windows/Teams exposes on the
  affected machine; do not design from a screenshot alone.
- Classic Outlook presence/activation is smaller than Classic Outlook unread
  semantics; keep separate acceptance gates.
- Low opacity can make text unreadable against unknown desktop content.
- Any “detected apps” UI must remain bounded to the six fixed source keys and
  must not expose private taskbar/window titles.

## Explicit non-goals

- Arbitrary taskbar-app enumeration, pinning, activation, or mirroring.
- OCR, screenshots, badge-pixel inspection, or semantic counts inferred from
  DWM visuals.
- Microsoft Graph, MAPI account aggregation, message access, notification-body
  access, or new calendar providers.
- A second reminder database/scheduler or closed-app reminder guarantee.
- Continuous drag-resize in the recommended M10 scope.
- Autostart, Hub tray lifecycle, updater, signing, installer changes, telemetry,
  cloud sync, or unrelated provider work.

## Acceptance evidence required after approval

### Automated

- TypeScript/Vite production build.
- Preference tests for missing, malformed, legacy, current, customized, reset,
  density, primary timezone, and 25%/100% opacity values.
- Layout tests for 0, 2, and 6 visible sources; one-event and dual-event calendar;
  both densities; exact target widths.
- Timezone conversion tests for System, explicit IANA zones, invalid zones, day
  rollover, and nonexistent DST times.
- Later Inbox tests proving quick-created reminders use the same validation,
  storage, and one-shot due state.
- Rust unit tests for Classic/new Outlook executable matching and bounded window
  candidate selection.
- Extracted pure ranking tests for multi-taskbar Teams selection before native
  integration.
- All Rust targets, strict Clippy, formatting, source hygiene, and diff checks.

### Manual installed/runtime

- Screenshots on 1366×768 laptop and 2560×1440 display at 100%, 125%, and 150%
  Windows scale where available: Comfortable/Compact, two/all sources,
  one/current+next calendar.
- DWM mirror alignment after density change, source reorder, source toggle,
  monitor move, DPI change, badge appearance/disappearance, and taskbar reflow.
- Keyboard order, visible focus, accessible names, 200% text/zoom tolerance,
  reduced motion, and forced-colors checks.
- Opacity preview at 25%, middle value, and 100% over light, dark, and mixed
  desktop backgrounds; verify warning and reset.
- Primary clock System/override/reset and converter behavior without changing
  calendar event times.
- Quick reminder: notifications disabled/enabled, due once, edited time re-arms,
  private title not exposed in notification, app closed at due (no false
  guarantee), and overdue notification after next run if that existing behavior
  is retained.
- Teams dual-taskbar test on the affected PC with number vs dot, source window
  moved between monitors, and taskbar-display preference changes.
- Classic Outlook open, minimized/tray-resident, activated, zero unread, nonzero
  unread, and unavailable states. Do not claim semantic support for states not
  actually observed.

## External primary-source research

- Microsoft documents Classic Outlook as `outlook.exe` and new Outlook as
  `olk.exe`: <https://support.microsoft.com/en-US/Office/lifecycle/command-line-switches-for-microsoft-office-products>
- Microsoft confirms new and Classic Outlook can run side by side:
  <https://support.microsoft.com/en-us/outlook/getstarted/run-new-outlook-and-classic-outlook-side-by-side>
- Windows supports taskbars on multiple displays:
  <https://support.microsoft.com/en-us/windows/experience/personalization/customize-the-taskbar-in-windows>
- DWM thumbnails are source/destination window relationships; the destination
  must be the desktop or owned by the registering process:
  <https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmregisterthumbnail>
- Tauri 2 exposes `setResizable`, `startResizeDragging`, `setSizeConstraints`,
  `onResized`, and `onScaleChanged`:
  <https://v2.tauri.app/reference/javascript/api/namespacewindow/>
- WCAG contrast is evaluated against the actual background behind text; varying
  backgrounds may require shading or a halo:
  <https://www.w3.org/WAI/WCAG22/Techniques/general/G145.html>

## Questions for council reviewers

1. Does the M10A/M10B split keep the milestone bounded, or should any M10A item
   be deferred? Identify the smallest safe cut, not a wish list.
2. For dual-taskbar Teams, what non-pixel, privacy-safe Windows/UIA property can
   rank a numeric-badge taskbar surface over a dot? If none is reliable, is the
   per-display fallback the correct product behavior?
3. For Classic Outlook, what can be truthfully supported using bounded process,
   window, and UIA state? Separate presence, activation, visual mirror, and
   semantic unread capabilities.
4. Audit the Compact dimensions against the current CSS and Rust DWM constants.
   Point out any clipping, target-size, locale, DPI, or calendar-control issue.
5. Is the primary clock timezone scope correctly isolated from work-calendar
   and reminder timestamps? If not, propose precise copy and data-contract
   changes.
6. Is focusing the existing Later Inbox form enough for a “small reminder” flow,
   or is there evidence that a dedicated compact entry surface is worth its
   lifecycle and accessibility cost?
7. Does 25% opacity need an additional safety mechanism beyond warning + reset?
   Avoid claiming contrast that cannot be measured over arbitrary wallpaper.
8. Find missing migration, privacy, lifecycle, native cleanup, accessibility, or
   installed-smoke evidence. Reject generalized provider, OCR, Graph, and
   closed-app reminder scope unless the feedback supplies new evidence and the
   user explicitly selects it.

## Required council response format

Create a separate Markdown response in this directory. Suggested filename:
`review-<agent-name>.md`.

Return:

1. **Verdict** — is the proposed boundary decision-ready?
2. **Adopt** — concrete items supported by repo/primary-source evidence.
3. **Modify** — valid concern with a smaller or safer implementation.
4. **Reject/defer** — speculative, overbuilt, unsafe, or out-of-scope items.
5. **Defect analysis** — Teams dual-taskbar and Classic Outlook separately.
6. **UI choice** — select A1/A2/A3, B1/B2/B3, and C1/C2/C3, with dimensions.
7. **Missing acceptance evidence**.
8. **Unresolved questions for the user** — only decisions that materially change
   scope or behavior.

Do not make application changes. Another council round will compare only new
deltas, and Codex will converge the responses against the live repository
before asking the user to approve any implementation.
