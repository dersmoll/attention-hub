# ADR 0013: Run a bounded title-capable Published ICS semantic gate

- Status: Implemented; live gate pending
- Date: 2026-08-11

## Context

ADR 0012 observed one exact Microsoft 365 Published ICS calendar and acceptable
create/update/delete propagation of approximately 30 seconds to two minutes.
New Outlook My Day and the Microsoft 365 Calendar companion cannot operate as
passive minimized providers. Graph remains paused before registration,
consent, token, tenant, or request activity.

Microsoft documents **Can view titles and locations** as exposing busy state,
titles, and locations to the publication-link holder. The user explicitly
selected this title-capable tradeoff. Attention Hub does not need location and
must discard it.

## Decision

Add a separate Advanced one-shot semantic command and require an explicit UI
confirmation of the exact publication level. The command:

- reuses the ADR 0012 secret URL, transport, body, and structure bounds;
- accepts exactly one balanced, user-selected published calendar;
- resolves IANA timezones directly and Windows timezone IDs through
  Unicode-CLDR-derived mapping;
- rejects floating/ambiguous times and unsupported recurrence shapes;
- applies RFC 5545 recurrence inclusion, exclusion, and per-instance override
  semantics inside a fixed time window and occurrence cap;
- excludes cancellations and deterministically selects one active event or the
  earliest upcoming event;
- replaces private/confidential subjects and withholds their meeting-link
  presence;
- returns only subject, start, end, active/upcoming classification, and
  meeting-link presence;
- never returns or logs the publication URL, location, account, attendee,
  organizer, body, UID, raw ICS, or meeting URL.

The Microsoft 365 Calendar companion remains a manual visible comparison
oracle only. No source application is launched, focused, clicked, navigated, or
otherwise controlled.

## Stop conditions

Report unavailable rather than guessing if title capability is not confirmed,
the source is not exactly one calendar, a timezone or DST boundary is
ambiguous, recurrence parsing or overrides are unsupported, parsing exceeds a
bound, no eligible event exists, or source privacy behavior contradicts the
contract.

## Consequences

This decision authorizes a one-shot semantic provider test only. It does not
authorize durable bearer-link storage, Windows credential integration,
automatic polling, widget calendar integration, meeting URL return, join
action, Graph, or generalized provider work.

Implementation and sanitized evidence are recorded in
`docs/milestones/evidence/m4c/2026-08-11-published-ics-semantics.md`.
