# Published ICS bounded semantic evidence

- Date: 2026-08-11 Europe/Kyiv
- Scope: manual one-shot title-capable current/next gate
- Publication level: user-approved titles and locations; location discarded
- Live semantic result: first gate exposed an all-day date handling defect;
  the first corrected-build retest then exposed a missing command-level
  deadline; deadline-corrected build pending retest
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
- Full `cargo test --all-targets`: 29 passed, 0 failed, 1 pre-existing manual
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
| First title-capable active-or-next selection | Unavailable | HTTP 200 calendar; 511,591 bytes; request 4,813 ms; parse 39 ms; the first implementation incorrectly required a timezone for an RFC date-only all-day event |
| First all-day-corrected retest | Timeout defect | The UI remained loading for more than five minutes; process sampling showed no sustained CPU work, so the one-shot command lacked a reliable terminal boundary around the native request path |
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

### First live-gate correction

The first title-capable request returned no event values and stopped with
`ambiguousTime` because an all-day `DATE` lacked `TZID` and the calendar lacked
`X-WR-TIMEZONE`. RFC 5545 defines all-day `DATE` values as calendar dates with
an inclusive start and non-inclusive end; they are not floating timed meetings.
The implementation was narrowed so date-only boundaries use the viewer's
current Windows timezone. Timezone-less `DATE-TIME` values remain rejected.

### First corrected-build timeout correction

The next manual retest remained in the loading state for more than five
minutes. No URL, response body, or event value was captured as evidence. The
application process was responsive and showed no sustained CPU activity during
a bounded sample, which is consistent with a stalled native network, proxy, or
TLS wait rather than recurrence expansion.

The complete semantic operation now runs in an isolated task behind a fixed
15-second deadline. On expiry the task is aborted and the command returns a
sanitized `timeout` result with stop reason `commandDeadline`; it does not
return cached event data. A focused unit test verifies that this terminal DTO
contains no selection and leaves semantic extraction disabled.
