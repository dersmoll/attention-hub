# Milestone 3A review: Attention-first daily-use panel (Fable)

- Date: 2026-08-11
- Reviewer role: senior product/feasibility review — discussion only, no implementation
- Reviewed proposal: `docs/milestones/milestone-3/milestone-3a-attention-first-daily-use-panel.md`
- Grounding consulted: `docs/vision.md`, `docs/architecture.md`, ADR 0004/0007/0008,
  `docs/milestones/evidence/m0/2026-08-10-source-transition-validation.md`,
  `docs/milestones/evidence/m0/2026-08-10-teams-taskbar-dwm-reflow.md`,
  `src/App.tsx`, `src-tauri/src/attention_signals/{mod.rs,windows_adapter.rs}`
- Related prior audit: `docs/council/2026-08-10-teams-taskbar-badge-dwm-mirror-audit-fable.md`

---

## 1. Is this the most valuable next milestone?

**Yes — with one structural cut: remove the Teams DWM mirror from 3A entirely.**

Compared with the alternatives:

- **Calendar** is blocked on three independent fronts (stale `AppointmentStore`,
  foreground-only companion, org-gated Graph). Any calendar work now is
  speculation about an approval Attention Hub does not control. Reject.
- **Platform/lifecycle** (tray, autostart, installer, persisted settings) builds
  distribution for a product whose core hypothesis — "does this panel help the
  user decide what needs attention?" — is still untested. vision.md's own
  principle ("add capability only after real daily use demonstrates value")
  forbids this ordering. Reject.
- **Standalone reliability hardening** optimizes without a target. The panel
  *is* the instrument that will reveal which reliability problems matter
  (startup UIA transient, staleness, source flapping). Fold it into 3A. Agree
  with the proposal here.
- **3A** is the only option that produces decision-grade evidence about the
  product itself. It is also cheap: every input signal already exists end-to-end.

However, the proposal as written is **two milestones wearing one coat**: (a) a
UI reorganization of proven signals, and (b) first product integration of the
DWM mirror. (b) is the largest hidden cost and the only part with an unresolved
architecture boundary — ADR 0008 itself says retention "requires a separate
architecture/product decision," and the mirror's only implementation today is a
native diagnostic example with a 100 ms polling tracker that earned a
*qualified* pass and a user-visible wrong-icon flash. Cutting (b) makes 3A
small, safe, and honest. Details in §3.

---

## 2. Adopt / Modify / Reject

### Adopt

- Proven source-owned signals become the primary experience; debug/spike
  evidence moves to a collapsed, always-reachable section. This directly fixes
  the current inversion where paused Graph/calendar evidence leads the screen
  (`App.tsx` renders Graph environment first, attention signals ~line 627).
- Source semantics stay separate: Telegram's two numbers, Outlook's aggregate
  Inbox count, Teams' boolean. No universal "unread" number.
- Known zero ≠ unavailable ≠ failed ≠ stale as first-class UI states.
- Complete snapshots as source of truth; non-overlapping refresh (the existing
  `setTimeout`-chain pattern in `App.tsx` is already correct).
- "Do not remove technical evidence merely to simplify the UI" — collapsed
  `<details>` disclosure is the right cost level.
- The dogfood framing and the 5-working-day log with false
  positives/negatives/friction.
- The stop condition: if the panel doesn't help, stop before calendar/lifecycle.

### Modify

1. **Admit the required contract change instead of implying it.** The proposal
   promises per-source `ok / zero / unavailable / failed / stale` cards, but the
   implemented contract has no per-source status at all: absence is expressed as
   signal omission plus English snapshot-level diagnostic strings
   ("Telegram is not running with an accessible top-level window.",
   `windows_adapter.rs`). React cannot derive per-source availability without
   parsing prose, which is fragile and violates the normalized-boundary
   principle (ADR 0001). 3A must include **one bounded DTO extension**: a
   per-source entry with explicit presence/availability (e.g.
   `sourceState: ok | zeroInferred | notRunning | signalNotExposed | error`),
   emitted for the fixed set {telegram, outlook, teams} on every snapshot, with
   no new probing behavior. The proposal's claim that staleness "does not change
   the Rust adapter" is true only for staleness; the rest of the state model is
   an adapter change and should be scoped honestly.

2. **Fix the "all clear" reachability bug in the state rules.** The proposed
   per-source rules say Telegram attention is "unknown" unless both numbers are
   known zero — but the M0 evidence shows Telegram's *zero representation is the
   disappearance of the counter* (the trailing title counter and badge vanish;
   the adapter then emits no counter signal). Under the proposed rules, a
   running, fully-read Telegram is permanently "unknown," so the banner can
   never reach `all clear`. Encode the validated semantics instead: Telegram
   running + readable title + no trailing counter = **inferred zero** (the
   evidence file explicitly validated this as the zero state). Label it
   `zero (inferred)` on the card if honesty demands, but let it satisfy
   all-clear. The same reasoning applies to Outlook: "labels found, no explicit
   unread count" is currently summed to zero — that is also an inference and
   needs the read-to-zero transition test the M0 evidence already flagged as
   missing.

3. **Make staleness a modifier, not a top-level state that hides attention.**
   The proposed precedence (failed > unavailable > stale > needs-attention >
   all-clear) discards the most valuable information at exactly the wrong
   moment: if the last good snapshot said "needs attention" and refreshes then
   start failing, the banner shows only `stale`. Model the banner as two
   dimensions: **last-known attention state × freshness**, rendered as e.g.
   `Needs attention (stale — 12:31)`. A stale panel must never show an
   unqualified `all clear`; it may and should show a qualified last-known
   `needs attention`. See §5 for revised rules.

4. **Show source coverage in the all-clear banner.** `All clear — 3/3 sources
   read` vs `All clear — 2/3 (Teams unavailable)`. This is the cheapest defense
   against the proposal's own top risk (false reassurance) and stronger than
   relying on the user to scan per-card states.

5. **Handle the known startup transient explicitly.** M0 evidence records a
   "known recoverable first-request UI Automation error." The banner must not
   flash `failed` during startup if the next refresh succeeds; require N (=2)
   consecutive failures before the failed banner, while still surfacing the
   error in the technical section immediately.

6. **Refresh interval: keep it a measured variable, not a redesign.** Moving
   2 s → 5 s is fine; keep the existing non-overlap invariant and add the
   visible "last captured" timestamp and manual refresh. Record in the dogfood
   log whether 5 s ever felt slow. Do not build adaptive refresh.

### Reject

- **The Teams DWM mirror inside 3A — even as an optional toggle.** Reasons, all
  grounded in existing evidence:
  - *Boundary:* ADR 0008 explicitly requires a separate architecture/product
    decision before any product retention. The proposal acknowledges this
    (its own Modify #7) and then scopes the mirror in anyway. If the ADR
    exception is a precondition, the honest structure is: write ADR 0009 first,
    then run a separate mini-milestone (3B). Keep preconditions out of the
    milestone that depends on them.
  - *Technical shape:* a DWM thumbnail is composed by DWM into a **native
    top-level destination window**, above that window's own content. "A small
    44×48 px crop shown next to the activity line" inside a React card is not
    how the primitive works — it means either a separate floating native window,
    or positioning a DWM-composed rect over the WebView2 surface and keeping it
    aligned with a DOM element through scroll/resize/DPI changes, with
    undocumented z-order between the thumbnail and WebView2's own composition
    visuals. That is real engineering with its own failure modes, not a toggle.
  - *Quality:* Phase 2's tracker is a 100 ms UIA revalidation loop that earned a
    "qualified visual-fallback pass" with a user-visible wrong-icon flash, and
    the event-driven alternative crashed with `STATUS_HEAP_CORRUPTION`. Putting
    a 100 ms poll inside a panel whose other stated budget is "idle CPU < 1%,
    5 s refresh" undermines the milestone's own resource criteria.
  - *Value:* the mirror duplicates a badge already visible on the taskbar; its
    marginal value versus the proven `activityStatus` boolean is unknown, while
    its cost is the largest in the proposal. Dogfood the boolean first — the log
    will show whether "Teams: new activity" without a count actually hurts.
- **Deriving any count from the mirror** (OCR/pixel interpretation) — already a
  hard constraint; affirmed.
- **Provider framework, new sources, calendar/Graph reopening, tray/autostart/
  installer/persisted settings/design system** — affirmed as out of scope.
- **Removing or burying technical evidence** beyond one collapsed disclosure —
  affirmed; do not move it to a separate route.
- **Real-time reflow event architecture** — affirmed (crash evidence, ADR 0008).

---

## 3. Minimum useful primary-panel information architecture

Readable in one glance in a small window; no routes, no tabs. Three zones:

```
┌──────────────────────────────────────────────┐
│ ● Needs attention          12:34:02  [Refresh]│   ← banner: state × freshness × coverage
├──────────────────────────────────────────────┤
│ Telegram        app counter 3 · unread chats 2│   ← fixed-order source cards
│ Outlook         inbox unread 1                │
│ Teams           new activity                  │
├──────────────────────────────────────────────┤
│ ▸ Technical evidence (M0–M2A)                 │   ← single collapsed disclosure
└──────────────────────────────────────────────┘
```

**Banner (one line):** attention word + freshness qualifier + coverage count.
Examples: `All clear — 3/3 · 12:34:02`, `Needs attention — Telegram`,
`Needs attention (stale since 12:31)`, `Unavailable — no sources readable`,
`Failed — see diagnostics`.

**Source cards (fixed order, always all three present):**

- Name + per-signal values on one line each. `—` / `not exposed` where the
  source is running but doesn't expose the value; `not running` when absent.
- A single per-card state word only when not `ok`: `not running`,
  `not exposed`, `error`, `stale`.
- One short meaning line per card (existing `meaning` strings are adequate;
  keep the Outlook English-label caveat visible here, since a non-English
  Windows silently degrades that source).
- Teams card: `New activity` / `No new activity` / `not running`. No count, no
  mirror in 3A.

**Collapsed technical section:** the existing Graph environment, calendar
access/snapshot, notification comparison, raw signal table, and all
diagnostics, unchanged, inside one `<details>`. Nothing deleted.

That is the whole panel. Anything beyond this (icons, colors beyond one
attention accent, animation, layout polish) is not required to answer the
dogfood question.

---

## 4. Rules for overall state

Two orthogonal dimensions, then a display mapping — not a single five-value
precedence ladder.

**Dimension 1 — freshness of the snapshot pipeline:**

- `fresh`: last refresh succeeded and is younger than the staleness threshold
  (5 minutes is fine for a 5 s loop; even 3× the refresh interval would work —
  pick one and record it).
- `stale`: last *successful* snapshot is older than the threshold, or the most
  recent refresh failed but an older successful snapshot exists.
- `failed`: ≥ 2 consecutive refresh failures (absorbs the known recoverable
  first-request UIA error) or no successful snapshot has ever completed.

**Dimension 2 — attention, computed from the most recent successful snapshot:**

- `needs_attention`: any source has needs-attention true.
- `all_clear`: every *readable* source reports known-or-inferred zero /
  no-activity, and at least one source was readable.
- `unavailable`: no source was readable (all not-running / not-exposed).

**Display mapping:**

| freshness | attention | banner |
| --- | --- | --- |
| fresh | needs_attention | `Needs attention — <sources>` |
| fresh | all_clear | `All clear — n/3 sources read` (never claim 3/3 when it isn't) |
| fresh | unavailable | `Unavailable — no sources readable` |
| stale | needs_attention | `Needs attention (stale since <t>)` |
| stale | all_clear / unavailable | `Stale — last state <state> at <t>` (no unqualified all-clear) |
| failed | any | `Failed — diagnostics in technical section` (+ last-known state at `<t>` if one exists) |

**Per-source rules (encoding the validated semantics):**

| source | needs attention | known/inferred zero | unavailable / not exposed |
| --- | --- | --- | --- |
| Telegram | app counter > 0 **or** unread chats > 0 | running + readable title + no trailing counter → `zero (inferred)` — this *is* Telegram's validated zero representation | not running → `not running`; running but window title unreadable → `not exposed` |
| Outlook | explicit Inbox unread sum > 0 | Inbox labels found, no explicit unread count → `zero (inferred)`, pending the read-to-zero transition test | not running → `not running`; running, no English Inbox label → `not exposed` (localization caveat shown) |
| Teams | notification-area label = New activity | label present without activity marker → `no new activity` | icon/label absent → `not running` / `not exposed` |

Inferred zeros count toward `all_clear`. If that later proves wrong in dogfood,
the fix is adapter semantics, not banner precedence.

---

## 5. Missing acceptance criteria, risks, and manual tests

### Acceptance criteria the proposal is missing

1. **Outlook read-to-zero transition** (already flagged as untested in the M0
   evidence): mark the Inbox fully read and verify the card moves to
   `zero (inferred)` and the banner can reach all-clear. Without this,
   `all clear` rests on an unvalidated inference.
2. **Telegram badge-setting variation:** with Telegram's counter/badge setting
   disabled by the user, the card must show `not exposed` rather than a false
   zero, and the banner must not claim 3/3 coverage. (If the adapter cannot
   distinguish this from real zero, record that honestly as a known limitation
   in the card's meaning line — do not silently fold it into zero.)
3. **Startup transient tolerance:** the recoverable first-request UIA error must
   not produce a `failed` banner if the second refresh succeeds; it must still
   appear in diagnostics.
4. **Contract test for the DTO extension:** per-source state is explicit data
   across IPC, never parsed from diagnostic prose; the fixed three sources are
   present in every snapshot.
5. **No regression of existing evidence commands:** Graph environment, calendar
   access/snapshot, and notification commands still function inside the
   collapsed section (they remain the record of paused work).
6. **Banner coverage honesty:** all-clear with a partially-readable source set
   must display the reduced coverage count.

### Risks the proposal underweights

1. **Inference drift is now product-visible.** Debug tables tolerate wrong
   nulls; a daily-use banner converts every adapter inference (Telegram title
   parsing, Outlook English-label summing) into potential false reassurance.
   Mitigation: the inferred-zero labeling plus the two transition tests above.
2. **The single-file refactor.** `App.tsx` is ~876 lines; reorganizing it while
   preserving all evidence sections risks silent drops. Mitigation: acceptance
   criterion 5 plus the technical-evidence manual test.
3. **Unknown-state fatigue.** If Teams sits at `not exposed` for days (e.g.
   after a Teams update changes the notification-area label), the user habituates
   to a permanently degraded banner and stops trusting it. The dogfood log
   should explicitly track "days with any source degraded."
4. **The 5-minute staleness threshold vs the 5-second loop** — a refresh loop
   that fails for 5 minutes has failed ~60 times. Consider surfacing stale much
   earlier (3 missed refreshes) while keeping the 5-minute wording for the
   snapshot-age case; measure in dogfood.

### Manual tests to add (beyond the proposal's list)

1. Outlook read-to-zero transition (see above).
2. Telegram with badge/counter setting disabled.
3. Start the panel with all three apps closed, then open them one at a time;
   verify each card transitions `not running → ok/zero` without restart.
4. Kill and restart Explorer (taskbar recreation) and verify the Teams
   notification-area signal recovers on a later snapshot without app restart.
5. Let the machine sleep/resume; verify the banner shows stale then recovers on
   the next successful refresh.
6. Startup transient: cold-start the panel and confirm no `failed` flash.

### Manual tests to drop from the 3A list

- Mirror reflow and mirror hide-on-doubt tests (move to 3B with the mirror).

---

## 6. Scope that should be deferred

Agree with the proposal's deferral list (tray/autostart/installer, persisted
settings/themes/design system, secondary taskbar, reflow events, new sources,
calendar, adaptive refresh, production polish), plus:

- **The entire Teams DWM mirror integration → Milestone 3B**, gated on a prior
  ADR 0009 that explicitly grants or denies the observer-boundary exception for
  re-displayed source pixels, and that decides the destination-window
  architecture (separate native window vs over-WebView composition) before any
  UI work. 3B should also define the mirror's resource budget separately,
  because its 100 ms revalidation loop cannot honestly live under 3A's
  "no polling beyond the 5 s snapshot" posture.
- **Any UIA event-driven refresh** (property-change subscriptions) — the
  `STATUS_HEAP_CORRUPTION` result applies caution to the snapshot pipeline too,
  not just the mirror.
- **Outlook localization generalization** (non-English Inbox labels) — surface
  the caveat in 3A; fix it only if dogfood shows it matters on real machines.

---

## 7. Revised bounded milestone proposal

### Milestone 3A — Daily-use attention panel (dogfood, no mirror)

**Goal.** Reorganize the existing React screen so the three proven source-owned
signals are the compact primary experience, with honest state semantics, and
run five working days of dogfood to decide whether the signal set is useful —
before any mirror, calendar, Graph, or lifecycle work.

**In scope.**

1. One bounded contract extension: explicit per-source state
   (`ok / zeroInferred / notRunning / signalNotExposed / error`) for the fixed
   set {telegram, outlook, teams}; no new probing behavior; no diagnostic-prose
   parsing in React.
2. Primary panel: banner (attention × freshness × coverage), three fixed source
   cards with separated semantics and meaning lines, manual refresh, visible
   last-captured timestamp.
3. State rules per §4, including inferred-zero semantics, stale-as-modifier,
   ≥2-failure threshold for `failed`, and coverage-honest all-clear.
4. 5-second non-overlapping refresh loop (existing pattern, retimed).
5. Collapsed technical-evidence disclosure preserving all existing M0/M1/M2A
   sections and diagnostics unchanged.
6. Manual test pass: proposal's tests 1–4, 6–7 plus §5 additions (Outlook
   read-to-zero, Telegram badge-disabled, staggered app startup, Explorer
   restart, sleep/resume, startup transient).
7. 5-working-day dogfood log: false positives, false negatives, friction,
   days-with-degraded-source, and whether the 5 s interval ever felt slow.

**Out of scope.** DWM mirror in any form (→ 3B after ADR 0009); calendar/
Graph/Entra; exact Teams count/OCR/pixel interpretation; new sources or
provider framework; tray/autostart/installer/persisted settings/themes/design
system; secondary taskbar; UIA event subscriptions; adaptive refresh;
production polish.

**Success criteria.**

1. Every per-source case in the accuracy matrix (not running / zero-inferred /
   nonzero / not exposed / error) renders correctly and distinctly.
2. Banner transitions match §4's table in manual testing, including
   zero→nonzero within one refresh cycle and all-apps-closed → `unavailable`.
3. No semantic conflation anywhere (no Teams number, no merged Telegram
   counter, no "unread messages" relabeling).
4. All existing technical evidence remains reachable without leaving the panel.
5. Idle CPU < 1% and no monotonic memory growth over 5 minutes with the 5 s
   loop; no overlapping snapshots under manual-refresh spam.
6. Dogfood log covers ≥ 5 working days and names the most common false
   positive, false negative, and friction pattern.

**Stop condition.** If dogfood shows the panel does not change what the user
checks or trusts — or produces false reassurance that state clarity cannot fix —
stop: do not proceed to 3B (mirror), Milestone 4 (lifecycle), or any calendar
work. If dogfood specifically shows the Teams boolean is the pain point, that
is the evidence that justifies opening ADR 0009 for the mirror, with cost now
justified by observed need rather than assumed value.
