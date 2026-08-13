# ADR 0016: Acknowledge an active event and show one upcoming companion

- Status: accepted
- Date: 2026-08-12

## Context

One active-or-next event gives a truthful focal point, but it does not show the
user what follows after they have joined the active meeting. A scheduled event
also needs a stronger visual transition near and at its start than an ordinary
green status label.

This remains an attention widget, not a calendar agenda. The provider must stay
bounded, and acknowledgement must not write to Outlook, the ICS source, or
durable browser storage.

## Decision

The semantic result may contain at most two event DTOs:

- `selection`: the existing active-or-next primary;
- `nextSelection`: the earliest future event, returned only when the primary
  is active.

Both DTOs retain the existing subject, start, end, active/upcoming
classification, and nullable meeting-link fields, plus one non-sensitive
`allDay` boolean required to prevent call alerts on all-day fallback context.
Timed events continue to rank before all-day context. Overlapping active events
are not mislabelled as upcoming; the companion must start in the future.

The widget uses this fixed presentation state machine:

1. More than five minutes before start: ordinary **Up next** styling.
2. Within five minutes before start: static amber **Starting soon** styling.
3. From start until acknowledgement: pulsing red **Meeting started** styling
   with a small **I'm in** button.
4. After acknowledgement: ordinary **In progress** styling with exactly one
   compact **Up next** companion below it.
5. At event end or when a different event becomes primary: the acknowledgement
   no longer applies.

The acknowledgement key contains only primary start/end values and exists only
in React memory for the current app process. It is not sent to the backend,
persisted, logged, or written to the calendar. Reduced-motion settings disable
the pulse while retaining the red visual state.

All widget event times use a forced 24-hour clock. Countdown labels are derived
locally from approved timestamps and do not change the provider refresh policy.

## Consequences

The user gets an explicit pre-call warning, a persistent started-call alert
until acknowledgement, and current-plus-next context after joining. The widget
still exposes no agenda, meeting URL, join action, calendar write, account
selection, or source-app control.
