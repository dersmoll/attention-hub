# ADR 0015: Rank timed events before all-day calendar context

- Status: accepted
- Date: 2026-08-12

## Context

The live widget correctly selected a multi-day all-day entry as active, but
that entry represented ongoing calendar context rather than the next scheduled
appointment. Outlook presents all-day context separately and highlights the
next timed event with a relative countdown.

The Published ICS parser already distinguishes date-only all-day entries from
timed entries internally. That distinction was lost when normalized events
became selection candidates, so the sorter treated a multi-day entry exactly
like an active meeting.

## Decision

Preserve the internal all-day flag through candidate expansion and rank one
bounded selection in this order:

1. active timed event;
2. earliest upcoming timed event;
3. active all-day or multi-day entry;
4. earliest upcoming all-day entry.

Existing deterministic start, end, UID, and source-order tie-breakers remain
unchanged within each category. All-day entries remain eligible as fallback,
so a calendar containing only an all-day item still produces a truthful
selection.

The widget adds a local relative label—`In …` for upcoming or `Ends in …` for
active—before the exact local time range. This is presentation derived from the
already approved start/end fields; it does not alter provider data or polling.

## Consequences

Long-running vacation, holiday, focus, and similar all-day entries no longer
hide a timed appointment. This is an application ranking policy rather than an
attempt to infer intent from titles, free/busy state, account identity, or
calendar color.
