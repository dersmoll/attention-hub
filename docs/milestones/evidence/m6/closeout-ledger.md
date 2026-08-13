# Milestone 6 closeout ledger

- Audited: 2026-08-13 Europe/Kyiv
- Production baseline: `ab9e228`, tag `v0.3.0-beta.1`
- Installed candidate: `da431d3`, tag `v0.4.0-beta.1`
- Current evidence branch: `codex/m6-beta-hardening`
- Sensitive values recorded: none

This ledger maps every Milestone 6 matrix item to authoritative evidence. A
case marked **manual** or **environment-blocked** is intentionally not implied
to have passed.

## Startup and process lifecycle

| Matrix case | Result | Evidence |
| --- | --- | --- |
| Three installed starts with no prior Attention Hub process | **Passed** | Three dedicated JSON records verify a zero-process precondition, widget exposure in 182, 179, and 187 ms, and settled `-1040,985,960,80` geometry after an eight-second readiness delay. Native visuals were not required by current source attention during these starts and were not treated as startup semantics. |
| Three normal quit/restart cycles | **Passed** | `2026-08-13-installed-lifecycle.md`; 297, 208, and 194 ms, plus a later 203 ms full-tree restart. |
| Two suspend/resume cycles | **Passed** | `2026-08-13-installed-suspend-resume.json`; same process, widget, and two visual surfaces survived both S3 cycles. |
| Reopen and close Advanced twice | **Passed** | `2026-08-13-installed-outlook-fallback.json`; only Advanced closed, while widget and process survived. |
| Normal widget close exits owned process tree | **Passed** | `2026-08-13-installed-lifecycle.md`; zero Attention Hub/WebView children remained before the 203 ms direct restart. |

## Source and shell recovery

| Matrix case | Result | Evidence |
| --- | --- | --- |
| Outlook observed → minimized last-observed → restored observed, three cycles | **Passed** | `2026-08-13-installed-outlook-fallback.json`; classifications and transition timings only. The evidence does not retain unread values or source labels. |
| Stop Outlook and clear retained value | **Manual** | Not executed because source applications were not terminated during this bounded closeout. |
| Close/reopen Teams and Telegram while separating semantics from visuals | **Manual** | Requires deliberately stopping the user's running source applications. |
| Restart Explorer twice and recover mirrors | **Passed with P2 observation** | `2026-08-13-installed-lifecycle.json` and settled recheck. One first-cycle visual missed the 35-second deadline; the next two cycles recovered both. Tracked as `M6-003`, observed once and not reproduced from the same settled state. |
| Reorder a real taskbar button | **Manual** | Requires user taskbar interaction and a stable real-attention window. |
| Activate running sources from React/native surfaces; never launch stopped source | **Manual** | Windows foreground permission makes synthetic input non-authoritative. No source launch/termination was used to manufacture a result. Native implementation selects only visible windows of already-running matching executables and returns an error when none exists; real-user confirmation remains open. |

## Display and geometry recovery

| Matrix case | Result | Evidence |
| --- | --- | --- |
| Move widget across both daily-use monitors in both directions | **Passed** | `2026-08-13-installed-lifecycle.md`; secondary → primary → secondary and exact saved-position restoration. |
| Exercise every daily-use scale factor | **Passed for available topology; mixed DPI environment-blocked** | Both displays reported 96 DPI. Widget remained 960 by 80 and native surfaces 40 by 40. No second scale factor exists without changing Windows display settings. |
| Move Teams and Telegram source windows independently/together between monitors | **Manual** | Requires moving the user's real source windows and is distinct from widget cross-monitor evidence. |
| Disconnect/reconnect secondary display | **Manual** | Would disrupt the current desktop; explicitly left unexecuted by the matrix's own exception. |

## Preference persistence and migration

| Matrix case | Result | Evidence |
| --- | --- | --- |
| Position, pin, timezone, appearance, opacity, and app order survive restart | **Passed across prior live evidence and installed lifecycle** | M5C evidence covers live edit/reset/persistence; M7 evidence covers source-control persistence/reset; `2026-08-13-installed-lifecycle.md` verifies position, pin, opacity, order, monitoring/visual selections, and configured calendar through uninstall and upgrade. The closeout did not rewrite user preferences solely to duplicate prior accepted evidence. |
| Valid legacy v1 subset migrates with defaults | **Passed** | `scripts/test-widget-preferences.mjs`. |
| Malformed values recover to bounded defaults | **Passed; M6-001 fixed and verified** | `scripts/test-widget-preferences.mjs` and `issue-log.md`. |
| Widget/Advanced synchronization and bounded resets | **Passed** | `docs/milestones/evidence/m7/2026-08-13-fixed-source-controls.md` and M5C evidence. |
| Acknowledgement stays process-memory-only and clears on restart | **Passed by implementation and accepted live behavior; no calendar data fabricated** | `WidgetView.tsx` holds acknowledgement only in React state; M4D evidence verifies live acknowledgement behavior. The installed closeout preserved the configured saved source but did not invent an active event. |
| Saved ICS credential is version-independent and explicit-removal-owned | **Passed for retention; removal not executed** | Exact Credential Manager target remained through uninstall and `0.3.0-beta.1` → `0.4.0-beta.1` upgrade. Its value was never read. Explicit removal is source-owned behavior covered by the existing calendar milestone and was not invoked here. |

## Installer and disk behavior

| Matrix case | Result | Evidence |
| --- | --- | --- |
| Canonical name/version/size/hash/signature | **Passed** | `2026-08-13-installed-lifecycle.md` and release records; both installers matched canonical metadata and were unsigned. |
| Current-profile install, direct launch, uninstall, retained data, reinstall | **Passed** | `2026-08-13-installed-lifecycle.md`; application directory/uninstall entry removed, preference storage and calendar credential retained, and direct installed launches passed. |
| Upgrade rehearsal | **Passed for available supported path: 0.3 → 0.4** | The matrix text named `0.2.0` → `0.3.0`; the bounded candidate under test is `0.4.0-beta.1`, so the safe relevant predecessor upgrade executed was `0.3.0-beta.1` → `0.4.0-beta.1`. No `0.2` → `0.3` claim is made. |
| Clean-machine checklist | **Checklist complete; execution environment-blocked** | `clean-machine-checklist.md`; Sandbox is disabled and Hyper-V has no VM. Enabling/creating an environment requires a separate system decision. |
| Installer/installed/user-data/build-cache size | **Passed** | `2026-08-13-installed-lifecycle.md`. Exact `cargo clean` removed 8.9 GiB of rebuildable target output; current registered worktrees contain no Rust target cache. |

## Resource run

| Matrix case | Result | Evidence |
| --- | --- | --- |
| 30–60 minute installed session with real mirror controllers | **Passed** | `2026-08-13-installed-beta-resource-30m.csv`; 1,884 seconds and 360 samples. |
| Five-second process-tree samples after ten-minute warm-up | **Passed** | 245 post-warm-up samples, stable seven-process count, 3.178 percent average normalized machine CPU. |
| Growth/threshold audit and separate recovery timing | **Passed** | Working set, private bytes, and handles did not grow at every sample; Explorer, S3, Outlook, and display transitions have separate JSON/timing evidence. |

## Disk and worktree re-audit

- C: currently has approximately 17.37 GiB free, up from 9.376 GiB at entry.
- The current and separate clean `main` worktrees contain no `src-tauri/target`.
- The current worktree retains approximately 81.4 MiB of frontend dependencies
  needed for focused tests. Removing them would save little and force a later
  reinstall, so they were preserved.
- `git worktree prune --dry-run --verbose` found no stale registrations.
- The separate clean `main` worktree remains preserved because its task ownership
  is unknown and it contains no material build cache.

## Remaining gates

The safe current-machine closeout is complete. These gates remain deliberately
open and are not defects by themselves:

1. four additional distinct calendar days of sanitized dogfood evidence;
2. disposable clean-machine execution after choosing Sandbox or a VM;
3. mixed-DPI/display disconnect and real source-window monitor movement;
4. source stop/reopen, Outlook stopped/cleared, taskbar reorder, and real-user
   React/native activation.

The daily heartbeat is active and must append at most one entry per distinct
calendar day, then complete the five-day exit summary and disable itself.
