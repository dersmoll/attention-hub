# M20 — daily reliability and navigation polish

> **Status: implemented on `codex/m20-post-m19-polish`; human visual review and
> the upgrade gate are outstanding.** Not released.

- **Baseline:** `226eedf`, tagged `v0.6.0-beta.12`.
- **Preceding work:** [post-M19 polish audit](../council/2026-09-05-post-m19-polish-audit-devin.md),
  whose §11 records which of its conclusions this milestone supersedes.
- **Deliberately deferred:** performance candidates (still unmeasured), schema
  and treatment-lifecycle changes, and everything in [School mode](school-mode.md).

## Scope

Four items, in the order they were implemented. The order is deliberate: the
first is the only defect that made the app state something untrue, and it is
independent of the rest.

### 1. Truthful Medicine loading and error presentation

The popup rendered "No doses scheduled today." whenever nothing was on screen —
including while the first load was still in flight and after a load had failed.
An empty day and unreachable data read identically.

One `error` state also covered both loading failures and dose-action failures,
so the obvious three-state fix would have introduced a worse bug: a failed Take
would have replaced the day's loaded doses with an "unavailable" message.

- Load status and action errors are now separate state.
- Reporting an empty day requires a load that succeeded **and** no outstanding
  failure behind it. A refresh that fails after an empty load leaves us unable
  to assert emptiness either: the last answer was "none", but we no longer know
  whether it still holds.
- A successful load or a successful mutation clears a stale load failure;
  neither clears a failure it did not resolve.
- A refresh that fails while data is already on screen keeps the rows and says
  they may be out of date, rather than discarding them.
- Actionable failures are `role="alert"`; loading and recovery stay polite
  statuses.

### 2. Join-token reliability

`RETAINED_TOKEN_GENERATIONS = 2` retired tokens by counting snapshots, so the
lifetime of a Join button the widget was displaying depended on how often
*another* window refreshed. Two Advanced refreshes invalidated it. Raising the
count would only have moved the failure to the third refresh.

Replaced with:

- **Occurrence-scoped reuse.** A meeting still in the feed keeps the token it
  already has, keyed by source scope + series UID + occurrence start. Refreshing
  more often can now only extend a token's life, never shorten it.
- **Time-based expiry**, derived from the widget's own poll interval rather than
  chosen independently — `JOIN_TOKEN_TTL_MS = 8 × WIDGET_CALENDAR_POLL_INTERVAL_MS`.
  A TTL shorter than the holder's refresh cadence would reproduce the original
  failure from the opposite direction, so the relationship is structural, and
  `scripts/test-work-calendar-model.mjs` fails if the mirrored constant drifts
  from `WORK_CALENDAR_POLL_INTERVAL_MS`.
- **Expiry checked at redemption**, not only when a snapshot prunes, so a slept
  machine cannot leave a token redeemable indefinitely.
- **Immediate invalidation on source change**, detected from the scope stored
  alongside the tokens, instead of waiting out the TTL.
- **Bounded capacity**, evicting least-recently-seen first so the entries a
  surface is about to display are the last to go.
- A reused token follows the feed's **current** joining URL: the calendar stays
  authoritative if a meeting's link changes.

Note for School mode: occurrence identity here is deliberately *not* the
reschedule-stable recurrence anchor that a persistent per-occurrence override
will need. An ephemeral token dying because its occurrence moved is correct.
The two must not be conflated when School Step 1 is designed.

### 3. Attention allocation and interaction stability

Doses were prioritised within the visible treatments, but the visible treatments
were still `groups.slice(0, 3)` — chosen before any urgency was considered. A
fourth treatment's due dose was unreachable no matter how urgent, while three
fully-recorded treatments kept their headings.

- Treatment **membership** is now chosen by urgency across all treatments;
  **display order** is not, so the panel does not reshuffle as the day
  progresses.
- `dosePriority` ranks due/missed together, then upcoming, then recorded, with
  ties broken by the caller's existing chronological order.
- The limits (3 treatments, 8 doses) and the exactness of the `+N` count are
  unchanged.
- **Interaction stability:** the 30-second tick could move a row out from under
  a press and resize the popup around it. The rendered view — and therefore the
  window geometry, which follows it — is now held from the start of an
  activation until the action it began has settled, then the deferred update is
  applied. `pendingKey` alone was insufficient: it starts *after* activation.
  `click` also fires *after* `pointerup`, so releasing when the press ends would
  have dropped the hold for exactly the window the mutation runs in — the action
  therefore takes ownership of the hold synchronously, before its first `await`,
  and the release is deferred a task so the two batch into no repaint. Releases
  also cover a press that ends outside the window.

### 4. Contextual, draft-safe overflow navigation

`+N more` named a specific dose and then opened the manager at whatever was last
selected, leaving the user to find it.

- `openMedicineManagerAt` carries a treatment and dose, and the manager opens on
  that treatment's Today tab with the dose scrolled into view and focused.
- The target is the **most urgent hidden dose** — `hiddenItems[0]`, which both
  bounded helpers now return ordered by urgency.
- **Handshake:** `tauri://created` fires before the manager's React listeners
  exist, so the manager announces `READY` once it is listening and the opener
  sends the target then. An already-open manager is also sent it directly; a
  duplicate request id is applied once.
- **Draft safety:** navigation is refused — with a reason, not silently — when a
  medicine form, treatment form or delete confirmation is open, or when notes
  need a decision. It deliberately does **not** route through `selectTreatment`,
  which clears exactly that state when *the user* asks.
- The originating surface closes only on an acknowledged navigation; otherwise
  it stays open and shows why. A manager that never acknowledges fails on a
  timeout rather than hanging the caller.
- **The acknowledgement follows the dose reaching the screen**, not the state
  update that should put it there. The effect that scrolls and focuses the row
  owns the answer, because it is the first step that knows whether the dose is
  actually present. A target that turns out not to be in today's list is
  reported rather than acknowledged, so the popup does not close on a move that
  never finished.

## Verification

Automated: `pnpm test` (16 suites) and `cargo test` (103 tests) pass, with new
coverage for repeated refreshes of one meeting, distinct occurrences sharing a
URL, redemption-time expiry, source-change invalidation, URL refresh on reuse,
cache bounding, urgency-based treatment membership, hidden-dose ordering, the
three footer states, the freeze contract, and the navigation handshake and its
draft guards.

Not run: human visual review, and the installed upgrade gate.

## Review launcher

`REVIEW-M20-DAILY-POLISH.cmd` covers the four areas plus a corrected upgrade
gate. Its U-steps are **not** M19's: M19 shipped Medicine as a new feature, so
its U8 expected Medicine to be empty after upgrading. For beta.12 → M20 that
expectation is inverted — an empty Medicine window would now mean data loss —
and the step verifies preservation instead. M19's U10 single-instance check is
carried forward because it has still never been run.
