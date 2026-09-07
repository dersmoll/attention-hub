# M21 — School calendar source and school-day reading

> **Status: implemented and automated checks green, but a cross-audit
> requested changes on 2026-09-07. Not merge-ready. Not released.**
> See [the audit](../council/2026-09-07-m21-school-calendar-audit-codex.md) and
> [the response](../council/2026-09-07-m21-school-calendar-audit-response.md).
> Baseline: `main` at `1ccb036`, after M20 and the CI repair merged. Branch:
> `codex/m21-school-calendar-source`.
>
> | Item | State |
> | --- | --- |
> | 1. Google published-calendar support | **Done** — `1f66548` |
> | 2. Warn-and-preserve on source change | **Done** — `f5108fa` |
> | 3. UID-change detection | **Done** — `81f8193` |
> | 4. Date-only `RRULE` `UNTIL` | **Done** — `3d72253`, found in real use |
> | Truthful stop-reason messages | **Done** — `10b1d4c` |
> | 5. School-day reading (plan Step 3) | **Done** — `ca6625f`, `38c65bb`, `1005e9f` |
>
> Items 1 and 4 are confirmed in the running app against **both children's real
> calendars**, including a full 26-series timetable. Items 2 and 3 have automated
> coverage only — the source-change prompt and the unmatched-association notice
> have **not** been seen on screen.

- **Parent plan:** [School mode](school-mode.md). This milestone implements
  Step 1, and Step 3's school-day reading and calendar vocabulary, which were
  pulled forward after Step 1 landed. Step 2 and Step 4's presentation work are
  not approved.
- **Approved:** 2026-09-07, by the product partner, after Step 0 passed.
- **Preceding work:** [M20 daily polish](m20-daily-polish.md).

## Why this milestone exists

Step 0 established that the children's Outlook calendars cannot be published at
all, and replaced them with a **parent-owned Google calendar per child**. The
app accepted two Microsoft 365 hosts and nothing else before this milestone, so
**it could not read the real calendars at all**. Everything else in School mode
was blocked behind that.

The full Step 0 evidence is in [School mode §8](school-mode.md#step-0-results-2026-09-07).
The two results that shaped this scope:

- **Propagation lag is under 30 seconds.** With the 120 s app poll, a parent's
  edit reaches both laptops in ~2.5 minutes. That closes the workflow gap the
  plan called unclosable, and demotes the per-occurrence joining-link override
  to Step 2.
- **Google splits a "this and following" edit into a new UID** rather than
  emitting `RANGE=THISANDFUTURE`. Recorded as a strong inference, not a verified
  fact — see [Open questions](#open-questions).

## Scope

Three items. The first is blocking; the other two are safety work that becomes
relevant precisely because setup involves pasting several different URLs.

### 1. Google published-calendar support

`validate_published_url` (`published_ics/mod.rs:465-532`) hardcodes one
`(host, path)` pair. Replace with a bounded provider table covering the two
Microsoft 365 hosts and `calendar.google.com`.

**Explicitly a scope decision, not a quiet relaxation.** The allowlist bounds
what the app will fetch. Widening it from two Microsoft hosts to three named
provider hosts leaves every other guard untouched, and those guards — not the
host list — are what make the fetch safe:

| Guard | Where | Unchanged |
| --- | --- | --- |
| Redirects blocked (`Policy::none()`) | `mod.rs:218`, `mod.rs:259-267` | yes |
| No referer | `mod.rs:219` | yes |
| HTTPS-only, no credentials, no query or fragment, port 443 | `mod.rs:494-505` | yes |
| Path shape required | `mod.rs:515-519` | per provider |
| 5 s connect / 10 s total, 8 MiB, 250k lines, 20k events | `mod.rs:10-16` | yes |

User-facing strings that name Microsoft 365 as the only provider must change
with it: `mod.rs:524` and the input placeholder at `App.tsx:1363`.

`docs/decisions/README.md` item 5 ("One passive calendar source") stays true —
still one user-selected published ICS source — but its provider set is no
longer Microsoft-only and should say so.

### 2. Warn-and-preserve on source change

Already specified in [School mode §5](school-mode.md#source-identity-is-derived-from-the-publication-url).
The source namespace is a digest of the saved publication URL and
`SOURCE_IDENTITY_STATE` is a marker constant with no re-key path
(`work_calendar/mod.rs`), so a different URL silently disconnects every calendar
binding while leaving the records themselves intact.

Setup for two children involves pasting several URLs, so this stops being
theoretical.

#### Re-keying cannot be done from the stored key alone

Established by source inspection on 2026-09-07, and it constrains the design.

`WorkspaceBinding` stores only `event_key` (`src/workspace-model.ts:14`,
`src-tauri/src/workspace.rs:1754`). That key is a one-way digest of
`(source_scope, series_uid)` — `recurring_series_key`,
`work_calendar/mod.rs:690-696` — and `source_scope` is itself a digest of the
publication URL (`calendar_source_scope`, `mod.rs:683-688`). **The series UID is
not recoverable from a stored binding**, so old keys cannot simply be rewritten
to the new scope.

Two ways out:

- **(a) Persist `series_uid` alongside each binding.** A schema and migration
  change to a store that currently holds no such field.
- **(b) Re-key through the live feed.** At carry-over time every event in the
  feed supplies its `series_uid`, so both `digest(old_scope, uid)` and
  `digest(new_scope, uid)` can be computed and any binding found under the old
  key copied to the new one. No schema change.

**(b) was implemented**, with one consequence worth stating plainly: it can only
carry over associations for series **present in the feed at that moment**. A
subject whose lessons have finished for the term, or a feed that is temporarily
unreachable, is not carried. Carry-over therefore runs on an explicit user
action against a freshly fetched feed, not silently during save, and a zero
result is reported honestly rather than as success.

(b) also requires the *old* scope, which is computed from the stored credential
**before** `save_source` overwrites it.

To make (b) work at all, `semantics` now reports the distinct non-private series
across the **whole expansion window** (`SeriesIdentity`), not just today's
selections — otherwise a subject with no lesson today could never be carried
over. Those UIDs are `skip_serializing` and do not cross IPC.

#### Known limit: the previous scope is session state

`PendingSourceChange` lives in `WorkCalendarState`, not on disk. Restarting the
app before resolving a source change loses the ability to carry associations
over. The bindings themselves survive untouched — only the automatic match is
lost, and a user can still re-associate by hand.

Persisting it would mean a workspace schema change, which M20 deliberately
deferred. Revisit if this proves painful in daily use.

### 3. UID-change detection

New in this milestone, replacing the `THISANDFUTURE` work the draft anticipated.
A Google series split produces a new `UID`; the workspace key derives from
`series_uid` (`work_calendar/mod.rs:665-679`), so a subject's materials, notes
and homework detach with no error.

Report it rather than fixing it automatically — a new UID may legitimately be a
different lesson series, and an old association must never attach to an
unrelated one.

### 4. Date-only `RRULE` `UNTIL` (found in real use, 2026-09-07)

Not in the original scope. Found when a real 26-series timetable failed to save
while a smaller test calendar succeeded.

Google Calendar exports a recurrence whose end was chosen as a **date** as a
bare `UNTIL=YYYYMMDD` alongside a TZID-qualified `DTSTART`. RFC 5545 §3.3.10
requires `UNTIL` to be UTC when `DTSTART` carries a zone, the `rrule` parser
enforces that strictly, and the reconstructed-RRULE parse at
`semantics.rs` turns any parse failure into `UnsupportedRecurrence`.

Reproduced directly against `rrule` 0.14:

```
kiev tzid + utc until + byday:  OK
kiev tzid + DATE-only until:    FAIL
kiev tzid + local until:        FAIL
```

**This is the whole-feed blast radius in practice.** One recurrence end typed as
a date discarded all 26 subjects. It is the strongest evidence so far that the
§5 correction — whole *feed*, not whole *series* — matters more than the
original draft assumed.

Fixed by normalising a local or date-only `UNTIL` to UTC before parsing. A
date-only value is read as the **end** of that day in the series time zone;
reading it as midnight parses cleanly but silently drops the final occurrence,
which for a timetable is the last lesson of term.

Two process notes worth keeping:

- The Step 0 probe reported "none present — the feed should parse". It checked
  the four *data-shape* triggers and could not see a malformed RRULE value. A
  diagnostic only covers what its author thought to ask.
- The `unsupportedRecurrence` message initially named "this and following
  events" as the cause. **Six** distinct conditions raise that reason, so the
  message now states the blast radius instead of guessing a cause.

### 5. School-day reading (plan Step 3, pulled ahead)

Added after Step 1 landed and both real calendars were confirmed working. The
plan had put the joining-link override (Step 2) first, on the grounds that the
parent is a single point of failure for link changes. That still holds, but its
value depends on **how often a link actually changes mid-morning**, which has
never been measured; the school-day reading pays off at every transition
regardless. Step 2 is still next.

`src/school-day-model.ts` derives the day's state — a lesson running, a break,
before the first lesson, the schedule finished, no lessons, or *unknown* — plus
the child's position through the day. Wording lives in a separate
`summarizeSchoolDay`, so the rules can be tested without asserting on prose.

Two constraints from the plan shaped it:

- **Stale data must never masquerade as a break or a finished day.** Both are
  *absences* of a scheduled lesson, and an absence is precisely what a stalled
  refresh looks like. `unknown` is therefore a first-class result, returned for
  any non-observed snapshot and for one older than three poll intervals. A
  snapshot captured in the future is clock skew rather than freshness.
- **Progress describes the schedule, not attendance.** Cancelled lessons and
  all-day entries are excluded, so a cancelled lesson is neither reported as in
  progress nor counted in "Lesson 3 of 8", and nothing infers that a child
  attended anything.

Also handles overlapping lessons without offering an already-started one as
"next", and drops unparseable or backwards times rather than letting them
poison the ordering.

**A new `schoolModeEnabled` preference** gates the display, defaulting off and
staying off through migration. Plan §6 requires the schedule *reading* to be
mode-scoped even though scheduling and joining mechanics are shared. This is
deliberately only the flag Step 3 needs to be truthful — **not** the Work/School
vocabulary work, which stays a later step.

## Out of scope

- Per-occurrence joining-link overrides and recurrence-anchor threading (Step 2).
- Layout and presentation work: the setup-time Work/School preference,
  Subjects/Materials/Homework presentation, and the quiet panel preset (Step 4).
  Calendar-surface **vocabulary** was added after this section was first
  written — see item 6 — so only the presentation half remains out of scope.
- `RANGE=THISANDFUTURE` support. Still absent and still fails the whole feed.
  Still relevant to Outlook work calendars, and **believed** unreachable from a
  Google source on the strength of an unverified inference — see
  [Open questions](#open-questions).
- Non-ICS provider integrations.

## Verification

**Automated: passing.** `cargo test` 108 passed / 0 failed (from 103 at
baseline), `pnpm test` 16 suites, `tsc` and `vite build` clean, no compiler
warnings.

Covered:

- Both Google path shapes (public and secret address) accepted, alongside the
  existing Microsoft shapes and `webcal://` normalisation.
- Rejection still holds for non-HTTPS, credentialed, query present, wrong path
  shape, and unlisted hosts — including `outlook.live.com`.
- Provider path shapes are **not** interchangeable: a Google path on a Microsoft
  host and vice versa are both rejected.
- A source change is recorded only when the scope genuinely differs, and a
  second unresolved change keeps the *original* previous scope — that is the one
  still holding the associations.
- The same series keys differently under two scopes, and recurring versus single
  derivations do not collide.
- An unreadable feed reports no workspace keys and therefore **no** unmatched
  count, rather than orphaning every association at once.

**Not run:** human visual review, and the installed upgrade gate. Neither the
source-change prompt nor the unmatched-association notice has been seen on
screen — both are reachable only by replacing a configured source, which no
automated test exercises end to end.

**Confirmed in the running app:** both children's real Google calendars load,
including a 26-series timetable whose every series carries a date-only `UNTIL`.

**School-day reading:** 17 frontend suites including a new
`scripts/test-school-day-model.mjs`, covering a lesson in progress, a break,
before the first lesson, the finished day, an empty day, cancelled and all-day
exclusion, staleness, clock skew, every non-observed status, malformed times,
overlaps, and the wording for each. Not yet seen on screen.

Still worth doing before this is considered complete:

- Confirm the Google series-split inference with a fixture (see
  [Open questions](#open-questions)).
- Replace a configured calendar with a different one and check the prompt, both
  choices, and the zero-carried-over wording.
- Verify on both children's laptops with the real calendars.
- Confirm Work mode, medicine behaviour and an existing Microsoft source do not
  regress.

Builds, installed verification and human acceptance retain their separate gates.
A root-level `REVIEW-M21-SCHOOL-CALENDAR-SOURCE.cmd` is created only when manual
review scope is approved.

Use sanitized fixtures only. No real publication URL, school name, child
identity or joining link enters tests, diagnostics or committed evidence.

## Open questions

- **Does Google ever emit `RANGE=THISANDFUTURE`?** Step 0 inferred no from an
  observed `UNTIL` truncation, but did not confirm it with a "this and
  following" *edit*. Confirm with a fixture in this milestone.
- **What should a UID change tell the user?** It needs to be truthful without
  implying the app can tell a renamed series from a new one.

## Handoff notes

For anyone picking this up cold, including a cross-reviewing agent:

- The plan and its rationale live in [school-mode.md](school-mode.md); this file
  holds scope and status. Do not merge them.
- Step 0's conclusions were reached by measurement, not assumption, but the
  measurements were made against a **test** calendar with fabricated events.
  Both children's real calendars have since been read by the app successfully
  (2026-09-07), which is how the date-only `UNTIL` defect in item 4 was found.
  Neither the source-change prompt nor the unmatched-association notice has been
  seen on screen.
- Claims in these documents cite `file:line`. Verify against the source before
  relying on them; several claims in the original draft did not survive that
  check, including the `RANGE=THISANDFUTURE` blast radius.
