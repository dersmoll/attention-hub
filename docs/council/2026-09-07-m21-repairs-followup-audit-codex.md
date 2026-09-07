# M21 repairs follow-up audit — Codex

Reviewed at `d5d5699` against the implementation repair in `3616d90`. This is a
delta review from `a997462`; earlier findings are reopened only where the repair
does not establish the property it claims.

## Verdict

**REQUEST CHANGES, narrowly.** RF1, RF2's write barrier, and H2 are closed in
source. RF3's shared-slot theft is gone, but the replacement and its workspace
remap are still not one ordered operation. The Calendar page also hides the
carry result that review step 10 requires, and the new credential-read abort is
presented as a verification failure even though verification deliberately never
ran.

| Previous item | Follow-up verdict |
| --- | --- |
| RF1 | **Closed in source; cross-layer validation still required** |
| RF2 | **Write barrier closed; user-facing abort message needs repair** |
| RF3 | **Partially closed** |
| H1 | **Deferral accepted as hardening, not a reproduced defect** |
| H2 | **Closed** |

## Findings

### FR1 — P2 — the owned remap can still run after a newer source wins

`SaveOutcome` fixes one real bug: another request can no longer take remap pairs
from a shared slot. It does not make the source replacement and remap atomic.

`save_source` holds `request_gate` while it reads source A, writes source B, and
builds the A-to-B remap (`src-tauri/src/work_calendar/mod.rs:525-641`). It then
returns, releasing the gate. Only afterwards does the Tauri caller apply that
remap to the workspace (`src-tauri/src/lib.rs:872-902`). A second command can
therefore acquire the gate, replace B with C, and finish its credential write
before the first command applies A-to-B associations.

The result is no longer another request's remap applied by the wrong caller, but
it is still stale work applied after B stopped being current. The first response
can also report that associations were carried "onto the new source" when C is
already the saved source.

The replacement, remap, snapshot enrichment, and result need one ordering
boundary. A narrower alternative is to bind the outcome to the expected saved
scope and re-check that scope under the same serialization boundary immediately
before mutating the workspace; abort truthfully if it changed.

The new test does not prove this property. It creates a remap and separately
asserts that a default `SaveOutcome` has no remap
(`src-tauri/src/work_calendar/mod.rs:1424-1469`). It never constructs a carrying
outcome and never runs overlapping save callers.

### FR2 — P2 — carry-over count and failure are not visible in Calendar

The caller appends either `Carried {n}...` or the remap error only to
`snapshot.diagnostics` (`src-tauri/src/lib.rs:891-900`). The Calendar page does
not render those diagnostics. Its saved-source result shows only status and
whether a selection exists (`src/App.tsx:1587-1595`).

Consequently review-launcher step 10 cannot pass: the user cannot confirm the
carried count, including zero. A failed workspace remap is also silent on the
surface where the replacement was requested. Restore a bounded, non-secret
source-change result in Calendar for both success and failure. Zero must be
reported explicitly and must not use success wording.

### FR3 — P2 — credential-read failure is described as failed verification

On an unreadable saved credential, Rust intentionally returns before probing,
with `storage_available: false`, no `stop_reason`, and a truthful diagnostic
(`src-tauri/src/work_calendar/mod.rs:556-580`). The frontend ignores that
diagnostic and passes the null stop reason to its fallback, displaying: "bounded
verification did not complete successfully" (`src/App.tsx:455-467` and
`src/App.tsx:151`).

Verification did not start. The message should say that Windows Credential
Manager could not read the existing source, the pasted link was not saved, the
existing source was left unchanged, and the pasted link remains available.

## Closed items and accepted deferrals

- **RF1:** an allowed `Observed` probe no longer requires a selection, so an
  empty or finished verified day keeps its day contract. The inverted adapter
  test covers the immediate regression.
- **RF2:** `save_action` distinguishes `Err(())`, `Ok(None)`, and `Ok(Some(...))`;
  the error path returns before probe and credential write. A credential-store
  seam would strengthen the test, but the present control flow is sufficient to
  close the overwrite defect.
- **H2:** the help text now matches retention, Cancel is explicit, and editing
  the candidate retires its old confirmation.
- **H1:** Rust/Chromium timezone-database disagreement remains a structural
  risk. Returning Rust-derived UTC validity bounds is the right next contract,
  but no mismatch is reproduced on this machine, so it is not part of this
  repair verdict.

## Required evidence before M21 is called complete

Add the proposed probe → snapshot → Today test for empty, finished, selected,
and failed feeds. RF1 survived because every existing test stopped at a layer
boundary, so deferring that test would preserve the exact validation gap that
caused the defect.

Run review steps 5–6, 10, and 18 after the findings above are repaired. The
launcher itself records that steps 5–6 and 18 have not yet passed; step 10 is
currently impossible because its result is not rendered.

## Verification performed in this audit

- `node scripts/test-school-day-model.mjs` — passed.
- `node scripts/test-work-calendar-model.mjs` — passed.
- `node scripts/test-widget-layout.mjs` — passed.
- `node node_modules/typescript/bin/tsc --noEmit` — passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` — passed.
- `git diff --check a997462..HEAD` — passed.

Claude reports 115 Rust tests, 17 frontend suites, Vite build, and Clippy clean
for `3616d90`; this audit did not rerun those build-producing gates. No live-app
or installed-build acceptance was performed.

## Takeover resolution in the working tree

The user asked Codex to take over after this verdict. The current uncommitted
working tree resolves FR1–FR3:

- `save_source` invokes the workspace remap before releasing `request_gate`;
  the post-gate `SaveOutcome` path is removed.
- The native snapshot carries a structured, sanitized `saveResult`. Calendar
  renders the carried count (including literal `0`) and a bounded carry failure.
- Credential read and write failures have distinct result statuses, so the read
  failure no longer falls through to verification wording.
- `tests/fixtures/school-day-contract.json` is consumed by both a Rust adapter
  test and the frontend day-state test for empty, finished, selected, and failed
  feeds.

Current automated evidence: 117 Rust tests passed with one ignored reporting
helper; all 17 frontend scripts passed; TypeScript no-emit compilation, Rust
formatting, Clippy with warnings denied, and diff whitespace checks passed. The
frontend production build passed after explicit approval. Human and installed
acceptance remain separate gates.

## Paste-back for Claude

```text
Verdict: REQUEST CHANGES, narrowly, at d5d5699 / repair 3616d90.

RF1 is closed in source: Observed no longer depends on selection and the day is
preserved. RF2's credential overwrite barrier is closed: read Err is distinct
and returns before verification/write. H2 is closed. I accept the credential
seam and Rust UTC validity bounds as separate hardening, although the proposed
probe→snapshot→Today test is required before M21 is called complete because RF1
existed specifically across that untested boundary.

RF3 is only partially closed. SaveOutcome ownership prevents another request
from stealing the remap, but save_source releases request_gate before lib.rs
applies it. Interleaving remains: command 1 writes B and returns A→B; command 2
writes C; command 1 then mutates workspace with stale B keys and reports carry
onto the new source. Serialize the credential transition and workspace remap as
one operation, or bind the outcome to B and re-check B under the same boundary
before mutation. The new test never constructs a carrying SaveOutcome and does
not exercise concurrent callers.

Two UI findings remain. Carry success/count (including zero) and carry failure
are appended only to snapshot.diagnostics, which Calendar never renders, so
review step 10 cannot pass. Also the new credential-read abort has no stopReason;
App.tsx therefore calls the generic fallback and tells the user verification
failed, although Rust intentionally skipped verification. Show a bounded
Calendar result for carry success/failure and a truthful storage-read message.

Focused school-day, work-calendar, widget-layout, TypeScript, Rust fmt, and diff
checks pass. No live-app or installed acceptance was performed. After repair,
run launcher steps 5–6, 10, and 18.
```
