# Milestone 6 daily-use log

Do not include private source content, raw accessibility labels, account
identifiers, calendar URLs/event values, or source pixels. Use issue IDs from
`issue-log.md` when a behavior repeats.

## Run context

- Revision/tag:
- Launch mode: installed beta / direct release executable / development
- Windows build:
- Attention Hub version:
- Teams, Telegram, and Outlook versions:
- Display and DPI arrangement:
- Existing preference source: fresh / prior v1 / migrated install

## Day N — YYYY-MM-DD

- Approximate active-use duration:
- Start/restart/suspend/Explorer/display transitions exercised:
- Source availability periods by `observed`, `notRunning`, `notExposed`, or
  `error`:
- Outlook fresh/last-observed/cleared transitions:
- Mirror hide/recovery behavior:
- Preference or saved-calendar persistence result:
- False positive, false negative, or misleading all-clear:
- Highest-value unrepresentable attention need:
- UI/accessibility friction:
- Resource sample file or summary:
- Issue IDs opened or reproduced:
- No-issue cases explicitly observed:

## Day 1 — 2026-08-13

- Approximate active-use duration: bounded same-day installed lifecycle session;
  separate 31.4-minute installed resource run completed
- Start/restart/suspend/Explorer/display transitions exercised: one true initial
  installed cold start, a dedicated three-start zero-process gate, three normal
  restarts, two S3 suspend/resume cycles, three recorded Explorer restarts, and
  secondary-to-primary-to-secondary movement
- Source availability periods by `observed`, `notRunning`, `notExposed`, or
  `error`: Teams and Telegram were `observed`; Outlook moved between `observed`
  and explicit `lastObserved`; no source values were persisted
- Outlook fresh/last-observed/cleared transitions: three real minimize/restore
  cycles passed `observed` → `lastObserved` → `observed`; stopped/cleared was not
  executed because the closeout did not terminate Outlook
- Mirror hide/recovery behavior: one first-cycle Explorer restart exposed only
  the Teams surface at the 35-second deadline; the next restart recovered both
  in 6.49 seconds and a settled recheck recovered both in 14.34 seconds; both
  remained aligned through suspend/resume and every monitor movement
- Preference or saved-calendar persistence result: position, always-on-top,
  opacity, app order, all monitoring/visual selections, and configured calendar
  survived uninstall, `0.3.0-beta.1` install, and in-place `0.4.0-beta.1` upgrade
- False positive, false negative, or misleading all-clear: none observed in the
  executed lifecycle cases
- Highest-value unrepresentable attention need: not assessed in this bounded
  lifecycle session
- UI/accessibility friction: none observed
- Resource sample file or summary:
  `2026-08-13-installed-beta-resource-30m.csv`; 360 samples, seven processes
  throughout the post-warm-up interval, 3.178 percent average normalized CPU,
  and no every-sample working-set/private-byte/handle growth
- Issue IDs opened or reproduced: `M6-003` observed once, not reproduced from
  the settled state
- No-issue cases explicitly observed: startup, restart, Explorer recovery,
  S3 resume, same-DPI monitor movement, preference/uninstall retention, in-place
  upgrade, Outlook minimized fallback/recovery, Advanced isolation, complete
  normal process-tree exit, and the resource threshold gate

## Day 2 — 2026-08-14

- Approximate active-use duration: read-only installed-state checkpoint only;
  no installed Attention Hub process was running
- Version and process/window availability: installed registration and executable
  for `0.4.0-beta.1` were present on Windows build 26220; installed process,
  widget window, and owned visual windows were unavailable
- Start/restart/suspend/Explorer/display transitions exercised: none; the
  checkpoint did not launch or alter the installed application or system state
- Source availability periods by `observed`, `notRunning`, `notExposed`, or
  `error`: no classification captured because the installed observer was not
  running; all six fixed source processes were independently available, but
  process presence was not promoted to attention semantics
- Outlook fresh/last-observed/cleared transitions: not exercised
- Mirror hide/recovery behavior: visual surfaces were hidden/unavailable with
  the installed process stopped; no recovery transition was exercised
- Preference or saved-calendar persistence result: preference storage present
  `true`; saved calendar credential configured `true`; no values were read
- False positive, false negative, or misleading all-clear: not assessable
  without a running installed observer
- Highest-value unrepresentable attention need: not assessed
- UI/accessibility friction: not assessed
- Resource sample file or summary: no new sample; retained reference
  `2026-08-13-installed-beta-resource-30m.csv`
- Issue IDs opened or reproduced: none
- No-issue cases explicitly observed: installed registration/executable
  availability and persistence-container presence only

## Day 3 — 2026-08-17

- Approximate active-use duration: read-only installed-state checkpoint only;
  no installed Attention Hub process was running
- Version and process/window availability: installed registration and executable
  for `0.4.0-beta.1` were present on Windows build 26220; installed process,
  widget window, and owned visual windows were unavailable
- Start/restart/suspend/Explorer/display transitions exercised: none; the
  checkpoint did not launch or alter the installed application or system state
- Source availability periods by `observed`, `notRunning`, `notExposed`, or
  `error`: no classification captured because the installed observer was not
  running; Teams, Telegram, Outlook, Viber, and WhatsApp processes were
  independently available while Slack was not, but process presence was not
  promoted to attention semantics
- Outlook fresh/last-observed/cleared transitions: not exercised
- Mirror hide/recovery behavior: zero visible widget or mirror windows and zero
  hidden owned windows; no recovery transition was exercised
- Preference or saved-calendar persistence result: preference storage present
  `true`; saved calendar credential configured `true`; no values were read
- False positive, false negative, or misleading all-clear: not assessable
  without a running installed observer
- Highest-value unrepresentable attention need: not assessed
- UI/accessibility friction: not assessed
- Resource sample file or summary: no new sample; retained reference
  `2026-08-13-installed-beta-resource-30m.csv`
- Issue IDs opened or reproduced: none
- No-issue cases explicitly observed: installed registration/executable
  availability and persistence-container presence only

## Day 4 — 2026-08-18

- Approximate active-use duration: read-only installed-state checkpoint while
  Attention Hub was running; no lifecycle transition was initiated
- Version and process/window availability: installed registration and running
  executable reported `0.5.0-beta.1` on Windows build 26220; one Attention Hub
  process owned two visible and seven hidden non-mirror top-level windows
- Start/restart/suspend/Explorer/display transitions exercised: none; the
  checkpoint did not launch, stop, or alter the application or system state
- Source availability periods by `observed`, `notRunning`, `notExposed`, or
  `error`: all six fixed source processes were available; Teams, Telegram,
  Outlook, Viber, and WhatsApp were `observed`, while Slack was `notExposed`;
  no counts, content, or raw accessibility labels were retained
- Outlook fresh/last-observed/cleared transitions: one `observed` snapshot;
  fallback and cleared transitions were not exercised
- Mirror hide/recovery behavior: four mirror windows were visible and none were
  hidden; no hide or recovery transition was exercised
- Preference or saved-calendar persistence result: preference storage present
  `true`; saved calendar credential configured `true`; no values were read
- False positive, false negative, or misleading all-clear: not assessable from
  the read-only checkpoint alone
- Highest-value unrepresentable attention need: not assessed
- UI/accessibility friction: not assessed
- Resource sample file or summary: no new sample; retained reference
  `2026-08-13-installed-beta-resource-30m.csv`
- Issue IDs opened or reproduced: none
- No-issue cases explicitly observed: installed registration/process presence,
  generic fixed-source classifications, visible mirror availability, and
  persistence-container presence

## Five-day exit summary

- Total observed use:
- P0/P1/P2/P3 counts:
- Most common implementation failure:
- Most common semantic coverage gap:
- Most common UI friction:
- Any privacy or data-retention concern:
- Resource trend conclusion:
- Installer/upgrade/uninstall conclusion:
- Unexecuted cases:
- Recommended exit decision:
