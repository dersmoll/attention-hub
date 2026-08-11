# ADR 0012: Run a bounded Published ICS observer gate

- Status: Structure/freshness gate passed; bounded semantic phase pending
- Date: 2026-08-11

## Context

Windows `AppointmentStore` contains stale legacy residue. The Microsoft 365
Calendar companion exposes useful event structure only while its flyout is
visible, and New Outlook My Day unloads its useful tree when Outlook is
minimized. Microsoft Graph remains paused before registration, consent, token,
tenant, or request activity.

Outlook on the web permits this account to publish one explicitly selected
calendar as a read-only ICS URL. A direct fetch may be independent of Outlook
and companion-window state, but the generated URL is an anonymous bearer-style
secret whose permission level controls how much calendar information it
exposes.

## Decision

Add one manual Published ICS structure diagnostic in Advanced view:

- the user publishes and supplies the link manually; Attention Hub never opens,
  navigates, or controls Outlook or the Microsoft 365 Calendar companion;
- the first live test uses the least-detail **Can view when I'm busy**
  publication level;
- the URL is entered into a password field, cleared when the one-shot request
  starts, kept in memory only, and never returned, logged, persisted, committed,
  or copied into evidence;
- only `https://` or normalized `webcal://` Microsoft 365 Outlook publication
  URLs are accepted, with exact work-calendar hosts and the bounded
  `/owa/calendar/.../calendar.ics` path shape;
- credentials, query strings, fragments, non-default ports, arbitrary hosts,
  and non-calendar paths are rejected;
- automatic redirects and Referrer forwarding are disabled so the secret path
  cannot be forwarded to a different endpoint;
- the request has fixed connect/total timeouts and response-size limits;
- the response body is scanned in memory, zeroed afterward, and never crosses
  IPC;
- the DTO contains only HTTP status, content-type class, header-presence
  booleans, response size, line/property/component counts, event-shape counts,
  recurrence/timezone-property counts, timing, configured limits, and fixed
  diagnostics;
- event date/time values, subject, location, attendees, organizer, body,
  meeting URL, UID, raw ICS, header values, and the publication URL are excluded;
- semantic extraction and widget integration remain disabled.

The Microsoft 365 Calendar companion is retained as a user-visible comparison
oracle. Attention Hub does not inspect or control it during this gate.

## Bounds

| Boundary | Limit |
| --- | ---: |
| URL length | 4,096 bytes |
| Connect timeout | 5 seconds |
| Total request timeout | 10 seconds |
| Response body | 8 MiB |
| Physical lines | 250,000 |
| Properties | 200,000 |
| Events | 20,000 |
| One content line | 256 KiB |
| Structure scan | 500 ms |

## Progression gate

Proceed to a separately reviewed semantic phase only if direct-feed freshness
is acceptable across a harmless create/update/cancel cycle and the feed can
represent current/next selection, recurrence, exceptions, all-day events,
private events, timezones, and overlaps deterministically. The user must make a
separate privacy decision before increasing publication from busy-only to a
level that exposes titles or locations.

## Stop conditions

Stop this provider path if publication policy changes, anonymous-link risk is
unacceptable, the endpoint redirects outside the bounded contract, freshness
is too slow or inconsistent, one selected calendar cannot be distinguished,
private data is exposed unexpectedly, response bounds are exceeded, or
recurrence/timezone/cancellation parsing cannot be made deterministic.

Graph, polling, credential storage, production secret persistence, semantic
event extraction, and widget integration remain outside this decision.

Implementation and sanitized evidence are recorded in
`docs/milestones/evidence/m4b/2026-08-11-published-ics-structure.md`.

## Phase A outcome

One published calendar returned a balanced 600-event baseline. A harmless
one-off event appeared within a user-reported approximately one to two minutes;
conversion to a weekly series changed the recurrence structure within
approximately 30 seconds; deletion of the entire series restored the exact
baseline within approximately 30 seconds. No URL or event value entered IPC,
logs, or evidence.

Published ICS is retained for a separately reviewed minimal semantic phase.
This outcome does not approve a higher publication detail level, durable secret
storage, polling, semantic fields, or widget integration.
