# Milestone 4D: Saved work-calendar widget event

## Status

Implemented on 2026-08-12. Secure save, restart, clear/restore, timed-event
ranking, countdown, and 24-hour display are live-validated. The new natural
start/acknowledgement transition remains a visible event-boundary check. The
approved source is left configured.

## Product outcome

Show exactly one current or next work-calendar event in the widget from the
already validated Microsoft 365 Published ICS source.

## Boundary

- Windows only.
- One explicitly user-selected published calendar; never infer or combine
  accounts.
- Verify before saving or replacing.
- Persist the bearer link only in Windows Credential Manager.
- Poll single-flight at a maximum normal interval of two minutes, with a
  30-second unavailable retry and event-boundary refresh.
- Return only subject, start, end, `allDay`, active/upcoming classification,
  and nullable meeting-link presence. `allDay` prevents call alerts and
  acknowledgement controls from appearing on contextual fallbacks.
- Treat date-only all-day and multi-day entries as context: active and upcoming
  timed events rank first, while all-day entries remain truthful fallbacks.
- Derive an `In …` or `Ends in …` countdown locally from the selected start/end
  while retaining the exact local time range.
- Format all event times with a forced 24-hour clock.
- Return at most one future companion when the primary is active. Five minutes
  before start the primary turns amber; at start it pulses red until **I'm in**
  is selected; acknowledgement restores normal colors and reveals the compact
  upcoming companion.
- Keep acknowledgement in process memory only. It never writes to the calendar
  or browser storage and does not apply to a different event.
- Clear the event on every unavailable, busy, timeout, IPC, storage, or parsing
  failure.
- Keep structure and semantic one-shot diagnostics available in Advanced.

## Manual acceptance

1. Start one fresh development build.
2. In Advanced, paste the locally generated title-capable ICS link, confirm the
   publication level, and select **Save securely and use in widget**.
3. Confirm the widget matches the visible current-or-next event.
4. Close and restart Attention Hub; confirm the source remains configured and
   a fresh event is fetched.
5. Temporarily make the source unavailable or use **Remove saved calendar**;
   confirm the widget immediately shows unavailable/not configured and does not
   retain the prior event.
6. Restore/save the approved source if continued use is desired.

Record only status, counts, and timing. Do not record the URL, subject, times,
location, account, UID, attendees, organizer, body, or meeting URL.

## Acceptance gate

- [x] Dedicated Milestone 4D branch preserves earlier work and user-owned
      untracked files.
- [x] One source is verified before it is persisted.
- [x] The link does not cross IPC responses or browser storage.
- [x] Saved-source requests are bounded and single-flight.
- [x] Failed refreshes return no selection.
- [x] The widget shows only one active-or-next selection and has no join action.
- [x] Save/remove invalidation contains no payload.
- [x] Focused Rust tests and the production frontend build pass.
- [x] Live save and widget presentation pass.
- [x] Restart persistence and fresh re-fetch pass.
- [x] Live removal/unavailability clears the widget immediately.
- [x] Active multi-day context no longer preempts the next timed event.
- [x] Active results can include exactly one bounded upcoming companion.
- [x] Event times use 24-hour formatting.
- [x] Starting-soon, started/pulsing, and acknowledged presentation states are
      implemented with reduced-motion handling.
- [ ] A naturally occurring event boundary confirms the amber, red pulse,
      acknowledgement, and compact current-plus-next layout live.

## Non-goals

No Graph/Entra activity, Outlook control, OCR, screenshots, profile/cache/token
access, multiple calendars, full agenda, seven-day UI, calendar writes, meeting
URL return, join action, attendees, organizer, body, location, installer, or
generalized provider framework.
