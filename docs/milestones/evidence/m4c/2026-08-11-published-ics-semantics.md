# Published ICS bounded semantic evidence

- Date: 2026-08-11 Europe/Kyiv
- Scope: manual one-shot title-capable current/next gate
- Publication level: user-approved titles and locations; location discarded
- Live semantic result: direct backend retest observed one active selection
  after bounded all-day and stale-orphan recurrence corrections
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
- Full `cargo test --all-targets`: 30 passed, 0 failed, 1 pre-existing manual
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
| Authorized local backend retest | Observed | HTTP 200 calendar; 511,591 bytes; request 2,884 ms; parse 84 ms; 1,012 eligible candidates; 1 active candidate; 1,061 recurrence occurrences expanded; one selection present; no title, time, URL, or other event value recorded |
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

The follow-up direct backend diagnostic proved that the authorized calendar
was fetched and parsed normally rather than hanging. Its first terminal result
was `unsupportedRecurrence` because a detached recurrence exception was present
without its master. The recurrence policy now ignores such an exception only
when it is cancelled, already ended, or beyond the fixed lookahead. A current
or upcoming detached exception still makes the provider unavailable. The same
feed then produced one active selection within approximately three seconds.

Two app instances had also been running during the UI report, so the visible
window and captured terminal did not necessarily belong to the same process.
The Advanced UI now independently ends its pending state after 20 seconds if
IPC does not return. The user-provided publication URL was held only in process
memory for the local diagnostic and is absent from source, fixtures, logs,
documentation, and Git changes.
