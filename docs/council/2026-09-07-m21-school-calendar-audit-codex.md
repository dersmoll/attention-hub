# M21 cross-audit — Codex

Date: 2026-09-07. Reviewed HEAD: `2dfb252890c4919e8d8809ed7d2491fb398e1b3f`, branch `codex/m21-school-calendar-source`.

## Verdict

**REQUEST CHANGES before calling M21 merge-ready.** The direction is sound: one published ICS source, native-only calendar secrets, additive association recovery, an opt-in school reading, and restrained widget geometry. However, “nothing is blocked on code” is not supported by this checkout. The new reading assumes a complete, current-day timetable, while the existing backend and popup contracts do not guarantee one. Source-change bookkeeping also has two concrete defects.

This is an audit and proposed repair scope, not implementation approval. Application code, settings, credentials, and existing artifacts were left unchanged. This report is the only added file.

## Baseline and evidence

- M21 was compared with `1ccb036`, which is an ancestor of HEAD and includes the M20 CI repair. The local `main` ref is still `cc3e58b`; do not confuse that older local ref with the brief's reviewed base. No remote fetch, PR lookup, or current remote CI verification was performed.
- At the start, Git reported `src-tauri/Cargo.toml` modified, but its content diff was empty. Existing untracked installers, launchers, plans, design files, `.claude/`, and sounds were preserved.
- **Executed here:** all 17 frontend test scripts named by `package.json`'s test chain, using installed Node directly; `tsc --noEmit`; `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`. All passed.
- Independent reviewers inspected the calendar backend, school UI, and a bounded set of inherited M20 contracts. Findings below were checked against current source. In-memory probes of the actual TypeScript models confirmed the midnight and overlap cases; they used fabricated events and wrote no fixture files.
- **Not executed here:** frontend/Tauri builds, Rust tests, Clippy, app launch, screenshot/DPI/keyboard review, installed upgrade/single-instance tests, or private calendar access. The brief's 108 Rust tests and live-calendar observations remain attributed prior evidence, not checks repeated by this audit.

## Required corrections

### F1 — P1: Today can say “No lessons today” when the timetable is unavailable

**Evidence:** `src/today-popup-model.ts:10-28` carries selections and presentation but no calendar status, capture time, or day validity. `src/WidgetView.tsx:2190-2203` turns a missing list into `[]`; the update path at `2786-2805` does the same. `src/TodayPopupView.tsx:335-337` renders `vocabulary.emptyDay` whenever that list is empty.

**Trigger/result:** a failed/unavailable calendar snapshot clears its day list; opening or updating Today then shows “No lessons today.” The widget may simultaneously say the timetable is unavailable. This is an inherited empty-state weakness made consequential by School mode, not a new parser failure. It also affects Work wording.

**Repair:** carry explicit load/freshness/day validity into Today. Only a successful, complete snapshot for the displayed day may establish an empty day. Distinguish loading, unavailable, stale retained data, and a verified empty timetable.

**Acceptance:** unavailable, initial loading, and failed refresh after empty/successful data never assert emptiness; genuinely empty current-day data does. Exercise the payload/render contract, not just the vocabulary lookup.

### F2 — P2: A valid timetable without a future event is treated as unreadable; completeness is also unrepresented

**Evidence:** `src-tauri/src/published_ics/semantics.rs:283-303` constructs today's events but truncates the list to 24 before School mode filters cancelled/all-day entries. At `337-342`, no active/upcoming candidate returns `NoEligibleEvent`, discarding the already-derived day list and series identities. `src-tauri/src/work_calendar/mod.rs:721-734` requires a selection for `Observed` and clears the day list otherwise.

**Trigger/result:** after the last occurrence of a finite timetable ends, the next successful fetch becomes unavailable. An already-connected empty/finished timetable cannot receive a fresh, truthful `dayEnded`/`noLessons` state. This extends beyond the acknowledged *saving during a holiday* restriction. Separately, a day with more than 24 entries can lose later lessons and make the school's total/end state false; excluded all-day or cancelled entries consume the cap too.

**Repair:** separate successful feed/day parsing from the existence of a current/next selection. Keep bounded payloads, but expose completeness (or calculate the school summary before presentation truncation). Incomplete data must not support definitive totals, an empty day, or day-end claims. The decision whether to allow saving an empty calendar can remain a separate setup decision.

**Acceptance:** finite final teaching day after its last lesson; verified empty calendar; ordinary day with tomorrow's event; unavailable feed; >24 entries including excluded entries. Verify the Rust-to-TypeScript contract, not only hand-constructed observed snapshots.

### F3 — P2: Snapshot age does not establish the current school day, and future timestamps are accepted

**Evidence:** `src/school-day-model.ts:93-104` checks status and clamps negative age to zero, then consumes `daySelections` without checking which local day they describe. `scripts/test-school-day-model.mjs:160-166` actually expects a future-captured snapshot to remain usable.

**Reproduced:** fabricated snapshot captured September 7 at 23:59:30 +03:00, evaluated September 8 at 00:00:15 +03:00, returns `Day ended` from September 7's lessons. A clock rollback similarly makes future-captured data appear fresh. The brief's assertion that future captures produce `unknown` is incorrect.

**Repair:** represent/check the calendar day in the relevant viewer timezone as well as age; invalidate on day/timezone changes and reject negative age rather than clamp it. Avoid assuming that a recent capture implies today's list.

**Acceptance:** midnight before the next poll, empty yesterday followed by a populated today, backward clock adjustment, timezone change, normal fresh data, and the staleness threshold.

### F4 — P2: Overlap progress can describe a different lesson from the displayed title

**Evidence:** backend active selection prefers the latest start (`src-tauri/src/published_ics/semantics.rs:314-326`). School mode sorts ascending and selects the first active lesson (`src/school-day-model.ts:78-79`, `110-117`). `src/WidgetView.tsx:2533-2535` computes its label independently from the displayed selection and uses it at `2627-2630`.

**Reproduced with actual TS models:** at 10:20, fabricated A runs 09:00–11:00 and B runs 10:00–10:45. With B acknowledged, the widget display selects B, but School mode returns A and the label `1 of 2`.

**Repair:** derive the ordinal from the same selected occurrence that owns the title, or use an explicit overlap state that makes no single-lesson ordinal claim. Preserve the existing priority of start/retry attention signals.

**Acceptance:** overlapping and nested lessons, equal starts, acknowledgement/selection changes, and transition after the shorter overlapping lesson ends. Assert title and ordinal together.

### F5 — P2: Removing a source leaves an obsolete carry-over decision for the next source

**Evidence:** `src-tauri/src/work_calendar/mod.rs:644-652` removes the credential and clears join targets but does not clear `pending_source_change`. A save with no previous credential does not update that pending state (`488-495`, `522-526`). `source_change_remap` fetches the actual saved source but derives destination keys using the remembered scope (`844-870`).

**Deterministic sequence:** A with an association → replace with B, leave the prompt unresolved → remove B → save C → carry over. The pending pair is still A/B. If C contains the matching UID, the operation writes an association under B's scope and can report success while C receives nothing. This does not require concurrent windows.

**Repair:** successful removal must retire the pending decision; remapping must verify the actual current source scope under the request gate. Also capture/validate pending state inside the gate and clear only the decision actually applied: currently it is cloned before waiting, and the caller clears it after the remap's gate is released (`src-tauri/src/lib.rs:874-881`). The latter is a concurrency hardening requirement, not a separately reproduced UI race.

**Acceptance:** A→B→remove→C; failed removal; A→B→A; another unresolved replacement; existing destination association preserved; changed/missing UID not guessed. Carry-over failure or obsolete decision must not report a successful current-source association.

### F6 — P2: Successful carry-over itself produces unmatched-association warnings

**Evidence:** `src-tauri/src/workspace.rs:1743-1781` deliberately preserves old bindings and adds new ones. `1685-1696` compares *all* stored bindings with only the current feed's keys. `1677-1680` also reports all bindings as belonging to the previous source.

**Deterministic example:** A has one binding. Republish as B, retaining the UID, and successfully carry it over. Store now contains A's preserved binding and B's live binding. B's feed only matches B, so the next enriched snapshot reports one unmatched association, although the lesson is correctly associated. This happens immediately, without a finished term or UID split. Further source changes inflate the “previous” count too.

**Repair:** preserve the additive safety property, but stop presenting retained history as evidence of an active detachment. If the current schema cannot distinguish source/history reliably, use truthful neutral wording/count semantics and explicitly narrow the claim, or propose a bounded provenance change separately. Do not delete old bindings to silence the warning.

**Acceptance:** successful full carry-over, partial carry-over, repeat action, existing destination binding, changed UID, switching back, and genuinely ended series. Assert both persisted bindings and the resulting notice. Existing tests of key derivation do not exercise this merge/enrichment interaction.

## Additional backend repair candidate

### F7 — P2, pre-existing: Explicit UTC all-day recurrence can reject the whole feed

`src-tauri/src/published_ics/semantics.rs:842-846` treats `event.all_day && timezone == UTC` as proof that an explicit calendar timezone was absent. But `X-WR-TIMEZONE:UTC` is parsed as an explicit default (`499-509`) and resolves to that same value.

A fabricated feed with that default, `DTSTART;VALUE=DATE:20260907`, `DTEND;VALUE=DATE:20260908`, and `RRULE:FREQ=WEEKLY;COUNT=5` reaches the ambiguity guard even when the timezone was supplied. Adding an ordinary timed lesson does not protect it: normalization/expansion errors abort the whole scan (`249-267`). This was established by source tracing, not a Rust execution or observation of a Google export.

Add the explicit-UTC recurring all-day fixture alongside a timed lesson, and distinguish absent timezone provenance from the legitimate UTC value. This is a separate reachable parser shape, not a rediscovery of the accepted `THISANDFUTURE` limitation. It should be tracked in the bounded recurrence repair; it is not a reason to build a new calendar provider.

## What to adopt, modify, and reject from the brief

**Adopt:** single-source architecture; explicit source-change choice; additive merge and no overwrite; no UID/title guessing for changed series; native-only joining secrets; default-off mode preference; central vocabulary; compact status substitution. Persistent workspace keys and ephemeral occurrence join-token keys remain distinct in the inspected code.

**Privacy finding:** the new probe series identities are skipped during serialization (`src-tauri/src/published_ics/mod.rs:93-94`), as are workspace feed keys (`src-tauri/src/work_calendar/mod.rs:74-78`). Reviewed logging reports sanitized status/metadata (`work_calendar/mod.rs:665-684`). No new raw-UID/publication-URL/join-URL IPC or logging leak was established. This is source evidence, not a runtime serialization/traffic capture.

**Modify:** provider path shapes are bounded rather than exact. `PublishedIcsProvider::accepts` uses minimum segment counts and drops empty segments (`published_ics/mod.rs:497-503`), so it also accepts extra segments/trailing slashes. Exact host membership and the existing fetch guards remain. No demonstrated security bypass was found; tighten only if the supported shape contract requires it.

**Reject as current claims:**

- “Nothing is blocked on code”: F1–F6 are concrete contract defects.
- “Meeting started is unchanged”: `calendar-vocabulary.ts:79` already supplies `Lesson started`, and `WidgetView.tsx:2623-2624` uses it.
- “Future capture is rejected”: the implementation and test do the opposite (F3).
- “Google cannot emit THISANDFUTURE”: the brief correctly calls this unverified, but parts of both plans still treat it as settled. A sanitized real edit/export fixture improves evidence; one fixture cannot prove a universal “never.”

**Do not reopen as new defects:** session-only pending state, feed-window-limited carry-over, intentionally unused `summarizeSchoolDay`, missing persistent join overrides, and deferred Subjects/Homework presentation. The expired-subject unmatched warning is a known limitation; F6 is a different, immediate false positive.

## Verification and documentation follow-ups

- The final-occurrence test (`semantics.rs:1527-1565`) proves parse success and the normalized UNTIL string, not that the final occurrence survives expansion. Its Monday rule ends on Thursday, December 24, so the comment about that day's lesson is inaccurate. Use an actual occurrence date, assert the final lesson exists and the next one does not, and cover a DST boundary. This is a coverage gap, not proof that normalization is wrong.
- The tracker contradicts the delivered scope: it excludes vocabulary, says only Step 1 is implemented, and its tail still says the real calendars have not been read. Reconcile it with the vocabulary commit and the brief's attributed human observations. Keep implementation, automated checks, and human acceptance separate.
- The source-change choice currently appears **after** credential replacement (`work_calendar/mod.rs:516-527`, `App.tsx:1503-1544`), whereas the parent plan promises warning before application. Record that actual interaction and obtain a bounded product decision if pre-apply confirmation remains required; do not describe this as a completed pre-save safeguard.
- Source-change and unmatched notices still need actual human review. The repository has M20's review launcher but no M21 launcher. Include the required M21 CMD launcher with the approved repair/manual-review scope; this audit does not launch or create a new app test session.
- Small follow-up: the Today payload update effect uses `preferences.schoolModeEnabled` but omits it from its dependencies (`WidgetView.tsx:2786-2805`), so an open popup's wording may wait for another dependency to change. Include a mode-switch-with-popup-open case.

## Current hub beyond School mode

The bounded inherited M20 review did not establish another high-severity defect in Medicine loading, urgency-based membership, press freezing, or the note-save close guard. The relevant frontend tests passed here, but several window tests inspect source patterns and cannot certify native focus, asynchronous window ordering, or upgrade preservation. M19/M20 installed and human acceptance gates remain open.

**P3 follow-up:** `src/MedicineManagerView.tsx:205-209` accepts any matching `data-dose-key`, but both Today and Recent use that marker (`390`, `399`). A stale target across midnight can be found in Recent and acknowledged as applied, contrary to the intended refusal for a dose outside today's list. Validate against `doseRows.todayRows`; restricting to `#medicine-panel-today` alone is insufficient because Recent is inside it. This is a code-established navigation edge, not observed data loss and not an M21 release blocker.

Unrelated performance, providers, generalized lifecycle changes, and full application re-auditing are not justified by these findings.

## Proposed next bounded scope

1. Repair F1–F4 as one calendar-day validity contract across parser, snapshot, widget and Today. Keep geometry stable. Handle complete/empty/partial/unavailable states explicitly and align the progress label with the displayed occurrence.
2. Repair F5–F6 as source-decision lifecycle and truthful association reporting, preserving records and existing destination choices. Do not silently expand the persistent schema.
3. Add focused backend coverage for F7 and the actual final UNTIL occurrence. Keep unsupported recurrence behavior explicit; do not silently skip arbitrary series and claim a complete timetable.
4. Reconcile the brief/tracker and provide the M21 review CMD with synthetic/manual acceptance cases. Obtain live evidence for both source-change choices, zero/full/partial carry-over, school transitions, Work mode, and the two laptops. Builds, merge, and release remain separate gates.
5. Resume link-override design only after these contracts are stable and the frequency of last-minute link changes is understood. The audit does not authorize that feature.

## Paste back to Claude

> Verdict: request changes, with the current architecture retained. Please respond against F1–F7 with **accept / rebut with source or fixture evidence / defer with explicit scope rationale**. The main gaps are timetable validity across Rust/Today, midnight and overlap correctness, stale pending scopes after removal, and preserved carry-over copies being counted as detached lessons. The current 17 frontend suites, TypeScript check, and Rust formatting pass but do not cover these contracts. Correct the stale brief/tracker claims, then propose one bounded repair and its behavioral tests before implementation. Keep user artifacts, calendar secrets, widget geometry, and release gates intact. Full evidence and acceptance cases are in `docs/council/2026-09-07-m21-school-calendar-audit-codex.md`.
