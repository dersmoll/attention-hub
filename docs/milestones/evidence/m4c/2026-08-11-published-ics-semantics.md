# Published ICS bounded semantic evidence

- Date: 2026-08-11 Europe/Kyiv
- Scope: manual one-shot title-capable current/next gate
- Publication level: user-approved titles and locations; location discarded
- Live semantic result: pending
- Provider decision: pending

## Implemented boundary

The semantic command reuses the exact Microsoft publication URL restrictions,
redirect/Referrer protections, request/body limits, and balanced structure gate
from Milestone 4B. It then retains only the properties required to calculate a
single current-or-next result in memory. The response buffer is overwritten
after the bounded scan.

The selection DTO contains subject, start, end, active/upcoming classification,
and nullable meeting-link presence only. It contains no URL, location, account,
attendee, organizer, body, UID, raw ICS, or meeting URL. Logs contain only
status, counts, redaction state, stop reason, and timing—not the selection
values.

## Automated validation

- Focused semantic tests cover active-before-upcoming selection, deterministic
  active overlaps, weekly recurrence with a cancelled override, Windows
  timezone mapping, all-day calendar dates, private redaction, floating-time
  and `THISANDFUTURE` rejection, and meeting-link presence without URL return.
- `cargo check --all-targets`: passed.
- `cargo clippy --all-targets -- -D warnings`: passed.
- Full `cargo test --all-targets`: 27 passed, 0 failed, 1 pre-existing manual
  AppointmentStore diagnostic ignored.
- `cargo fmt --all -- --check`: passed.
- TypeScript check and Vite production build: passed; 40 modules transformed.
- Final native debug executable build: passed.

## Live result

Record only sanitized pass/fail behavior and numeric bounds. Do not transcribe
the publication URL, event title, event time, location, account, UID, attendee,
organizer, body, or meeting URL.

| Scenario | Result | Sanitized notes |
| --- | --- | --- |
| First title-capable active-or-next selection | Pending | — |
| In-progress versus upcoming | Pending | — |
| Recurring and one-off | Pending | — |
| Cancelled instance/series | Pending | — |
| Private event | Pending | — |
| All-day event | Pending | — |
| Overlapping events | Pending | — |

## Decision gate

Production polling, secret storage, and widget integration remain unapproved
until the live title-capable result and required edge cases establish that the
provider stays accurate and private within the documented bounds.
