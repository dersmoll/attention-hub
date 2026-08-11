# New Outlook My Day sanitized UI Automation evidence

- Date: 2026-08-11 Europe/Kyiv
- Scope: manual Windows-only structure gate
- Provider decision: pending live state matrix
- Semantic extraction: not implemented

## Implemented boundary

The Advanced view now exposes one explicit **Run sanitized structure probe**
button. Attention Hub inspects already-accessible New Outlook (`olk.exe`)
windows only. There is no Outlook launch, focus, click, invoke, selection,
scroll, navigation, screenshot, OCR, pixel access, profile access, or Graph
activity.

Every click clears the prior frontend result before starting a fresh scan. The
Rust command logs counts and timing only. IPC may contain:

- fixed control roles and numeric control type IDs;
- element/window bounds and visibility/minimized/offscreen state;
- booleans for supported UI Automation patterns and control/content state;
- lengths of accessibility string properties, never their values;
- window, element, marker, candidate, error, and depth counts;
- gate wait, scan timing, configured limits, and fixed diagnostics.

It cannot contain raw accessibility labels, subject, account, attendee,
organizer, location, URL, or meeting URL. Fixed English `My Day` and `Calendar`
comparisons produce counts only. Source identity is
`unverifiedStructureOnly`, and `semanticExtractionAllowed` is always false.

## Bounds and coexistence

| Boundary | Limit |
| --- | ---: |
| Shared UIA gate wait | 750 ms |
| Scan time | 2,500 ms |
| Desktop top-level elements | 512 |
| Outlook windows | 8 |
| Outlook control-view elements | 4,000 |
| Traversal depth | 32 |
| Returned structural candidates | 64 |

The manual probe is a priority UIA waiter. Existing background attention
snapshots wait behind it; the Teams/Telegram taskbar trackers skip cached checks
while the gate is held. A gate timeout returns `busy` and performs no Outlook
scan.

## Automated validation

- TypeScript/Vite production build: passed; 40 modules transformed.
- `cargo check --all-targets`: passed.
- `cargo test` with reduced debug output after a scoped generated-target clean:
  17 passed, 0 failed, 1 pre-existing manual AppointmentStore diagnostic
  ignored.
- `cargo clippy --all-targets -- -D warnings`: passed.
- Full default-profile Rust linking initially failed because C: had zero free
  bytes. Only this worktree's 2.53 GiB generated `src-tauri/target` directory
  was cleaned; the reduced-footprint validation then passed.

## Pre-probe runtime coexistence

The reduced-footprint development app launched successfully. Teams and Telegram
each retained one unambiguous taskbar source. Consecutive one-minute tracker
windows reported zero rediscoveries, with sub-millisecond average cached UIA
checks, while the normal two-second attention snapshot continued completing.
This proves the inherited observers were healthy before the manual My Day scan;
probe-time contention still requires the live button action.

## Live state matrix

No live Outlook values are recorded yet. Fill this table only with sanitized
probe fields.

| State | Status | Windows | Elements | Candidates/right pane | My Day/Calendar/selected markers | Gate/scan ms | Stop reason |
| --- | --- | ---: | ---: | --- | --- | --- | --- |
| Visible | Observed | 1 | 762 | 220 / 135 | 1 / 4 / 1 | 0 / 1,310 | None |
| Covered | Pending | — | — | — | — | — | — |
| Minimized | Pending | — | — | — | — | — | — |
| Restored | Pending | — | — | — | — | — | — |
| Restarted, My Day closed | Pending | — | — | — | — | — | — |
| Restarted, My Day reopened | Pending | — | — | — | — | — | — |
| My Day Mail | Pending | — | — | — | — | — | — |
| My Day Calendar | Pending | — | — | — | — | — | — |
| My Day closed | Pending | — | — | — | — | — | — |

## Decision gate

Do not begin semantic extraction unless the passive background matrix passes
and a single account/calendar source can be selected safely. Stop this provider
path immediately if minimized/covered operation fails, Outlook control would be
required, selection is ambiguous, localization/version coupling is
unacceptable, or time/event parsing cannot be made deterministic.
