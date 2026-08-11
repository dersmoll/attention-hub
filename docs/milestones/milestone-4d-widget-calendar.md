# Milestone 4D: Saved work-calendar widget event

## Status

Implemented and live-validated on 2026-08-12. The approved source is left
configured after a save, full app restart, remove/clear, and restore sequence.

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
- Return only subject, start, end, active/upcoming classification, and nullable
  meeting-link presence.
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

## Non-goals

No Graph/Entra activity, Outlook control, OCR, screenshots, profile/cache/token
access, multiple calendars, full agenda, seven-day UI, calendar writes, meeting
URL return, join action, attendees, organizer, body, location, installer, or
generalized provider framework.
