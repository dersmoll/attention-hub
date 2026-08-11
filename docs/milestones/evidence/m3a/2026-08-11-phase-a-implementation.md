# Milestone 3A Phase A implementation evidence

- Date: 2026-08-11 Europe/Kyiv
- Scope: structured source observations and attention-first daily panel
- Result: implementation and initial validation passed; controlled manual and
  dogfood gates remain open

## Implemented boundary

- Every attention snapshot contains fixed Telegram, Outlook, and Teams source
  observations with `observed`, `notRunning`, `notExposed`, or `error` state.
- Source captures are isolated. A Windows/UI Automation error for one source is
  recorded on that source and does not prevent the other captures.
- The existing flattened `signals` and diagnostic lists remain available to the
  technical evidence UI.
- Observed missing-at-zero counts cross IPC as explicit zero signals marked
  `inferred`; React does not parse diagnostic prose.
- The frontend derives attention separately from health/freshness. Positive
  attention outranks partial failure, while `All clear` requires fresh 3/3
  observed-clear coverage.
- Automatic attention snapshots use one non-overlapping five-second loop.
  Manual refresh shares the same in-flight guard. One IPC failure reports
  retrying; two failures or a snapshot older than 15 seconds reports stale.
- The existing Teams mirror adapter and 100 ms cached taskbar-rectangle tracker
  are unchanged. Only its React control moved into the Teams card.
- Graph, calendar, Notification Center, raw source state, and diagnostics remain
  available in one native collapsed disclosure.

## Automated validation

- `cargo fmt --all -- --check`: passed.
- `cargo clippy --all-targets -- -D warnings`: passed.
- `cargo test`: 15 passed, 0 failed, 1 intentionally ignored manual calendar
  diagnostic.
- TypeScript 5.8.3 `tsc --noEmit`: passed.
- Vite 7.3.6 production build: 34 modules transformed successfully.
- Dependency-free Node assertions covered 3/3 all-clear, partial coverage,
  positive-attention-plus-source-error precedence, retrying without false
  all-clear, stale positive attention, and all-unreadable failure: passed.
- `git diff --check`: passed before the evidence-only closeout edits and must be
  rerun at final closeout.

## Live Windows snapshot smoke

An ordinary unpackaged debug run launched successfully and repeatedly returned:

```text
telegram:Observed signals=2
outlook:NotExposed signals=0
teams:Observed signals=1
```

The only source diagnostic was that New Outlook was running but no English
Inbox accessibility label was currently exposed. This is the intended truthful
result: Outlook remained a fixed visible source with `notExposed` state instead
of disappearing or being treated as zero. Telegram and Teams continued to
update independently across repeated five-second snapshots.

The unpackaged Notification Center listener still reported its already-known
identity limitation. Graph helper and AppointmentStore diagnostics remained
inside the technical surface and did not affect the primary attention model.

No source application was controlled during this run.

## Responsive and semantic UI checks

The local frontend was inspected in a real browser with Tauri IPC intentionally
unavailable, exercising the no-snapshot/error presentation without private
source data.

- At an 800 by 600 viewport, the primary panel was 737 CSS pixels wide with no
  document horizontal overflow. All three source cards occupied the same row.
- At a 500 by 700 viewport, the cards stacked to 453 CSS pixels wide with no
  horizontal overflow and the Refresh control expanded to the available width.
- The technical disclosure was collapsed by default. After keyboard-equivalent
  semantic activation, it remained open across more than one five-second
  refresh interval.
- Headings, source health, metrics, freshness, and buttons were present as text;
  state meaning did not depend on color.

## Still open

- Controlled Telegram, Outlook, and Teams attention transitions and measured
  end-to-end convergence.
- Reconciliation of the Outlook 1-to-0 summary claim with the older dedicated
  evidence file that still calls the transition pending.
- Live activation of the relocated Teams mirror control, including start,
  drag, stop, restart, native close, and accepted reflow behavior.
- Sleep/resume and Explorer restart from the daily panel.
- A 30-to-60-minute combined panel/mirror resource run.
- Five-working-day dogfood and exit decision.

These cases are not inferred from compilation or the initial snapshot smoke.
