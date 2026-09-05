# Milestone 3A — Attention-first daily-use panel: feasibility review (kimi)

- Date: 2026-08-11
- Reviewer: senior Windows shell / DWM / UIA / Rust / Tauri feasibility reviewer
- Basis: `docs/vision.md`, `docs/architecture.md`, ADRs 0004, 0007, 0008, the
  M0 evidence set including the three DWM taskbar notes, and my earlier DWM
  audit (`docs/council/2026-08-10-teams-taskbar-badge-dwm-mirror-audit-kimi.md`).
- Companion reviews consulted: the base proposal
  (`milestone-3a-attention-first-daily-use-panel.md`) and the gemini-pro
  discussion. Where I agree with them I say so briefly and do not restate their
  arguments; this review concentrates on points they under-cover.

---

## 1. Is this the most valuable next milestone?

**Yes, with one correction to how it is framed: the deliverable is the dogfood
evidence, and the panel is the instrument for collecting it.**

Ranking against the alternatives:

- **Calendar:** correctly rejected. Three independent negative results
  (AppointmentStore stale, companion foreground-only, Graph org-blocked) mean
  any calendar milestone is speculation until the organization approves Graph
  or the user accepts a manual surface. No new information would come out of
  more calendar work now.
- **Platform/lifecycle (tray, autostart, installer, persisted settings):**
  correctly rejected, and for a sharper reason than "premature": those features
  exist to keep a panel *present*. Investing in presence before the panel's
  content is validated optimizes delivery of an unproven signal set. The
  vision doc's own gate ("add capability only after real daily use
  demonstrates value") applies to lifecycle features too.
- **Reliability hardening:** partially folded in, and I want to be precise
  about which part. The reliability work that belongs in 3A is only what the
  *state model* needs to be truthful: non-overlapping refreshes, failure and
  staleness surfacing, per-source independence. Deeper hardening (UIA event
  subscriptions, adaptive refresh, resume handling) stays deferred — the M0
  evidence already shows that path is unstable (the UIA property-change
  subscription crashed with `STATUS_HEAP_CORRUPTION`), so "hardening" done now
  would likely mean re-entering a known-crashy area without a user-value
  forcing function.

One honest caveat the other reviews understate: **3A's signal set has a known
coverage hole the size of Teams.** The single highest-attention source in the
user's stated workflow exposes only a boolean, and calendar is absent. The
dogfood log must therefore answer not just "is the panel useful" but "is the
panel useful *despite* a boolean-only Teams and no calendar" — otherwise a
negative dogfood result is uninterpretable (was it the UI, or the missing
signals?). I fold this into the acceptance criteria below.

## 2. Adopt / modify / reject

### Adopt (agree with the base proposal and gemini-pro, briefly)

- Proven signals as the primary experience; fixed card order; no routes/tabs.
- Strict semantic separation (Telegram's two counters shown as two numbers,
  Teams as boolean, no universal "unread").
- The five-state model (needs attention / all clear / stale / unavailable /
  failed) as first-class UI states, not hidden nulls.
- Collapsed technical section retaining all M0–M2A evidence in place.
- Complete snapshots + non-overlapping refresh preserved; no incremental
  per-source React timers.
- All listed exclusions (Graph, calendar, OCR, provider framework, tray,
  autostart, persistence, design system).

### Modify

**M1. The Teams mirror must be gated on the ADR 0008 product-retention
decision, and that decision is a 3A entry criterion — not a task inside 3A.**
ADR 0008 is explicit: "Retaining a live source-pixel mirror as product
behavior requires a separate architecture/product decision even if a later
crop spike succeeds." The base proposal (its item 7 under Modify) notices this
but treats it as a precondition to "record." I'd go further: the exception ADR
(0009) must be *accepted before any integration code is written*, and 3A's
scope must name two variants up front — "3A with mirror" and "3A without
mirror" — so a rejected exception doesn't sink the milestone. If the council
cannot accept the exception, the milestone proceeds without the mirror and the
mirror question is closed, not parked. My earlier audit's Q1 reasoning stands:
the mechanism is observer-compatible (process-owned destination, no pixels, no
input), but it *presents* source-rendered content inside Attention Hub chrome,
which is a product-line decision, not a feasibility finding.

**M2. Resolve the mirror-refresh contradiction explicitly.**
The base proposal simultaneously says (a) "no real-time reflow tracking, hide
on ambiguity and await explicit refresh" and (b) inherits a Phase 2 diagnostic
whose only working recovery mechanism is **100 ms UIA revalidation polling**.
Those are different products:

- *Explicit-refresh-only mirror:* simplest, matches the "no polling" instinct,
  but after any reflow the mirror is simply wrong until the user refreshes —
  Phase 1 proved a static crop shows a *neighboring app's icon* in that window.
  In a persistent daily panel, "wrong until manually refreshed" is worse than
  "briefly wrong during movement."
- *Polling mirror:* follows reflow with a user-accepted ~100–250 ms wrong-icon
  flash, but introduces a 100 ms loop into a panel whose stated idle budget is
  <1% CPU. Phase 2 never measured CPU or memory for that loop; it only
  measured per-transition work (35–153 ms, which at 100 ms cadence is a
  *substantial* duty cycle, not a rounding error).

Neither option is obviously compliant with the milestone's own resource
budget. My recommendation: **revalidate on the panel's existing snapshot tick
(5 s) plus explicit refresh, hide-on-any-ambiguity, and measure.** This makes
the worst-case stale-crop window 5 s — longer than the Phase 2 flash, but the
panel already tells the user the data is sampled, and it reuses one clock
instead of adding a second one. If dogfood shows the 5 s staleness is
unacceptable, *that* is the evidence needed to justify a faster loop — not
the other way around. Whichever option is chosen, the milestone must record
it, its measured CPU cost while the mirror is visible, and the
unregister-on-toggle-off/on-close lifecycle (the base proposal's risk 6 is
right; promote it to an acceptance criterion).

**M3. Fix the banner precedence for partial failure.**
The base proposal's rule 4 says "needs attention" applies only when "neither
failed nor unavailable nor stale conditions apply." Read literally, that means:
Outlook adapter throws, Teams shows genuine new activity → banner is *not*
"needs attention." That is the worst possible outcome — a real, fresh, known
attention signal suppressed because an unrelated source failed. Correct rule:

- `needs attention` = at least one **fresh** source reports attention,
  *regardless of other sources' health*, with a degraded marker (e.g.,
  "needs attention · 1 of 3 sources unavailable").
- `all clear` = all *reachable* sources are fresh and report zero, **and** no
  source is failed/unavailable/stale. If any source is unhealthy and none
  reports attention, the banner is the health state (`unavailable`/`stale`/
  `failed`), never `all clear`.
- Principle: **positive evidence of attention outranks absence of evidence;
  absence of evidence never produces "all clear" unless the evidence base is
  complete and fresh.** This also resolves the gemini-pro review's "partial
  failure" test case unambiguously.

**M4. Replace "readable in ≤ 3 seconds" with a testable proxy.**
Unmeasurable as written. Concrete version: in a spot check after ≥ 1 day of
not looking at the panel, the user can answer "which sources need attention
right now, and is the data fresh?" within ~3 s, three times out of three. Also
require that state is conveyed by text/icon, not color alone — this is one
line of CSS/discipline, not a design system, and it prevents the most common
way these panels fail.

**M5. Keep the collapsed section's expand/collapse state stable across
snapshot refreshes.** gemini-pro flagged this; I second it and promote it to
an acceptance criterion, because a panel that re-collapses the evidence
section on every 5 s tick will train the user to stop trusting the tool
during debugging — the exact scenario the section exists for.

**M6. Record the refresh-interval change as an experiment, not a setting.**
The 2 s → 5 s change is reasonable, but the milestone should log how often
real transitions were visible later than 5 s (timestamps in the dogfood log).
Otherwise we learn nothing about whether 5 s was the right number and the
"measure before optimizing" principle is honored in name only.

### Reject

- **Reject including the mirror without M1's gate.** (Repeated for emphasis;
  it is the single easiest way for this milestone to accidentally violate its
  own governance.)
- **Reject any "health score" or numeric aggregation across sources** (e.g.,
  total badge sum). The sources have incommensurable semantics; a sum would
  be the exact conflation ADR 0004 warned about, one level up.
- **Reject per-source configurable ordering/visibility in 3A.** Fixed order is
  correct; configurability is persisted-settings work in disguise.
- **Reject silent fallback from "source not running" to any cached value.**
  There is no persistence in 3A, so this shouldn't be possible — but say it,
  because the collapsed technical section still shows old snapshots and the
  primary panel must never quietly borrow from them.
- **Reject adding the notification/toast signal to the primary panel.**
  Keep it in the technical section. M0 evidence already showed toast presence
  ≠ unread state; promoting it now would re-litigate a settled finding.

## 3. Minimum useful primary-panel information architecture

Agree with the base proposal's three-band structure (banner / source cards /
collapsed technical evidence). I would tighten it to the minimum that still
answers the product question:

```text
┌─────────────────────────────────────────────┐
│ ● Needs attention · 1 unavailable  12:34:02 │  ← banner: state + freshness + [Refresh]
├─────────────────────────────────────────────┤
│ Telegram      app 3 · chats 2               │  ← both numbers, labeled, never summed
│ Outlook       inbox 12                      │
│ Teams         new activity   [mirror □]     │  ← boolean word, not a count;
│                                             │    mirror toggle only if ADR 0009 accepted
├─────────────────────────────────────────────┤
│ ▸ Technical evidence (M0–M2A)               │  ← collapsed, state-stable (M5)
└─────────────────────────────────────────────┘
```

Minimum requirements beyond the base proposal:

1. **The banner always carries the freshness timestamp** (already in the
   proposal) — and the timestamp, not the state color, is the trust anchor.
2. **Each card shows its own health inline** (`—` / `unavailable` / `stale`),
   because the banner is an aggregate and aggregates lie by omission (M3).
3. **A one-line meaning caption per source stays** — this is the cheapest
   defense against semantic drift over weeks of dogfood.
4. **Nothing else.** No counts of counts, no sparklines, no per-source
   refresh buttons (one refresh button for the whole snapshot, preserving
   atomicity).

## 4. Rules for overall state (revised)

Evaluate the latest complete snapshot in this order. A source is *fresh* if
its read succeeded within the staleness threshold (5 min proposed; fine).

1. **failed** — the refresh itself errored such that *no* source snapshot is
   trustworthy. Cards show per-source state; banner says `failed`.
2. **needs attention** — any fresh source reports attention (Telegram either
   counter > 0; Outlook inbox > 0; Teams activity true). Degraded marker if
   any other source is failed/unavailable/stale. *(This is M3: positive
   evidence outranks partial failure.)*
3. **stale** — no fresh attention, and (last successful snapshot older than
   threshold ∨ any source's last-good read older than threshold). Never show
   `all clear` from stale data, even if last-known values were zero.
4. **unavailable** — refresh succeeded, but no source produced a readable
   signal (apps closed, access denied). Distinct from `all clear`; the
   banner must say *why* ("no sources reachable").
5. **all clear** — all reachable sources fresh and zero/false, **and** zero
   sources unhealthy. The strictest state, not the default.

Tie-breaking note: with rules 2–5 ordered this way, "partial failure + one
zero source" lands on `unavailable`/`stale`, not `all clear`. That is
intentional — `all clear` is a claim about the world, and the panel should
only make claims it can back.

## 5. Missing acceptance criteria, risks, manual tests

### Acceptance criteria to add (beyond the base proposal's eight)

- **AC-9 (mirror gate):** If the mirror ships, ADR 0009 (product-retention
  exception) is accepted *before* integration, and the milestone evidence
  links it. If not accepted, the Teams card ships without the toggle and the
  milestone is still complete.
- **AC-10 (mirror refresh policy):** The mirror revalidates on the snapshot
  tick + explicit refresh only (or whichever M2 option is chosen); measured
  idle CPU with the mirror *enabled and visible* stays < 1% over 60 s; the
  thumbnail is demonstrably unregistered on toggle-off and on app close
  (log the unregister call).
- **AC-11 (partial-failure precedence):** With Outlook forced to fail and
  Teams activity true, the banner shows `needs attention` with a degraded
  marker — never `unavailable`, never `failed`, never `all clear`.
- **AC-12 (state legibility):** Every state is distinguishable by text alone
  with color removed (grayscale check).
- **AC-13 (section stability):** Expand the technical section, wait ≥ 3
  refresh cycles, confirm it stays expanded and its contents update in place.
- **AC-14 (dogfood interpretability):** The dogfood log records, per day:
  false positives, false negatives, *and* moments where the needed signal was
  simply not representable (Teams boolean too coarse, calendar absent) — so a
  negative result is attributable (Section 1 caveat).
- **AC-15 (DPI):** Panel renders correctly at the user's actual mixed-DPI
  multi-monitor setup (the product's motivating environment). Not a design
  audit — just "text isn't clipped at 150%."

### Risks to add

- **R-8 (mirror wrong-icon window is longer in product than in the spike).**
  Phase 2's accepted flash assumed 100 ms revalidation. If M2's 5 s tick is
  adopted, the wrong-icon exposure window grows to up to 5 s + discovery time.
  The user accepted ~150 ms; 5 s is a different psychological object — it is
  long enough to be *noticed and read*. Hide-on-doubt must therefore trigger
  on the *same tick that detects* the change, before re-show. Record the
  user's reaction in dogfood; if the wrong-icon sightings are annoying, that
  is evidence for either faster revalidation (with measured CPU) or dropping
  the mirror.
- **R-9 (survey effect).** A 5-day dogfood log kept by the developer who
  built the tool is biased toward forgiveness. Mitigation: predefine the stop
  condition's thresholds *before* day 1 (base proposal's stop condition is
  qualitative; make it countable, e.g., ">2 false 'all clear' events or >5
  missed-transition events in 5 days = fail").
- **R-10 (Teams boolean fatigue).** If Teams activity is frequently true for
  low-value reasons, the panel trains the user to ignore the banner. This is
  a *finding*, not a defect — but only if the dogfood log separates "banner
  was wrong" from "banner was right but the signal is low-value."

### Manual tests to add

- **T-9 (partial failure precedence, AC-11):** as above.
- **T-10 (mirror toggle lifecycle):** toggle on → thumbnail registered (log);
  toggle off → unregistered (log); close app with mirror on → no lingering
  registration (relaunch and confirm clean re-register).
- **T-11 (grayscale pass, AC-12).**
- **T-12 (section persistence across refreshes, AC-13).**
- **T-13 (mirror staleness observation):** with mirror on the 5 s tick, force
  a reflow and record the observed wrong-icon duration against the R-8
  expectation.

## 6. Scope to defer

Agree with the base proposal's list; add three items it didn't name:

- **Mirror auto-recovery beyond the chosen refresh policy** (faster polling,
  event re-attempts). Revisit only on dogfood evidence of R-8.
- **Any banner sound/flash/taskbar-overlay affordance for "needs attention."**
  Interruption mechanics are exactly what the vision doc says the product is
  *not*; if dogfood shows the panel is missed when it matters, that is a
  separate milestone with its own review.
- **Formalizing the five-state model in the Rust contract.** For 3A the state
  derivation can live in the frontend on top of the existing
  `AttentionSignalSnapshot`; promoting it to a native enum is contract work
  that should wait until dogfood confirms the five states are the right five.

## 7. Revised bounded milestone proposal

### Milestone 3A — Daily-use attention panel (dogfood instrument)

**Goal.** Answer, with 5 working days of logged daily use: *does a compact,
persistent panel of the proven source-owned signals help the user decide what
needs attention — and is the answer attributable when it doesn't?*

**Entry criteria (new).**
1. ADR 0009 (mirror product-retention exception) is accepted or explicitly
   rejected. Outcome selects scope variant A (with mirror toggle) or B
   (without); both variants are shippable milestone definitions.
2. The dogfood log template and the *countable* stop thresholds (R-9) are
   written before the first line of UI code.

**In scope.**
1. Three-band panel per Section 3: state banner with freshness timestamp,
   fixed-order cards (Telegram two numbers, Outlook inbox count, Teams
   boolean), collapsed in-place technical evidence section (M0–M2A intact).
2. Five-state derivation per Section 4, implemented in the frontend over the
   existing complete-snapshot contract; non-overlapping 5 s refresh loop with
   visible last-captured time; manual refresh that cannot overlap.
3. State legibility without color; per-card health states.
4. Variant A only: session-only, default-off mirror toggle in the Teams card,
   with the M2 refresh policy, hide-on-doubt, and logged
   register/unregister lifecycle.
5. Five-working-day dogfood log with the AC-14 fields.

**Out of scope.** Everything in the base proposal's exclusion list, plus:
mirror auto-recovery improvements, interruption affordances, native
five-state contract formalization, per-source configuration.

**Pass criteria.** The base proposal's seven, amended: AC-9 through AC-15,
plus the countable dogfood thresholds from R-9.

**Stop condition.** The countable thresholds trip, **or** the log shows the
panel's failures are dominated by unrepresentable signals (Teams boolean,
missing calendar) rather than UI clarity — in which case the correct next
milestone is a *signal-coverage* decision (reopening the Graph/org-approval
question with dogfood evidence in hand), not more UI work and not lifecycle
polish.

**Why this is bounded.** One window, three sources, five states, one optional
gated control, one log. The only genuinely new technical surface is the
frontend state derivation; everything else reuses proven adapters and
diagnostics. The two things most likely to silently expand scope — the mirror
and the refresh policy — are pinned by entry criterion 1 and M2 respectively.
