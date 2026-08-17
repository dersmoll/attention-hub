# Milestone 9.3 focus and follow-up evidence — 2026-08-17

No real Inbox count, calendar URL, event value, Later Inbox content, or
notification body is recorded in this evidence.

## Automated evidence

| Gate | Result |
| --- | --- |
| Production frontend | Passed: TypeScript and Vite build completed with 50 transformed modules. |
| Frontend regressions | Passed: attention model, Later Inbox, preferences, time-zone, and responsive widget-layout suites. |
| Native tests | Passed: 45 tests, zero failures. |
| Native lint | Passed: Clippy for all targets with warnings denied. |
| Native formatting | Passed: `cargo fmt --all -- --check`. |
| Join boundary | Passed: allowlisted extraction, unsafe URL rejection, ephemeral-token lookup, and serialized URL-absence tests. |
| Later boundary | Passed: clean old-schema reset, v3 validation, link bounds, backup behavior, and one-shot due-state tests. |

## User acceptance

On 2026-08-17, the user reported testing the completed build throughout the
workday, found no critical or release-blocking issue, and approved it for
release. This records the user's acceptance result only; no source content,
calendar value, Later Inbox item, notification body, or telemetry was collected.

On 2026-08-18, the user ran the exact `0.5.0-beta.1` canonical installer and
reported that the requested installation/update, launch, persistence, M9.3
smoke, and close/reopen checklist passed. Independent clean-machine and
uninstall behavior remain unclaimed.
