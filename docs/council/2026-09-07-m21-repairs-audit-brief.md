# M21 repairs — brief for a second cross-audit

> **This is a brief, not an audit.** Reviews belong in sibling files named
> `2026-09-07-m21-repairs-audit-<agent>.md`.

- **Date:** 2026-09-07
- **Branch:** `codex/m21-school-calendar-source`
- **Range under review:** `2dfb252..HEAD` — the four repair commits plus two
  documentation commits. **`2dfb252` is exactly what the first audit reviewed**,
  so everything before it has already been examined and is not in scope.
- **Size of the delta:** 18 files, ~1,510 insertions / ~384 deletions
- **Prior round:** [audit](2026-09-07-m21-school-calendar-audit-codex.md),
  [response](2026-09-07-m21-school-calendar-audit-response.md)

## Why a second pass

The first audit found seven findings in code that had passed its automated
gates. Repairing them changed **more than the first audit reviewed** — the
semantic contract, the save flow, and the snapshot shape all moved. A hit rate
of seven on the first pass, over a smaller delta, is the argument for looking
again rather than merging on green tests.

`cargo test` 114 passed (from 108), 17 frontend suites, `tsc`, `vite build`,
`cargo fmt --check`, `cargo clippy --all-targets --all-features -D warnings` all
clean. Those gates were also clean when the seven findings existed.

## Ground rules

1. **Verify against source and cite `file:line`.** Do not accept this brief.
2. **The first round's findings are closed** unless a repair reintroduced or
   half-fixed one. Re-reporting F1–F7 as new is noise; showing that a repair
   does not actually hold is exactly the point.
3. **Deliberate limits are listed below.** Argue a decision was wrong if you
   think so, but engage with the stated reasoning.
4. **Privacy is a hard constraint.** No real publication URL, school name,
   child identity, lesson time or joining link in any file. Fabricate examples.

## What changed, and where to look hardest

### R1 — `0f0345c`: a read feed with nothing upcoming is a success

`extract_current_or_next` no longer fails when no candidate is active or
upcoming. `SemanticScan.selection` became `Option<EventSelection>`, and
`SemanticFailureReason::NoEligibleEvent` and
`PublishedIcsStopReason::NoEligibleEvent` were **removed** rather than left as
reasons nothing can produce.

Two new facts travel with the snapshot:

- `viewer_day` — the viewer-local `YYYY-MM-DD` the day list describes, cleared
  when the feed was not read.
- `day_selections_complete` — recorded *before* the 24-entry truncation.

Also implements a product decision: `save_source` no longer requires a
current-or-next selection, so a calendar can be connected during a holiday.

**Look hardest at:** whether making `selection` optional left any consumer
assuming it is present; whether removing the two enum variants broke a
serialized contract the frontend still expects; whether `viewer_day` is cleared
on every path that fails to read; and whether accepting a selection-less save
weakened verification in a way the comment does not admit.

### R2 — `ddd7ad3`: one day-validity contract (F1, F3, F4)

New `calendarDayState()` in `src/school-day-model.ts` returns
`verified | loading | unavailable | incomplete`, and `selectSchoolDayState`
defers to it instead of repeating the guards. The Today popup payload carries
`dayState`, and `TodayPopupView` has distinct wording per state.

`selectSchoolDayState` changed signature to an options object taking `nowMs`,
`viewerToday` and `displayedStart`. The ordinal is now derived from the
displayed occurrence, falling back to the backend's descending-start tie-break.

`viewerToday` is computed by `viewerLocalDate(now, systemTimeZone)` using the
**host system zone**, to match `iana_time_zone::get_timezone()` on the Rust
side. It is deliberately *not* `primaryTimeZone`.

**Look hardest at:** whether the Rust and TypeScript notions of "today" can
still disagree (different zone sources, DST boundaries, a zone the host reports
that `chrono_tz` accepts but `Intl` does not, or the reverse); whether
`viewerLocalDate`'s fallback on an unrecognised zone can silently produce a
date that never matches; whether treating `incomplete` as `unknown` hides a
lesson that is genuinely running; and whether `displayedStart` matching by
start string alone can mis-match two lessons that begin at the same instant.

### R3 — `32a7ef5`: warn before replacing (F5, F6)

`save_source` takes a `SourceReplacement` decision — `AskFirst`,
`ReplaceAndCarryOver`, `ReplaceAndKeepSeparate`. With `AskFirst`, a URL that
verifies but replaces a *different* saved source is reported back and **not
written**. The candidate URL is discarded rather than held; the frontend
re-submits what the user typed with an explicit choice.

`PendingSourceChange` is **deleted**. Scopes are read and used inside the same
gate as the write, and the resulting key pairs land in `completed_remap`, a slot
`take_completed_remap` can drain only once. `lib.rs` applies it immediately
after the save that produced it.

F6: the unmatched-association wording was narrowed to "not in use by this
calendar" and names all three causes, including preserved history. Old bindings
are still never deleted; per-binding provenance is deferred.

**Look hardest at:** whether the frontend can now leave a verified-but-unsaved
URL sitting in state longer than the old design held it, and whether that is
worse for secret exposure than what it replaced; whether an unrecognised
`replacement` string can reach a write path (it is meant to fall back to
`AskFirst`); whether `completed_remap` can be populated by one save and drained
by a *different* concurrent command; whether a failed credential write can leave
a remap queued; and whether the narrowed F6 wording is now so hedged it fails to
communicate a real detachment.

### R4 — `612d231`: an explicit UTC timezone is not an absent one (F7)

`recurrence_set` takes `calendar_timezone_declared`, threaded from
`default_timezone.is_some()`, so `X-WR-TIMEZONE:UTC` no longer reads as a
missing zone. An undeclared zone still refuses a recurring all-day event.

The date-only `UNTIL` test was rewritten: it now counts occurrences either side
of the boundary (four remaining lessons, three if `UNTIL` moves a week earlier)
rather than asserting the rewritten string, and adds a DST case. The original
test's comment was wrong — its Monday rule ended on a Thursday.

**Look hardest at:** whether `default_timezone.is_some()` is the right proxy for
"declared" in every path that reaches `recurrence_set`; whether a per-event
`TZID` should also count; and whether other reachable shapes still fail the
whole feed. Two were found in one day, so treat the bounded-contract claim as
unproven rather than as settled.

## Deliberate limits — please argue, do not merely re-report

1. **`incomplete` is treated as `unknown`.** A truncated day could still show a
   lesson running now, but its total and its emptiness would both be guesses.
   Describing part of a day as if it were whole is the failure the contract
   exists to prevent, so it describes none of it. Over-strict, deliberately.
2. **Carry-over still only covers series in the current feed**, because a stored
   binding holds a one-way digest.
3. **Old bindings are never deleted**, so a successful carry-over leaves history
   the unmatched count cannot distinguish from a real detachment. Fixed by
   narrowing the claim, not by provenance.
4. **`RANGE=THISANDFUTURE` support is still absent** and still fails the whole
   feed.
5. **`summarizeSchoolDay` remains unused.** It is tested, and intended for the
   day panel, which is not height-constrained the way the band is.
6. **School mode changes one string in the widget** — the status pill — because
   the band has a fixed height. A test pins pill labels to ≤ 11 characters.
7. **Unmatched counting still accrues false positives** for subjects that ended
   more than 31 days ago.

## State of evidence

**Verified in the running app by the product partner, after the repairs:**
Section C of the review launcher (the confirm-before-apply replacement, both
choices) and step 14 (School mode must not change the layout) both pass.

**Not verified:** step 18 — with the network down, Today must not claim there
are no lessons. This is the single most important behavioural check on the
repairs and it has **not** been run. Treat any reasoning about it as untested.

**Also outstanding:** the rest of the review launcher, human visual review, and
the installed upgrade gate. Not merged, no pull request, not released.
`v0.6.0-beta.12` remains the latest release.

**Still an inference, not a fact:** that Google never emits
`RANGE=THISANDFUTURE`. Unchanged by these repairs.

## Process notes from this round

Offered because they bear on where to look.

1. I twice ran `git add docs/` and swept in five files that were untracked
   before this session and are not mine. The first time I had already pushed and
   un-tracked them in `18430e9`; the second I caught it before committing. Those
   five are untracked on disk, as they were.
2. My first attempt at the F7 reproduction mangled `semantics.rs` through Python
   string escaping and had to be restored from the index. Nothing survives from
   that, but it is why a scratch test appears and disappears in the history.
3. The strengthened `UNTIL` test failed on its first run because I asserted
   against `next_selection`, which returns the next occurrence after the test
   clock rather than the final one. It now counts candidates instead.

## Where scrutiny would help most

1. **The Rust-to-TypeScript day contract.** `viewer_day` is produced in Rust and
   compared in TypeScript against a separately derived date. If those can ever
   disagree, the timetable reads as unknown all day — a silent, total failure
   that no automated test here would catch.
2. **The `AskFirst` write barrier.** Confirm no input reaches a credential write
   without an explicit decision.
3. **`completed_remap` lifetime.** One producer, one consumer, single drain —
   confirm that holds under concurrent commands.
4. **Remaining whole-feed failure shapes.** The highest-consequence area in the
   milestone, and the one where the bounded claim has now been wrong twice.
5. **Privacy of the new fields.** `viewer_day` crosses IPC as a date;
   `series_identities` and `feed_workspace_keys` should not cross at all.
