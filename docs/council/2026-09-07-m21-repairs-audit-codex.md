# M21 repairs cross-audit — Codex

- **Date:** 2026-09-07
- **Branch:** `codex/m21-school-calendar-source`
- **Reviewed range:** `2dfb252..a997462`
- **Prior audit:** [M21 school-calendar audit](2026-09-07-m21-school-calendar-audit-codex.md)
- **Repair brief:** [M21 repairs audit brief](2026-09-07-m21-repairs-audit-brief.md)

## Verdict

**REQUEST CHANGES.** The repair direction is good, and most of the first audit's fixes are present, but the central empty/finished-day repair is only complete in the parser. The next Rust layer still rejects its new optional-selection success state. Two source-replacement safety holes also remain: a credential read failure bypasses the confirmation barrier, and the process-wide `completed_remap` slot can be drained by the wrong concurrent save.

Do not reopen the rest of F1–F7. The shared day-state model, popup state vocabulary, overlap alignment, explicit-UTC recurrence repair, truthful unmatched wording, pre-apply prompt, and final-`UNTIL` occurrence coverage are useful changes and should remain.

This is a read-only code audit plus a documentation artifact. No application source, calendar source, credential, setting, build output, or existing user artifact was changed.

## Evidence and limits

- Current checkout was `a9974627b6e5f0de2ade3eb1d9993f7d966742f4`; `2dfb252` is its ancestor. The range contains eight commits and twenty changed files, broader than the brief's “four repair commits plus two documentation commits / 18 files” summary.
- Existing local state was preserved: `src-tauri/Cargo.toml` remains reported modified, with no content diff, and pre-existing untracked installers, sounds, plans, design artifacts and `.claude/` remain untouched.
- Executed on current HEAD: `scripts/test-school-day-model.mjs`, `scripts/test-work-calendar-model.mjs`, `scripts/test-widget-layout.mjs`, TypeScript `--noEmit`, Rust formatting check, and `git diff --check`. All passed.
- Source inspection covered the full `2dfb252..HEAD` delta, with deeper tracing of the parser-to-snapshot adapter and replacement command.
- Three independent subreviews were requested under the repository's collaboration guidance. They hit the account usage ceiling; one reported the same optional-selection half-fix before stopping. The findings below do not depend on unfinished subreview output.
- Not run here: frontend/Tauri builds, Rust tests, Clippy, app launch, private feeds, runtime IPC capture, network-off review step 18, remaining human review, or installed upgrade checks. Claude's green-gate and product-partner observations remain attributed evidence rather than checks repeated here.

## Required repairs

### RF1 — P1: selection-less success is still converted to unavailable

**Repair affected:** R1 (`0f0345c`), reopening the substantive part of prior F1/F2.

The semantic parser now correctly returns success with `selection: None` for an empty calendar or a completed finite timetable (`src-tauri/src/published_ics/semantics.rs:358-365`, `400-417`). The published-ICS probe also correctly marks that result `Observed` and preserves `viewer_day` and completeness (`src-tauri/src/published_ics/mod.rs:439-451`).

The adapter immediately undoes that work. `snapshot_from_probe` only maps an observed probe to `WorkCalendarStatus::Observed` when `probe.selection.is_some()` (`src-tauri/src/work_calendar/mod.rs:769-776`). It then clears `day_selections`, `viewer_day`, and completeness for the resulting unavailable status (`782-788`). The test `observed_status_requires_a_selection` explicitly pins the obsolete rule (`1048-1082`), so the green Rust suite supports the bug.

**Concrete result:** `save_source` accepts and writes an empty/finished source because it now checks only probe status and extraction permission (`work_calendar/mod.rs:516-523`, `551-567`). It returns an unavailable snapshot with no verified day. Advanced then reports a generic verification failure while a configuration refresh can report the source configured (`src/App.tsx:455-469`). Every subsequent refresh repeats the unavailable state. Review-launcher steps 5–6 therefore cannot pass as written, and the app still cannot truthfully show the final `Day ended` or holiday `No lessons` states.

**Repair:** make an observed, permitted semantic read sufficient for `WorkCalendarStatus::Observed`; selection must remain optional. Keep clearing day fields only for genuine failed/unreadable probes. Rename and invert the obsolete adapter test.

**Acceptance:** exercise the full semantic probe → work-calendar snapshot path for (a) empty feed, (b) final lesson already ended with no future event, (c) ordinary current/upcoming selection, and (d) failed feed. Assert status, optional selection, day rows, `viewerDay`, completeness, save result, and Today state together.

### RF2 — P1: a credential read failure bypasses AskFirst and may overwrite the saved source

**Repair affected:** R3 (`32a7ef5`), a half-fix of the replacement write barrier.

`save_source` collapses both “credential absent” and “credential could not be read” into `previous_scope = None` (`src-tauri/src/work_calendar/mod.rs:497-504`). That makes `replaces_a_different_source` false (`505-508`). After the candidate verifies, even `AskFirst` skips the confirmation branch and reaches `credential_store::write` (`538-551`). Windows Credential Manager uses one fixed target, so a successful write replaces whatever was there (`src-tauri/src/work_calendar/credential_store_windows.rs:10-14`, `61-78`).

**Concrete failure:** an existing source A is present; `CredReadW` transiently fails; the user submits B using the normal `askFirst` path; B verifies; `CredWriteW` succeeds. A is overwritten without the explicit replacement decision that R3 promises. Read and write failures are independent, so a read failure does not establish that the write must also fail.

**Repair:** distinguish `Ok(None)` from `Err`. On read error, zero the candidate and return a storage-unavailable result before network verification or any write. Do the same for any decision path; an explicit carry/keep decision cannot be safely related to an unreadable outgoing source.

**Acceptance:** introduce a bounded credential-store seam or equivalent fault injection. Cover existing/absent/read-error × ask/carry/keep plus write failure. Assert exact write counts and that a read error performs zero writes and produces no remap.

### RF3 — P2: `completed_remap` can be consumed by a different save command

**Repair affected:** R3 (`32a7ef5`), reintroducing prior F5's concurrency class through a new mechanism.

The work-calendar request gate protects credential read, write, and `set_completed_remap` inside `save_source` (`src-tauri/src/work_calendar/mod.rs:490-564`). The guard is released when that async function returns. Its Tauri caller drains the shared slot afterwards (`src-tauri/src/lib.rs:872-887`). Every save command performs that drain, regardless of its own replacement choice (`882`).

**Valid interleaving:**

1. Command 1 replaces A→B with carry-over, stores remap A/B, releases the gate.
2. Before command 1 drains the slot, command 2 acquires the gate and replaces B→C with **keep separate**.
3. Either continuation can drain A/B. The remap is applied while C is saved, and command 2 can claim associations were carried despite its explicit keep-separate decision.

The frontend disables its visible controls during one request, which reduces ordinary single-window reachability; it does not make the native command transaction correct. Tauri commands can overlap, and the state itself claims the pairs cannot be overtaken (`work_calendar/mod.rs:227-235`) when the caller boundary shows that they can. The current unit test proves one-time slot mechanics, not producer-consumer ownership (`1266-1299`).

**Repair:** return the remap with the exact `save_source` result to the same command invocation instead of using shared process state. Apply that owned remap before constructing the response. If credential state must remain stable through workspace mutation, add a request identity/current-scope check or hold a transaction boundary that covers both; do not use an unlabelled global slot.

**Acceptance:** a deterministic two-command test with barriers: carry A→B overlaps keep-separate B→C, and carry A→B overlaps AskFirst C. Assert each response contains only its own outcome, keep-separate never applies a remap, and no A/B pair is reported as applied to C.

## Hardening and smaller corrections

### H1 — The dual timezone contract is a real structural risk, but no current mismatch was reproduced

Claude is right to question the boundary. Rust obtains a Windows-to-IANA name through `iana_time_zone`, parses it with `chrono_tz`, and stamps `viewer_day` (`src-tauri/src/published_ics/mod.rs:380-400`; `semantics.rs:301-310`). The WebView independently asks Chromium `Intl` for its system zone and computes the comparison date using Chromium's timezone data (`src/WidgetView.tsx:935-938`, `2529-2535`; `src/school-day-model.ts:40-58`). Those are two databases and two alias systems. A recently legislated timezone-rule change can leave them temporarily disagreeing near a date boundary, producing `unavailable` despite a successful feed.

The current machine does not demonstrate that defect: Windows reports `FLE Standard Time`; Chromium reports `Europe/Kiev`; the frontend normalizes it to `Europe/Kyiv`; and this runtime accepts both aliases with equivalent observed dates. Also, if Rust cannot map its result, the probe fails explicitly rather than silently stamping a conflicting date (`published_ics/mod.rs:380-394`). This is therefore a robustness finding, not evidence that School mode currently fails all day.

**Recommendation:** eliminate the second date calculation. Have Rust return the UTC bounds during which its `viewer_day` is valid (or another backend-derived validity token), and have TypeScript compare `now` with those bounds plus freshness. Keep an explicit system-zone-change invalidation. Until then, add Windows integration coverage for the actual `iana_time_zone` result and WebView `Intl` result, including aliases and a DST boundary; pure TypeScript tests with a caller-supplied matching string cannot validate this cross-runtime contract.

### H2 — The secret-field help and cancel instruction do not match the UI

The help says the field is cleared “as soon as an action starts” (`src/App.tsx:1451-1454`), but the URL remains in React state through verification failures and the new confirmation step, and is cleared only after an observed/configured response (`430-462`). That retention is an understandable usability trade-off and the input remains `type="password"`; the backend deliberately keeps no pending candidate. No new URL logging or IPC echo was found.

The prompt says clearing the field cancels (`1501-1504`), but changing/clearing the input does not clear `workCalendarSnapshot.sourceChange`; the stale alert remains and its buttons remain active (`1431-1436`, `1469-1507`). An empty value prevents a write, but the UI has not actually dismissed the decision.

Update the help to say when the value is retained and cleared. Invalidate the confirmation snapshot whenever the input changes, or provide an explicit Cancel action that clears both the field and prompt. If the field changes after confirmation is raised, require `AskFirst` again so “same calendar” cannot be applied to a different candidate than the one the prompt described.

## Findings not reproduced

- **No unrecognised replacement value reaches a replacement write path.** `src-tauri/src/lib.rs:864-870` maps every unknown/missing string to `AskFirst`. Same-source and first-source writes correctly need no replacement warning. RF2 is the error-path exception.
- **No remap is queued by the current request after a credential write failure.** `set_completed_remap` is below `Ok(())` (`work_calendar/mod.rs:553-565`). RF3 concerns an earlier overlapping producer.
- **No stale enum consumer was found.** The removed `NoEligibleEvent` variants remain only in historical/current documentation references, not the TypeScript or Rust runtime paths.
- **No new concrete whole-feed recurrence shape was established in this delta.** R4 correctly distinguishes explicit `X-WR-TIMEZONE:UTC` from an absent calendar timezone (`semantics.rs:868-884`) and the strengthened `UNTIL` test asserts occurrences across the boundary. `default_timezone.is_some()` is a reasonable proxy for the declared calendar default on the guarded recurring all-day DATE path; treating a non-standard per-event TZID on a DATE as equivalent is not justified by this audit. `RANGE=THISANDFUTURE` and fail-the-whole-feed behavior remain explicit accepted limits, not closed safety claims.
- **No new privacy leak was found.** `series_identities` remains `skip_serializing` (`published_ics/mod.rs:92-93`) and `feed_workspace_keys` remains `skip_serializing` (`work_calendar/mod.rs:89-90`). `viewerDay` is a local date, and completeness is a boolean. Reviewed snapshot logging contains status/presence/timing, not UID or source/join URLs (`work_calendar/mod.rs:713-732`). This is source inspection, not a runtime traffic capture.

## Paste back to Claude

> Verdict: **request changes again, narrowly.** R1 is half-fixed: `SemanticScan.selection` is optional, but `snapshot_from_probe` still requires `selection.is_some()` and clears the verified day, so empty/finished calendars are saved and then reported unavailable. R3 also has two safety holes: credential read error is treated as no existing source and can bypass AskFirst, while the process-wide `completed_remap` slot can be drained by a different overlapping save. Please answer RF1–RF3 with accept/rebut and propose one bounded repair with cross-layer/fault/concurrency tests. Preserve the rest of R1–R4. The Rust/Chromium timezone concern is structurally valid, but this machine's FLE → Europe/Kiev/Kyiv path agrees; treat H1 as cross-runtime hardening rather than a reproduced all-day failure. Also correct the secret-field/cancel copy and invalidate stale prompts. Full evidence is in `docs/council/2026-09-07-m21-repairs-audit-codex.md`.
