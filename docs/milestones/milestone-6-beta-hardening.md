# Milestone 6: Beta hardening and daily-use evidence

## Status

Current-machine closeout passed on 2026-08-13. The production baseline is
merged `main` commit `ab9e228`, tagged `v0.3.0-beta.1`; the accepted fixed-source
candidate is `da431d3`, tagged `v0.4.0-beta.1`. Installer retention and upgrade,
cold/restart, S3 resume, same-DPI monitor movement, preference persistence, and
the 30-minute resource gate passed. Real Outlook minimized/last-observed/recovery
and Advanced-window isolation also passed. Five-day dogfood and disposable
clean-machine evidence remain open and explicitly external to this same-day
current-machine closeout. This milestone permits only fixes that preserve the
accepted beta product boundary.

The requirement-by-requirement disposition is maintained in
`docs/milestones/evidence/m6/closeout-ledger.md`. Partial, manual, and
environment-blocked cases remain named there rather than being inferred from a
narrower passing check.

## Product question

Can the accepted beta survive ordinary daily Windows lifecycle, display,
preference, and installation transitions without losing truthful source state
or requiring a new product feature?

## Fixed baseline

The gate must preserve Teams and Telegram multi-monitor taskbar selection and
activation, Outlook aggregate Inbox unread and its explicitly last-observed
fallback, widget position and pinning, both clocks, Advanced, the one saved
Published ICS source, active-event acknowledgement, panel appearance, app
ordering, and source-owned attention semantics. DWM pixels remain visual-only.

`RUN-ATTENTION-HUB.cmd` is a development entrypoint. It stops existing
development processes, may install dependencies, and starts a development
build. Installed-beta evidence must use the release executable or installed
application directly and must not be inferred from the launcher.

## Evidence privacy

- Record revision, Windows/application versions, state classifications,
  timings, dimensions, process metrics, and issue IDs only.
- Do not record message subjects, senders, chat names, account identifiers,
  calendar URLs, event values, screenshots containing private content, source
  pixels, or raw accessibility labels.
- Classify DWM output only as visible, hidden, aligned, stale-looking, or
  recovered. Never transcribe or interpret a rendered badge.
- Use synthetic or redacted calendar/preference values when a test requires a
  known input.

## Scope and matrix

### Startup and process lifecycle

- Three direct cold starts of the installed beta after confirming no Attention
  Hub process remains.
- Three normal quit-and-restart cycles.
- Two suspend/resume cycles, followed by a fresh attention snapshot and mirror
  status check.
- Reopen Advanced twice and verify that closing it destroys only Advanced.
- Confirm a normal widget close exits the process tree without an orphaned
  native mirror or WebView process owned by Attention Hub.

### Source and shell recovery

- Minimize and restore Outlook three times. A retained value must be amber,
  dashed, and announced as last-observed; restored observation must replace it;
  stopping Outlook must clear it.
- Close and reopen Teams and Telegram once each while their semantic state and
  mirror visibility are observed separately.
- Restart Explorer twice. Mirrors must hide on doubt and recover from the new
  taskbar owner without turning pixels into semantic counts.
- Reorder a real taskbar button once while both mirror controllers are active.
- Activate each running source from both its React button and, where present,
  its native inset surface. No action may launch a stopped source.

### Display and geometry recovery

- Drag the widget within each daily-use monitor and across monitor boundaries
  in both directions.
- Exercise every daily-use scale factor available on the test machine. Record
  source-monitor selection, widget/native alignment, and the 960 by 80 / 40 by
  40 logical geometry contract.
- Move Teams and Telegram between monitors independently and together.
- Disconnect/reconnect or disable/enable one secondary display if this can be
  done without disrupting unrelated work; otherwise leave the case explicitly
  manual.

### Preference persistence and migration

- Restart after changing pin state, secondary timezone, panel color, panel
  opacity, app order, and widget position.
- Seed a valid legacy v1 subset containing only position, pin, and timezone;
  confirm normalization adds appearance/order defaults without resetting the
  legacy values.
- Seed malformed color, opacity, coordinates, timezone, and app-order values;
  confirm bounded defaults are restored without a crash.
- Confirm preference changes synchronize between Widget and Advanced and that
  reset actions remain bounded to their named fields.
- Confirm active-event acknowledgement remains process-memory-only and clears
  on restart. Confirm the saved ICS credential remains version-independent and
  is removed only by its explicit removal action or the separately documented
  uninstall-data decision.

### Installer and disk behavior

- Verify the canonical file name, embedded version, size, SHA-256, and
  Authenticode status before execution.
- On the current machine, install the beta, directly launch it, uninstall it,
  and record application files, shortcuts, uninstall entry, and the explicit
  outcome for local preferences and the Credential Manager calendar target.
- If the canonical `0.2.0` installer is available, install it first and perform
  one in-place upgrade to `0.3.0-beta.1`. Never invent an upgrade result when
  the older artifact or safe test state is unavailable.
- Maintain a clean-machine checklist covering supported Windows version,
  WebView2 presence, standard-user install, SmartScreen, first run, upgrade,
  uninstall, and retained-data behavior. Clean-machine execution is a separate
  evidence result, not implied by this worktree.
- Record installer size, installed size, per-user application-data size, and
  repository build-cache size. Build outputs are rebuildable and remain
  distinct from user data.

### Resource run

- Run one 30-to-60-minute installed-beta session with Teams and Telegram mirror
  controllers active when real attention state permits.
- Sample the Attention Hub process tree every five seconds after a ten-minute
  warm-up: normalized CPU, working set, private bytes, handle count, and process
  count.
- Record source transitions, Explorer/display changes, and recovery timestamps
  separately from resource samples.

## Severity and acceptance gate

- **P0:** privacy leak, credential/source-content exposure, destructive data
  loss, or pixels represented as semantics. Stop immediately.
- **P1:** crash/hang, false fresh count, false all-clear, supported preference
  loss, source activation launches an app, or lifecycle/display recovery fails
  twice from the same documented state.
- **P2:** bounded visual/accessibility friction that leaves semantics and core
  operation intact.
- **P3:** evidence or documentation improvement with no user-visible failure.

The milestone can close only when automated validation passes, there are no
open P0/P1 issues, every executed matrix case has sanitized evidence, and every
unexecuted case is named rather than implied. During the resource run, a crash,
hang, sustained unexplained CPU above five percent of the machine, or process
metrics that grow at every post-warm-up sample without reaching a plateau is a
P1 investigation trigger. These are investigation thresholds, not a promise
that every machine has identical resource use.

## Allowed fixes

Fixes must be the smallest change that restores the accepted beta contract.
New semantics, providers, lifecycle modes, settings families, or distribution
features require a separate proposal and approval even if a hardening test
reveals demand for them.

## Frozen work

Calendar/provider expansion, Graph, OCR, generalized providers, code signing,
updater/release-channel implementation, autostart, tray behavior, telemetry,
and unrelated lifecycle or UI redesign remain closed. Preserve historical
ADRs/evidence and user-owned `docs/council/` and
`docs/plans/teams-unread-count-*` material.

## Exit decision

Close with one explicit result:

1. accept the beta for continued daily use and proceed to bounded UI refinement;
2. retain the beta while fixing one demonstrated P1 reliability defect;
3. use dogfood evidence to request one named signal-coverage research proposal;
4. pause distribution work because the current lifecycle is not reliable.
