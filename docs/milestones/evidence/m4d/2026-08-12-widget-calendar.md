# Saved work-calendar widget evidence

- Date: 2026-08-12 Europe/Kyiv
- Scope: one saved Published ICS active-or-next widget selection
- Sensitive values recorded: none

## Implemented boundary

The application verifies one fresh semantic result before writing the source
link to a fixed application credential in Windows Credential Manager. IPC
configuration and snapshot DTOs contain no URL. Logs include only status,
configuration/storage booleans, selection presence, stop reason, and timing.

The widget performs one request at a time, refreshes at event transitions or at
most every two minutes, and discards the prior selection on any terminal
failure. Save and removal produce a payload-free invalidation event.

## Automated validation

- `cargo test --all-targets`: 29 production-surface tests passed, 0 failed,
  0 ignored after retired provider modules left the command surface.
- TypeScript check and Vite production build: passed; 41 modules transformed.

## Live validation

Do not add the source URL or event values to this file.

| Scenario | Result | Sanitized notes |
| --- | --- | --- |
| Verify and save | Passed | Completed in 2.3 seconds; terminal status `observed`, configured true, selection present; provider timing 2,162 ms request and 70 ms parse |
| Widget active-or-next presentation | Passed | The live widget exposed one active state, one non-empty subject node, one time/detail node, and no join button; values were not recorded |
| Restart and fresh re-fetch | Passed | After a full process restart, the first saved-source request returned `observed`, configured true, and selection present; provider timing 1,615 ms request and 71 ms parse |
| Remove/unavailable clears selection | Passed | Removal changed the widget to not configured in 0.28 seconds with no prior event nodes retained |
| Restore approved source | Passed | Fresh verification restored an active widget selection in 3.2 seconds; the approved source is left configured |
| Active all-day context with upcoming timed event | Passed after correction | Live saved-source refresh selected `upcoming`, did not select the all-day context, and exposed a relative countdown plus exact time range; only booleans and text lengths were inspected, and values were not recorded |
| Active plus upcoming bounded result | Automated | Synthetic active/timed, upcoming/timed, all-day fallback, and private upcoming companion cases verify at most two redacted event DTOs; a non-sensitive `allDay` flag prevents call alerts on fallback context |
| 24-hour and acknowledgement UI | Passed | A harmless timed test event showed the amber starting-soon state, transitioned to the red started state with **I'm in**, and returned to normal in-progress colors after acknowledgement while revealing exactly one upcoming companion. Both ranges used 24-hour time; no event values were retained in evidence |
| Production surface closeout | Passed | Completed My Day, Published ICS spike, Graph, and legacy AppointmentStore controls were removed from Advanced and their IPC entry points were removed; the secure saved-calendar configuration remains available |
| Canonical Windows artifact | Passed | Version `0.2.0` produced one verified NSIS bundle target; filename, size, SHA-256, and unsigned status are recorded in the release record |
