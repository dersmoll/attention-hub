# M21 audit brief — School calendar source and school-day reading

> **This is the brief for a cross-agent audit, not the audit itself.**
> Reviews belong in sibling files named
> `2026-09-07-m21-school-calendar-audit-<agent>.md`.

- **Date:** 2026-09-07
- **Branch under review:** `codex/m21-school-calendar-source`
- **Base:** `main` at `1ccb036` (green CI)
- **Size:** 15 non-merge commits, 23 files, ~2,180 insertions
- **State:** not merged, no pull request open, not released
- **Plans:** [School mode](../plans/school-mode.md),
  [M21](../plans/m21-school-calendar-source.md),
  [M20](../plans/m20-daily-polish.md)

> **Superseded in part.** A cross-audit on 2026-09-07 requested changes; see
> [the audit](2026-09-07-m21-school-calendar-audit-codex.md) and
> [the response](2026-09-07-m21-school-calendar-audit-response.md). Three claims
> in this brief were wrong and are struck through or corrected in place. Its
> "nothing is blocked on code" conclusion is **withdrawn**.

## Ground rules for the reviewer

1. **Verify every claim against the source and cite `file:line`.** Several
   claims in the original School draft did not survive that check — including
   the `RANGE=THISANDFUTURE` blast radius, which the draft understated as "the
   entire series" when it discards the entire feed.
2. **Do not accept this brief's assertions.** It is written by the agent that
   wrote the code. Where it says "verified", check what was actually verified.
3. **Distinguish deliberate decisions from defects.** The
   [Known limits](#known-limits-accepted-deliberately) section lists choices
   already made and documented; re-reporting them as findings is noise. Arguing
   a decision was *wrong* is welcome, but engage with the stated reasoning.
4. **Privacy is a hard constraint.** No real publication URL, school name,
   child identity, lesson time, or joining link may enter any document, test,
   diagnostic, or review. If a finding needs an example, use a fabricated one.

## Background: what changed, and why the plan moved

The School plan assumed the lesson calendars would come from **the children's
Microsoft Outlook accounts**. Step 0 established that they cannot: the children
sign in with *personal* Microsoft accounts, which offer no calendar publishing,
and a personal Microsoft account publishes **only its default calendar**, so one
parent account cannot publish a separate calendar per child either.

The confirmed source is a **parent-owned Google calendar per child**, read via
each calendar's secret iCal address. The children have no Google account and the
calendars are not shared with them. **The school publishes no feed of its own** —
every schedule and joining-link change arrives by messenger and is transcribed
by the parent, by hand.

Step 0's decisive measurement: **feed propagation is under 30 seconds** (four
consecutive samples). With the 120 s app poll, a parent's edit reaches both
laptops in roughly 2.5 minutes. That closes what plan §5 called a gap "no
amount of override correctness closes", and demoted the per-occurrence
joining-link override from the foundation of Step 1 to a later fallback.

## What M20 was, and one thing to check

M20 (already merged, `4db78a1`) covered truthful Medicine loading states,
join-token reliability, urgency-based attention allocation, and draft-safe
overflow navigation. It is **not** under review here except for one point:

**M20's own note warns that its join-token occurrence identity is deliberately
*not* the reschedule-stable recurrence anchor a persistent per-occurrence
override needs.** An ephemeral token dying because its occurrence moved is
correct. Please check that nothing in M21 conflates the two.

`occurrence_key` (`src-tauri/src/work_calendar/mod.rs`) is the token identity;
`event_workspace_key` / `recurring_series_key` in the same file are the
persistent workspace identity. They are different things by design.

## What M21 does

### 1. Google accepted as a published ICS source — `1f66548`

`validate_published_url` hardcoded one `(host, path)` pair for two Microsoft 365
hosts. It is now a bounded provider table (`PUBLISHED_ICS_PROVIDERS`).

Framed as an explicit scope decision, not a relaxation: the host list bounds
*which* hosts may be fetched and nothing more. The guards that make the fetch
safe are provider-independent and unchanged — blocked redirects (`Policy::none()`
plus an explicit 3xx failure), no referer, HTTPS-only, no credentials, no query
or fragment, port 443, and the connect/total timeouts and size, line and event
caps. Path shapes are per provider and **not** interchangeable, so a Google path
on a Microsoft host is rejected and vice versa.

`outlook.live.com` remains rejected deliberately: personal Microsoft accounts
cannot publish a secondary calendar, so they cannot serve a per-child feed.

`docs/decisions/README.md` item 5 was updated, since the provider set is no
longer Microsoft-only.

**Worth checking:** whether the path-shape rules are tight enough, and whether
any guard actually *was* host-dependent in a way this brief has missed.

### 2. Warn-and-preserve on source change — `f5108fa`

Workspace keys derive from a digest of the saved publication URL
(`calendar_source_scope`), so pasting a different URL silently disconnected
every calendar association. Nothing was deleted; associations simply stopped
matching, with no explanation.

`save_source` now reads the outgoing credential **before** overwriting it,
because the previous scope cannot be recovered afterwards. A genuinely different
scope raises a prompt with two explicit choices; re-pasting the identical URL
still changes nothing.

**A constraint that shaped the design:** `WorkspaceBinding` stores only the
hashed `event_key`, and the series UID is not recoverable from it, so keys
cannot be rewritten directly. Carry-over therefore goes through the live feed,
which supplies each UID. To make that cover a subject with no lesson today,
`semantics` now reports the distinct non-private series across the **whole
expansion window** (`SeriesIdentity`, 31 days back / 366 forward) rather than
just today's selections. Those UIDs are `skip_serializing` and do not cross IPC.

The carry-over is additive and never overwrites an existing binding, so
declining, an unreadable feed, or an outright wrong decision all lose nothing. A
zero result is reported as zero rather than as success.

**Worth checking:** the additive merge in
`workspace::carry_over_calendar_associations`; whether an old association could
reach an unrelated lesson; and whether reading the credential before the probe
widens any window where the secret is in memory.

### 3. Report associations that match no lesson — `81f8193`

A Google "this and following" edit splits a series and gives the remainder a new
UID. Since the workspace key derives from `series_uid`, that subject's
materials, notes and homework detach with no error — the quieter hazard that
replaced `RANGE=THISANDFUTURE` for Google sources.

Saved bindings are compared against every series in the feed's expansion window.
The count is `None` — not zero — when the feed produced no keys, so an
unreachable calendar cannot report every association as detached at once.

It reports that something detached and deliberately **does not claim why**: a
subject whose lessons simply ended is indistinguishable from a split.

**Worth checking:** false-positive rate over a school year, since a subject that
finished more than 31 days ago will read as unmatched indefinitely.

### 4. Date-only `RRULE` `UNTIL` — `3d72253`

**A real bug, found in real use, not in the planned scope.** A 26-series
timetable failed to load entirely while a small test calendar succeeded.

Google exports a recurrence whose end was chosen as a *date* as a bare
`UNTIL=YYYYMMDD` alongside a TZID-qualified `DTSTART`. RFC 5545 §3.3.10 requires
`UNTIL` to be UTC when `DTSTART` carries a zone, the `rrule` 0.14 parser enforces
that, and the reconstructed-RRULE parse in `recurrence_set` turns any parse
failure into `UnsupportedRecurrence`. Reproduced directly:

```
kiev tzid + utc until + byday:  OK
kiev tzid + DATE-only until:    FAIL
kiev tzid + local until:        FAIL
```

**This is the whole-feed blast radius in practice**: one recurrence end typed as
a date discarded all 26 subjects.

Fixed by normalising a local or date-only `UNTIL` to UTC before parsing. A
date-only value is read as the **end** of that day in the series time zone;
reading it as midnight parses cleanly but silently drops the final occurrence —
for a timetable, the last lesson of term.

**Worth checking:** the DST-ambiguity fallback (`resolved.single()` then
`.earliest()`), whether end-of-day is the right reading, and whether any other
reconstructed-RRULE shape still fails.

### 5. Truthful stop-reason messages — `10b1d4c`, and a correction in `58959c6`

Only five stop reasons had messages; everything else fell through to "bounded
verification did not complete successfully", which reads as a connection failure
and sent the user hunting for a broken link. The clearest case was
`noEligibleEvent`: the calendar was fetched and parsed correctly and simply had
no upcoming events.

**Note the process failure here.** My first `unsupportedRecurrence` message
asserted "this and following events" as the cause. **Six** distinct conditions
raise that reason. The message now states the blast radius instead of guessing.

### 6. School-day reading — `ca6625f`, `38c65bb`, `1005e9f`, `58959c6`

`src/school-day-model.ts` derives the day's state: a lesson running, a break,
before the first lesson, the schedule finished, no lessons, or `unknown`. Wording
lives in a separate `summarizeSchoolDay` so the rules can be tested without
asserting on prose.

Two plan constraints drive it:

- **Stale data must never masquerade as a break or a finished day.** Both are
  *absences* of a scheduled lesson, and an absence is precisely what a stalled
  refresh looks like. `unknown` is a first-class result, returned for any
  non-observed snapshot and anything older than three poll intervals.
  **Corrected 2026-09-07:** a snapshot captured in the future is *clamped to
  zero age and treated as fresh*, not rejected — the original wording implied
  rejection. The model also never checks **which day** `daySelections` describe,
  which the audit's F3 identifies as a defect.
- **Progress describes the schedule, not attendance.** Cancelled lessons and
  all-day entries are excluded, so a cancelled lesson is neither reported as in
  progress nor counted in "Lesson 3 of 8". Nothing infers attendance.

**A correction mid-implementation, worth knowing about.** The first version
rendered a new band inside the widget's calendar zone. That zone has a fixed
height and switches to two columns when a next event shows, so the extra row
broke the layout. The product partner reported it. School mode now substitutes
**one string** — the status pill (`2 of 3`, `Break`, `Day starts`, `Day ended`,
`No lessons`) — and changes no geometry. The label is `null` for `unknown`, so
the existing "Calendar checking" and retry wording stands, because that wording
says *why* and no school label could.

**Worth checking:** the staleness threshold; overlap handling; and whether the
pill can outgrow its container (a test pins labels to ≤ 11 characters).

### 7. School vocabulary — `f944dcf`

`src/calendar-vocabulary.ts` holds every school/work wording difference in one
lookup, per plan §6's requirement to centralize rather than scatter mode
conditionals. Covers the widget calendar band and the Today popup. The popup is
a separate window with no access to preferences, so the widget sends
`schoolMode` in its payload.

Tests fail if a school string contains meeting/call/work, if a work string
contains lesson/timetable/school, or if any field other than `startingSoon`
reads identically in both modes.

### 8. A minimal mode preference — `38c65bb`

`schoolModeEnabled`, defaulting off and staying off through migration, so no
existing work calendar starts being narrated as a school day because the app
updated. This is **only** the flag the reading needs to be truthful — not plan
Step 4's setup-time Work/School preference.

## Current state

### Verified

- **Automated:** `pnpm test` 17 suites, `pnpm run build` (`tsc` + vite),
  `cargo fmt --check`, `cargo test --all-targets` 108 passed / 0 failed,
  `cargo clippy --all-targets --all-features -- -D warnings`. Run in the order
  `.github/workflows/validate.yml` uses.
- **In the running app, by the product partner:** both children's real Google
  calendars load, including the 26-series timetable that exposed the
  date-only `UNTIL` bug. School mode has been toggled on and the layout
  regression was found and fixed this way.

### Not verified

- **The source-change prompt and the unmatched-association notice have never
  been seen on screen.** Both require a configured source to be replaced, which
  no automated test exercises end to end.
- The school-day states other than whatever was live when the partner looked.
  The break wording and the post-last-lesson state are specifically unconfirmed.
- Human visual review and the installed upgrade gate, for both M20 and M21.
- No release. `v0.6.0-beta.12` is still the latest.

### Carried as inference, not fact

**That Google never emits `RANGE=THISANDFUTURE`.** Step 0 inferred this from an
`UNTIL` truncation observed on a series-level *delete*; a "this and following"
*edit* was never successfully tested. The partner's real timetable has 26
separate UIDs with no overrides, so it proves nothing either way.

This matters because the same agent was **wrong about Google's export behaviour
once already today** — the date-only `UNTIL` was not predicted. Treat the
inference with corresponding suspicion. A fixture would settle it.

## Known limits, accepted deliberately

Please engage with the reasoning rather than re-reporting these as new.

1. **The previous source scope is session state.** `PendingSourceChange` lives
   in `WorkCalendarState`, not on disk, so restarting before resolving a source
   change loses the automatic carry-over. The bindings survive untouched.
   Persisting it means a workspace schema change, which M20 deliberately
   deferred.
2. **Carry-over only covers series present in the feed.** A subject whose
   lessons have ended, or a temporarily unreachable feed, is not carried. This
   is why it runs on an explicit action against a fresh fetch rather than
   silently during save.
3. **Saving a source requires a current or upcoming event.** So a calendar
   cannot be connected before its events are entered, or during a school
   holiday. An already-saved source keeps working. Two options were offered to
   the partner and not yet chosen.
4. **`RANGE=THISANDFUTURE` support is still absent** and still fails the whole
   feed. Believed unreachable from a Google source; still live for the parent's
   Outlook work calendar.
5. ~~"Meeting started" is unchanged in School mode.~~ **Withdrawn 2026-09-07:
   false.** `calendar-vocabulary.ts` supplies "Lesson started" and
   `WidgetView.tsx:2623-2624` uses it. The claim was stale the moment the
   vocabulary commit landed.
6. **`summarizeSchoolDay` is currently unused.** It is tested and correct, and
   is intended for the day panel, which is not height-constrained the way the
   band is. Not dead by accident.
7. **Unmatched-association counting will accrue false positives** over a school
   year, as noted in §3 above.

## Process failures this session, stated plainly

An auditor should know where the judgement was poor, not just where the code is.

1. **M20 was merged with red CI.** I ran `cargo test` before merging but not
   `cargo fmt --check` or `clippy`, both of which M20 failed. `main` was broken
   until [PR #20](https://github.com/dersmoll/attention-hub/pull/20). The fix
   also converted a runtime `assert!` over two constants into a `const`
   assertion, which is why the Rust count moved 103 → 102 there.
2. **A widget layout regression shipped to the partner**, because I added an
   element to a fixed-height zone.
3. **An error message asserted one cause out of six.**
4. **The Step 0 diagnostic reported "none present — the feed should parse"** on
   the very feed that failed. It checked four *data-shape* triggers and could
   not see a malformed RRULE value. A diagnostic covers only what its author
   thought to ask.

## Plans

### Immediate

~~Nothing is blocked on code.~~ **Withdrawn:** the cross-audit found six
contract defects and one reachable parser defect. See the response for the
proposed repair scope.

### Next milestone work, in the current intended order

1. **Confirm the Google series-split inference with a fixture.** Small, and it
   removes the one unverified assumption underneath the next step.
2. **Reliable lesson joining (plan Step 2).** Per-occurrence joining-link
   override with a reschedule-stable recurrence anchor threaded through
   candidate generation and both selection contracts. The plan's largest
   correctness risk. Justified by the parent being a single point of failure for
   every link change — but its value depends on how often a link actually
   changes mid-morning, which has **never been measured**.
3. **The rest of the school-day experience.** Gentle transition reminders
   reusing the existing meeting-start sound preference rather than a new
   subsystem; the fuller wording on the day panel; readability, keyboard and DPI
   checks on both laptops.
4. **Plan Step 4** — setup-time Work/School preference, Subjects/Materials/
   Homework presentation, quiet layout preset. The plan judges this the largest
   surface area for the smallest user value and keeps it last.

### Explicitly out of scope

Local timetable editor, non-ICS provider integrations, multiple child accounts
or separate Work/School stores, cloud synchronization, grades, attendance
tracking, attention scores, parent monitoring, distraction blocking, automatic
joining, and a full assignment-management system.

## Where scrutiny would help most

Ranked by where a defect would cost the most:

1. **The whole-feed failure mode.** One unreadable series still discards
   everything. `3d72253` fixed the shape we hit; are there others reachable from
   a Google or Outlook feed? This is the highest-consequence area in the
   milestone.
2. **Source-change carry-over correctness.** Could an old association ever
   attach to an unrelated lesson? That is the one outcome the design must never
   allow.
3. **Truthfulness of the school-day states.** Specifically that no combination
   of staleness, cancellation, all-day entries, overlaps, midnight boundaries or
   time-zone changes can produce "Today's lessons have ended" when it is not
   true.
4. **Privacy.** That no UID, publication URL or joining URL crosses IPC or
   reaches a log, snapshot or diagnostic. `SeriesIdentity` and
   `feed_workspace_keys` are new internal fields worth checking specifically.
5. **The provider table.** Whether the bounded path shapes are as tight as this
   brief claims.
