# Published ICS sanitized structure evidence

- Date: 2026-08-11 Europe/Kyiv
- Scope: manual one-shot Published ICS structure gate
- Provider decision: retain for a bounded semantic phase; production pending
- Semantic extraction: not implemented
- Live publication/fetch: sanitized structure observed

## Implemented boundary

The Advanced view accepts one masked Published ICS link and clears the field as
soon as the probe starts. The backend validates a bounded Microsoft 365 Outlook
publication URL, performs one HTTPS GET with redirects and Referrer disabled,
reads no more than 8 MiB, scans component/property names in memory, zeroes the
body, and returns sanitized counts only.

The URL, redirect location, response header values, raw response, event times,
subject, location, people, body, meeting link, UID, and arbitrary error text do
not enter logs, IPC evidence, docs, or fixtures. Network-library error strings
are replaced with fixed diagnostics because they may include the request URL.

## Automated validation

- Microsoft publication URL validation accepts bounded HTTPS and normalized
  webcal work-calendar links.
- URL validation rejects HTTP, arbitrary hosts, unrelated paths, query strings,
  fragments, embedded credentials, and non-default ports.
- The sanitized scanner counts balanced VCALENDAR/VEVENT, DTSTART,
  DTEND/DURATION, RRULE, RDATE, EXDATE, RECURRENCE-ID, VTIMEZONE, and TZID
  structure without returning values.
- Malformed component nesting is rejected.
- `cargo check --all-targets`: passed.
- `cargo clippy --all-targets -- -D warnings`: passed.
- Full `cargo test`: 21 passed, 0 failed, 1 pre-existing manual
  AppointmentStore diagnostic ignored.
- TypeScript check and Vite production build: passed; 40 modules transformed.

## Live structure result

Fill this table only from the sanitized DTO. Never paste or transcribe the URL,
raw ICS, event values, header values, or source-account text.

| Permission | Status | HTTP/type | Bytes | Calendars/events | Start/end shape | Recurrence | Timezones | Request/parse ms | Stop reason |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| Busy only, per manual procedure; not verifiable from DTO | Observed | 200 / calendar | 458,451 | 1 / 600 | 600 / 600 | RRULE 38; RDATE 0; EXDATE 25; overrides 284 | definitions 8; references 1,487 | 5,766 / 5 | None |

The response contained 13,667 properties across 14,297 physical lines, including
629 folded lines. ETag, Last-Modified, Cache-Control, and Age headers were all
absent. The result confirms one bounded, balanced calendar structure but does
not yet establish feed freshness. Without validators, each freshness probe must
download the full response; production polling remains out of scope.

## Freshness matrix

Use the Microsoft 365 Calendar companion only as the user-visible comparison
oracle. Record elapsed delay and sanitized structural/current-next outcomes;
never record event content.

| Manual source change | Direct feed result | Elapsed delay | Notes |
| --- | --- | ---: | --- |
| Harmless event created | Observed; events 600 → 601, bytes 458,451 → 459,158, properties 13,667 → 13,689, lines 14,297 → 14,320 | Approximately 1–2 minutes, user-reported | Event content and scheduled time redacted |
| Same event changed from one-off to weekly recurring | Observed; RRULE 38 → 39, properties 13,689 → 13,690, lines 14,320 → 14,321; event count remained 601 | Approximately 30 seconds, user-reported | Event content and scheduled time redacted |
| Entire recurring test series deleted | Observed; events 601 → 600, RRULE 39 → 38, properties 13,690 → 13,667, lines 14,321 → 14,297, timezone references 1,489 → 1,487, bytes 459,228 → 458,451 | Approximately 30 seconds, per manual procedure | Returned exactly to the pre-test structural baseline |

### Freshness outcome

The published feed reflected creation in approximately one to two minutes,
conversion to a weekly recurrence in approximately 30 seconds, and deletion of
the entire series in approximately 30 seconds. The deletion result returned
exactly to the original sanitized structural baseline. This is sufficient to
retain Published ICS for a separately reviewed semantic phase. It does not yet
approve subject exposure, secret persistence, polling, or widget integration.

## Decision gate

One exact calendar and acceptable create/update/delete freshness are now
observed. A separately approved semantic phase must still prove deterministic
current/next selection and recurrence/timezone/cancellation/private behavior.
Stop if the secret-link exposure is unacceptable or the endpoint becomes stale,
ambiguous, redirected, oversized, malformed, or unexpectedly reveals private
content.
