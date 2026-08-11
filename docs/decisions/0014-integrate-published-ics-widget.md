# ADR 0014: Integrate one Published ICS event into the widget

- Status: accepted
- Date: 2026-08-12

## Context

Milestone 4C produced one bounded active-or-next selection from a user-selected,
title-capable Microsoft 365 published calendar. Direct backend and Tauri IPC
tests succeeded, and the user confirmed that the displayed selection matched
the visible calendar. The remaining product need is deliberately smaller than
an agenda: the widget needs only the current event or, when none is active, the
next event.

The publication link is a bearer secret. Browser local storage, source files,
logs, fixtures, and documentation are not acceptable persistence locations.
Published ICS can also lag the calendar by roughly 30 seconds to two minutes,
so a failed request cannot be replaced with an apparently current cached event.

## Decision

Attention Hub will integrate exactly one user-saved Published ICS source on
Windows.

- Advanced verifies a fresh title-capable semantic result before saving or
  replacing the source.
- The link is stored as an application-specific generic credential for the
  current Windows user, with local-machine persistence. It is never returned
  over IPC or written to browser storage.
- One process-wide async gate serializes saved-source verification, refresh,
  replacement, and removal. A competing widget refresh returns `busy` without
  an event rather than contending indefinitely.
- The widget requests a fresh bounded result at startup, at most every two
  minutes, and at the selected event's start or end boundary. Unavailable
  results retry after 30 seconds.
- Every refresh replaces the previous snapshot. Timeout, transport failure,
  ambiguity, missing configuration, or storage failure yields no selection;
  cached data is not presented as current.
- The widget receives only subject, start, end, `active`/`upcoming`, and
  nullable meeting-link presence. It has no meeting URL and no join action.
- Save and remove emit a payload-free local invalidation event so the widget
  refreshes immediately.

## Consequences

The widget can now show one `In progress` or `Up next` work-calendar event
without controlling Outlook, reading Outlook profile data, or using Graph.
Windows Credential Manager provides scoped durable storage, but a generic
credential remains readable by processes running as the same Windows user; the
link must still be treated as a revocable bearer secret.

This decision does not add a full agenda, multiple calendars/accounts, OCR,
calendar writes, join actions, attendees, organizer, body, location, meeting
URL return, Graph/Entra activity, or generalized provider infrastructure.
