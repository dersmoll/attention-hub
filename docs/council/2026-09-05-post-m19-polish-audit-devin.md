# Attention Hub — audit for the post-M19 polishing milestone

> **Status: revalidated 2026-09-06. F1–F7 are resolved; see §8.**
> The findings below are preserved as written on 2026-09-05 so the reasoning
> stays readable. Do not act on them without reading §8 first — most were
> already fixed by M19 work that HEAD did not reproduce at review time.

- **Audit date:** 2026-09-05
- **Reviewer:** Devin, with three independent read-only cross-checks
- **Checkout:** `D:\Work\PetProjects\attention-hub`
- **Branch / HEAD:** `codex/m19-medicine-tracker` / `906013d`
- **Baseline:** M18 repair `bb2bf16`, initial M19 implementation `f9e75ce`,
  implementation record `906013d`, **plus substantial uncommitted M19 work**.
  HEAD alone does not reproduce the audited state.
- **Related plan:** [M19 medicine tracker](../plans/m19-medicine-tracker.md).
  Its §12 amendments and §13 continuation record were authoritative at review.
- **Scope:** source review of medicine, widget/Today/manager interactions,
  persistence, native calendar/window behavior, privacy boundaries, tests, and
  release gates. No application or installer was launched.

This document preserves the review requested by the product partner. Saving it
is not approval to implement its recommendations, change lifecycle behavior,
build, commit, or release. Some findings may be fixed by the ongoing M19 work.
The M19/release risks below should not be treated as cosmetic work that is safe
to defer past publication merely because this review is filed for later.

## 1. Overall assessment

**Keep the architecture. Finish M19, then run a reliability and interaction-polish
milestone rather than expanding the feature set again.**

Medicine is substantially implemented as a data model and editor, but incomplete
as an everyday attention feature. The quick **notice → review → record → return
to work** loop is not finished. This explains the half-done feeling better than
an arbitrary percentage-complete estimate.

Sound decisions worth preserving:

- Separate medicine storage, outside workspace export.
- Materialized doses identified by civil day/time, with frozen history during
  schedule changes.
- Revision guards for notes and destructive preflight confirmations.
- Medicine-owned date windows and derived treatment ranges.
- Shared Hub palette and compact optional widget destination.
- Generic, opt-in reminder design; no promise of reminders while closed.
- No medical advice, dosage validation, drug database, or cloud synchronization.

There is no evidence here justifying a Hub-wide rewrite, replacement calendar
provider, new frontend framework, or AI integration.

## 2. M19 delivery state at the time of review

| Area | Audited state |
| --- | --- |
| Storage and schedules | Substantial foundation: separate store, materialized doses, bounded schedules, history preservation |
| Manager | Broadly implemented: editing, lifecycle actions, notes, Today/Recent, ordering, deletion |
| Today integration | Take/Skip/Undo connected; attention-state presentation incomplete |
| Widget destination | Count and entry point exist; opens manager instead of planned anchored popup |
| Reminders and closeout | Not delivered; data controls and final acceptance work remain |

The plan's latest continuation record is reasonably honest about these gaps.
Earlier locked decisions must not be applied without reading the amendments.
M18's commit exists, but installed-build sign-off was not independently verified
in this audit.

## 3. Prioritized findings

### F1 — Treatment-note autosave can lose recent typing

**Timing:** fix during M19. **Evidence:** high-confidence source trace; not a
live-app reproduction.

Treatment notes save after an 850 ms debounce. Switching treatments before the
timer fires cancels the save, and hydration replaces the draft with the newly
selected treatment's notes. Closing the manager has no save-before-close guard.
An in-flight save also updates shared note state without checking that the same
treatment remains selected.

**Recommendation:** make saving treatment-scoped; flush or explicitly resolve
dirty notes before changing treatment or closing; prevent stale completions
from updating a different selection. Distinguish saving, failed, conflict, and
saved states instead of leaving failed saves labeled as still saving.

**Acceptance:** type and immediately switch/close; switch during a delayed save;
retry after a write failure; resolve a revision conflict without losing either
draft. These need interaction tests, not only note-normalization tests.

**Evidence:** [MedicineManagerView.tsx](../../src/MedicineManagerView.tsx),
`selected` hydration, `selectTreatment`, `saveNotes`, debounce effect and close
button; audited lines 132–162 and 176.

### F2 — Failed deletion can remove the last usable backup

**Timing:** resolve before M19 release. **Evidence:** high-confidence failure
path; no real user files were manipulated.

Medicine deletion uses the shared store's destructive-write mode. That mode
removes the backup **before** replacing the primary. If replacement fails, the
backup is already gone. This is especially serious when the primary is corrupt
and the application is currently displaying recovered backup data: a failed
deletion can leave no normally readable store.

**Recommendation:** make deletion failure-safe across primary and backup, with
explicit treatment of backup-cleanup failures. Do not assume moving one statement
is sufficient without deciding how partial success is reported. Preserve the
privacy requirement that successful deletion does not silently leave deleted
health data in the normal backup.

**Acceptance:** inject replacement failure when loading a healthy primary and
when recovering from backup; verify the last readable state remains available.
Also inject backup-cleanup failure and verify truthful user-facing results.

**Evidence:** [local_store.rs](../../src-tauri/src/local_store.rs), `write`,
audited lines 138–153; [medicine.rs](../../src-tauri/src/medicine.rs),
`delete_treatment`, `delete_medicine`, `delete_all` use `mutate(..., false, ...)`.
This shared-store issue is not necessarily unique to M19.

### F3 — Medicine-load failure looks like zero doses

**Timing:** M19 daily presentation. **Evidence:** high-confidence source trace.

The widget catches a medicine snapshot error by setting medicine state to `null`.
Count calculations then fall back to empty arrays and display zero, conflating
nothing scheduled, loading, and unavailable data.

Rust also exposes `recoveredFromBackup`, but the current medicine UI does not
explain that older backup data is being shown. That distinction matters for a
log of whether a dose was already recorded.

**Recommendation:** explicit loading/available/unavailable/recovered states;
calm, actionable diagnostics; never present unknown as an apparent all-clear.

**Acceptance:** missing store, unreadable primary plus valid backup, unreadable
primary and backup, transient read failure, and successful recovery must have
truthful and distinct presentation.

**Evidence:** [WidgetView.tsx](../../src/WidgetView.tsx), medicine refresh effect
and count selectors, audited lines 1204–1220 and 2531–2543;
[medicine.rs](../../src-tauri/src/medicine.rs), `load` and `snapshot`.

### F4 — Today's total height is not bounded by the monitor

**Timing:** remaining popup work / polish. **Evidence:** deterministic layout
arithmetic and source trace; native clipping behavior not live-tested.

Per-section row limits do not constrain the sum. With 24 events, 8 doses and
8 to-dos, `todayPopupHeight` requests **1,122 logical pixels**, already taller
than a typical 1080p work area at 100% scaling. Higher DPI makes the problem
occur with fewer items.

Position clamping cannot repair an oversized window. The current calculation
can place the top above the monitor.

**Recommendation:** cap the whole popup to the monitor's logical work area and
provide deliberate internal scrolling, keeping header/close controls reachable.
Reuse that rule for the new Medicine popup.

**Acceptance:** combined maximum sections, overflow rows, long content, high
DPI, small work areas, above/below placement, and monitor changes.

**Evidence:** [widget-layout.ts](../../src/widget-layout.ts), `todayPopupHeight`,
audited lines 186–190; [today-popup-window.ts](../../src/today-popup-window.ts),
`todayPopupPosition`, audited lines 8–27;
[TodayPopupView.tsx](../../src/TodayPopupView.tsx), content-driven resize effect.

### F5 — Release checks can fail without blocking publication

**Timing:** before the next release. **Evidence:** workflow source plus an
isolated reproduction of PowerShell exit-code behavior.

The release workflow runs frontend tests then build in one PowerShell step,
and formatting, Rust tests, then Clippy in another. Without checking each native
exit code, a later success can mask an earlier failure.

The audit reproduced an earlier native command exiting `1`, followed by a
command exiting `0`, with the sequence succeeding despite
`$ErrorActionPreference = 'Stop'`. This does **not** prove a previous release
contained failing tests; it demonstrates a weakness in the gate.

**Recommendation:** use separate steps or explicit failure checks after every
command. Add ordinary PR validation so checks do not first run at publication;
the repository contained only a tag-triggered workflow at review time.

**Acceptance:** intentionally fail each gate independently in a safe validation
context and confirm the publishing step cannot run. No real release is needed
to prove fail-fast behavior.

**Evidence:** [release-windows-beta.yml](../../.github/workflows/release-windows-beta.yml),
audited lines 52–65. GitHub's [shell exit-code documentation](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#exit-codes-and-error-action-preference)
explains the final `$LASTEXITCODE` handling.

### F6 — Multiple processes are not protected as multiple writers

**Timing:** high-priority native hardening; separately scoped.
**Evidence:** source-level risk; installed two-instance reproduction still needed.

No single-instance guard or cross-process store lock was found. Medicine and
workspace mutexes coordinate windows inside one process, not separate launches.
Two processes sharing a data directory could read the same revision and compete
for the same primary/pending files. Atomic replacement does not prevent lost
updates between processes.

**Recommendation:** decide and verify a single-instance policy, including the
relationship between development and installed builds. Alternatively, storage
must explicitly coordinate cross-process writers. Do not bundle this with an
unrequested tray, autostart, or background-service redesign.

**Acceptance:** repeated installed launches, simultaneous launch attempts, and
approved development/installed coexistence tests using isolated test data.

**Evidence:** [lib.rs](../../src-tauri/src/lib.rs), `run`;
[medicine.rs](../../src-tauri/src/medicine.rs), `MedicineState` and `mutate`;
[workspace.rs](../../src-tauri/src/workspace.rs), `WorkspaceState`;
[local_store.rs](../../src-tauri/src/local_store.rs), shared pending-file writes.

### F7 — Advanced calendar refresh can invalidate the widget's Join button

**Timing:** next-milestone reliability candidate.
**Evidence:** high-confidence cross-window source trace; no live reproduction.

Successful snapshots clear the shared join-token cache and issue fresh tokens.
Advanced can request its own snapshot while the widget continues displaying its
previous snapshot until its next refresh. The visible Join button can therefore
reference a token Rust no longer recognizes.

**Recommendation:** keep bounded valid tokens across overlapping snapshots or
synchronize snapshot consumers. Actual meeting URLs must remain native-only.
Invalidate appropriately when a source is removed or changed; do not keep
unbounded or permanently valid tokens.

**Acceptance:** refresh from Advanced, then activate the still-visible widget
Join button before its next poll; also test consecutive snapshots and source
removal/change.

**Evidence:** [work_calendar/mod.rs](../../src-tauri/src/work_calendar/mod.rs),
`expose_selections` and `join_url`, audited lines 124–162 and 414–428;
[App.tsx](../../src/App.tsx), `refreshSavedWorkCalendar`, audited lines 451–469.

## 4. Product and interaction opportunities

### Attention before chronological history

Today selects the first eight medicine rows chronologically, including completed
rows. After enough morning records, a later due dose can be hidden behind
`+N more`.

Consider reserving visibility for due/unresolved rows and folding completed
records or giving them a smaller budget. Ordering must be explicit and
predictable. The planned Medicine popup's treatment-order allocation deserves
the same review: one treatment should not exhaust the budget while another has
something due now. This is a proposed product amendment, not an already-approved
change to the plan.

**Evidence:** [TodayPopupView.tsx](../../src/TodayPopupView.tsx), `todayDoses` and
`visibleDoses`, audited lines 203–208; M19 plan §4b.

### Contextual overflow navigation

Medicine's `+N more` opens the manager without a treatment or Today-tab target.
Opening the relevant treatment's Today view would reduce the work needed to find
what was hidden. Prefer this daily-use improvement over another reporting screen.

### One interaction contract for floating windows

- Escape closes lightweight popups; Today currently lacks an Escape handler.
- Initial focus and focus restoration are predictable.
- Failed native window operations surface useful errors.
- Saved manager positions are checked against currently connected monitors.
  Both manager openers currently restore coordinates without this validation.
- Long labels, high DPI, keyboard-only use, and high-contrast mode remain usable.
- Audit nonessential motion against the reduced-motion preference.

**Evidence:** [TodayPopupView.tsx](../../src/TodayPopupView.tsx),
[manager-window.ts](../../src/manager-window.ts),
[medicine-manager-window.ts](../../src/medicine-manager-window.ts).

### Reduce redundant setup

Derived treatment dates are a good simplification, but treatment creation still
asks for dates which medicines subsequently replace. Consider a treatment-name
then first-medicine flow that derives dates without asking twice.

Keep PRN/open-ended schedules, stock tracking, adherence scores, and AI or medical
guidance outside this polishing scope.

## 5. Optimization and maintainability candidates

These are measurement candidates, **not demonstrated performance regressions**.

1. **Avoid redundant mirror-layout IPC.** Geometry is measured and sent to Rust
   every second while live surfaces are enabled. Compare rectangles before
   invoking. Retain reconciliation until DPI/layout behavior is verified;
   removing the timer outright is premature. See
   [WidgetView.tsx](../../src/WidgetView.tsx), audited lines 1298–1348.
2. **Separate ticking clocks from stable data work.** Medicine collections are
   filtered on clock renders; the manager resolves dose slots while editing
   unrelated text. Memoized selectors and narrower component boundaries could
   reduce repeated work without architectural replacement.
3. **Debounce geometry persistence.** Coalesce move/resize local-storage writes
   and handle storage failures. See
   [event-workspace-window.ts](../../src/event-workspace-window.ts),
   `writeStoredFloatingGeometry`.
4. **Review calendar-fetch reuse cautiously.** Every fetch creates an HTTP client
   with pooling disabled. Client reuse or conditional requests may help, but must
   preserve M18 timeout, proxy, freshness, and privacy behavior. See
   [published_ics/mod.rs](../../src-tauri/src/published_ics/mod.rs),
   `get_semantic_probe`, audited lines 215–236.
5. **Extract behavior, not a framework.** Useful seams include shared medicine
   selectors, a treatment-notes controller, and window-bound calculations. Avoid
   a blanket refactor of the Hub while completing medicine.

## 6. Verification record and remaining coverage

### Passed during this audit

- All eleven frontend test scripts, run directly with Node:
  advanced focus, attention model, medicine model, meeting workspace, widget
  preferences, time-zone conversion, app update, widget layout, work-calendar
  model, workspace model, and Zoom meeting model.
- `node node_modules/typescript/bin/tsc --noEmit`.
- `git diff --check` on the then-current working changes.
- Isolated PowerShell reproduction of the exit-code masking described in F5.

### Not run

Rust tests/Clippy, production build, installer, live widget, monitor/DPI tests,
and human visual acceptance. The M19 plan recorded prior Rust test results;
this audit did not independently rerun them. No real medicine/workspace data or
calendar credentials were inspected or modified.

The frontend tests primarily cover models and source/style contracts. Passing
them does not establish correct React interaction, cross-window lifecycle,
Windows persistence failure behavior, or installed-app behavior.

### Coverage to prioritize

- Autosave navigation/close and stale async completions (F1).
- Failed replacement and backup recovery/deletion (F2).
- Explicit unavailable/recovered data presentation (F3).
- Combined popup bounds rather than only individual section counts (F4).
- Release failure propagation (F5).
- Multi-process behavior and token lifetime (F6–F7).
- Paired Rust/TypeScript DST fixtures and prospective serialized size limits,
  as already requested by the M19 plan.

## 7. Return-to-this-review checklist

- [x] Establish the finished M19 checkout, commit, branch and dirty state.
- [x] Re-read the current M19 continuation/acceptance record.
- [x] Revalidate F1–F7; mark each fixed, still present, disproven, or needs runtime
      evidence. Record resolving commits rather than silently deleting history. (§8)
- [x] Confirm M19 data-loss/recovery concerns and release gates are resolved
      before treating remaining work as optional polish. (F2, F5, F6; upgrade
      survival is release gate U1–U10, not yet run)
- [ ] Choose one bounded post-M19 proposal with the product partner.
- [x] Use focused regression tests and the required root-level review CMD
      launcher for approved changes needing human verification.
- [ ] Keep build, installed verification, commit, push and release approvals
      separate.

Suggested sequence after revalidation:

1. **Reliability:** duplicate launches, monitor recovery, Join-token lifetime,
   and any surviving storage or autosave issues.
2. **Interaction:** keyboard/focus, contextual navigation, popup sizing, and
   truthful loading/error/recovery states.
3. **Measured performance:** reduce redundant rendering, IPC and persistence
   without weakening recovery behavior.
4. **Release discipline and documentation:** strengthen PR/release checks and
   consolidate authoritative plan rules while preserving historical amendments.

**Bottom line:** finish the medicine attention loop, repair the important
reliability gaps, then polish daily interactions. Reinvention is not warranted.

---

## 8. Revalidation — 2026-09-06

Performed against `codex/m19-medicine-tracker` with a clean working tree and
all five release gates green (`pnpm test`, `pnpm build`, `cargo test`,
`cargo clippy -D warnings`, `cargo fmt`). Every finding was re-read in the
current source rather than accepted from the text above.

**Four of seven were already fixed.** The audit was taken at `906013d` plus
uncommitted work, before M19 checkpoints 4–6. That is a property of when it ran,
not a defect in it: the findings were accurate against the state reviewed.

| Finding | Outcome | Resolved by |
| --- | --- | --- |
| F1 note autosave loses typing | Fixed | `a637529` |
| F2 failed deletion removes last backup | Fixed | `a637529` |
| F3 load failure looks like zero doses | Fixed | `a637529`, `2757761` |
| F4 Today height unbounded by monitor | Fixed | `a637529` |
| F5 release checks can fail without blocking | Fixed | `4e3d302` |
| F6 multiple processes unprotected | Fixed, with one exception | `c1e533e` |
| F7 refresh invalidates Join | Fixed | `415281e` |

`a637529` carries the uncommitted M19 work present during the audit, which is
why one commit resolves four findings.

**F1.** `noteTreatmentId` scopes hydration and saving to a treatment,
`selectTreatment` and `closeManager` both flush through
`if (!await saveNotes()) return`, `noteSaveSequence` discards completions that
land after the selection moved, and a revision conflict is distinguished from a
write error.

**F2.** `local_store::write` now calls `replace_file` *before* removing the
backup, so a failed replacement can no longer leave a store with neither a
readable primary nor a backup.

**F3.** The widget carries an explicit `medicineLoadState` of
loading / ready / unavailable, and the badge renders `…`, `!`, `–` or `✓`
rather than conflating unknown with zero. `recoveredFromBackup` is surfaced in
the medicine data panel added in `2757761`.

**F4.** A `maxHeight` derived from the monitor work area is threaded through the
popup payload and clamped, and `.today-popup-shell` scrolls, so clamped content
stays reachable.

**F5.** Confirmed still present, then fixed. The exit-code masking was
reproduced locally before changing anything — with GitHub's own prelude,
`$ErrorActionPreference = 'stop'; cmd /c exit 1; cmd /c exit 0` leaves
`$LASTEXITCODE` at 0. Every gate is now its own step, and `validate.yml` runs
them on pull requests and main so they no longer first execute at publication.
The publish step deliberately keeps its multi-command form: it checks
`$LASTEXITCODE` explicitly and depends on an *expected* non-zero exit when
probing for the `updater-feed` branch.

**F6.** Confirmed still present, then addressed in three parts: per-process
pending filenames, a separate data directory and Credential Manager target for
debug builds, and a release-only single-instance guard. The guard is release-only
because the plugin keys on the bundle identifier, which both profiles share, so
enabling it in debug would stop a development build starting while the installed
app runs — and the reason for it does not apply there, since debug no longer
shares the store.

Cross-process locking was deliberately not implemented. It is the general answer
for N writers and the wrong shape for a single-user desktop app, and the three
changes above remove the paths that made it necessary.

*Still outstanding:* the installed two-instance reproduction the audit asked for.
It cannot be run from the development launcher, which is exempt by design, so it
is now step **U10** of the release gate in `REVIEW-M19-MEDICINE-TRACKER.cmd`.

**F7.** Confirmed still present, then fixed. Snapshots tag issued tokens with a
generation and retire old ones instead of clearing the map, so a consumer still
displaying the previous snapshot can redeem its tokens. Tokens remain ephemeral,
meeting URLs stay native-only, and removing or reconfiguring a source still
discards every generation.

### Product and interaction items (§4)

| Item | Outcome |
| --- | --- |
| Attention before chronological history | Fixed in `f7d2303`, in Today and the medicine popup |
| Escape closes lightweight popups | Fixed in `a506f6d` — no popup had a handler, not only Today |
| Saved positions checked against connected monitors | Fixed in `a506f6d` |
| Contextual overflow navigation (`+N more` target) | **Open.** Needs a focus-target API on the medicine manager |
| Reduce redundant setup (treatment dates asked twice) | **Open** |

### Not addressed

§5's optimization candidates are untouched. They were filed as measurement
candidates rather than demonstrated regressions, and nothing measured since has
promoted them.
