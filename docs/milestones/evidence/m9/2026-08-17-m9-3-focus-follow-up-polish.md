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

## Manual installed-app acceptance still required

- Minimize and restore New Outlook; confirm no stale number or ellipsis appears.
- Use one real allowlisted current/next calendar event; confirm Join opens the
  expected default-handler target without exposing the URL in diagnostics.
- Review Work and Private tabs at normal and 340 by 360 minimum size; verify
  notes disclosure with pointer, Enter/Space, and visible focus.
- Enable due notifications in the Later window and confirm one installed-app
  toast, private-title redaction, no duplicate after refresh, and reset after a
  follow-up change.
