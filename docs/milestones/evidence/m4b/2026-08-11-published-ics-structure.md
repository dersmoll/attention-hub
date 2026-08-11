# Published ICS sanitized structure evidence

- Date: 2026-08-11 Europe/Kyiv
- Scope: manual one-shot Published ICS structure gate
- Provider decision: pending live freshness evidence
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
| Same event updated | Pending | — | — |
| Same event cancelled/deleted | Pending | — | — |

## Decision gate

Do not begin semantic extraction or persistence unless one exact published
calendar is observed, refresh delay is acceptable for an active/next-event
widget, and recurrence/timezone/cancellation/private behavior is deterministic.
Stop if the secret-link exposure is unacceptable or the endpoint is stale,
ambiguous, redirected, oversized, malformed, or unexpectedly reveals private
content.
