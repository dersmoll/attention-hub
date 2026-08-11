# Milestone 4B: Published ICS current/next-event observer spike

## Status

In progress on 2026-08-11. The bounded one-shot structure diagnostic is
implemented, and one manually generated publication returned a valid sanitized
calendar structure. Direct freshness remains unmeasured. Semantic extraction,
polling, persistence, and widget integration have not started.

## Product question

Can Attention Hub directly fetch one user-selected Microsoft 365 Published ICS
calendar with sufficient freshness and deterministic structure to provide the
active or next work-calendar event without Graph or source-window control?

## Phase A: secret-safe structure gate

- Run only from an explicit Advanced-view form.
- Accept one masked URL and clear the field immediately when the request starts.
- Keep the URL and response body in memory only.
- Restrict the scheme, host, path, port, redirect, request duration, body size,
  line count, property count, event count, line size, and parse duration.
- Return transport/header-presence and ICS component/property counts only.
- Zero the downloaded body after scanning.
- Emit no URL, header value, raw ICS, event value, UID, or calendar content.
- Perform no periodic request and retain no prior provider result as current.

## Phase B: minimal semantics — gated and not implemented

Proceed only after Phase A proves acceptable direct-feed freshness and stable
recurrence/timezone/cancellation structure. Allowed final fields remain subject,
start, end, active/upcoming classification, and meeting-link presence. Meeting
URL, account, attendees, organizer, body, location, UID, and event history stay
excluded.

Busy-only publication is sufficient for Phase A timing/structure tests but not
for a final subject. Increasing the publication permission requires a separate
privacy approval because the published link grants its holder the selected
detail level even if Attention Hub discards excluded fields.

## Acceptance criteria

- [x] Dedicated `codex/m4b-published-ics-observer` branch preserves completed
      M4A evidence and user-owned untracked files.
- [x] The URL is masked, cleared on submit, and absent from the result DTO and
      logs.
- [x] Only bounded Microsoft work-calendar publication URLs are accepted.
- [x] Redirects, Referrer forwarding, credentials, arbitrary hosts, query
      strings, fragments, and non-default ports are blocked.
- [x] Fetch, response, and scan work is bounded.
- [x] The response body is zeroed after its in-memory structure scan.
- [x] Semantic extraction, polling, persistence, and widget integration remain
      disabled.
- [x] A busy-only live fetch is recorded with sanitized evidence; the
      permission choice follows the manual procedure and is not inferred from
      event content.
- [ ] Direct freshness is measured against the Microsoft 365 Calendar companion
      across a harmless create/update/cancel cycle.
- [ ] Recurrence, exception, one-off, private, all-day, and overlapping shapes
      are validated where naturally available.
- [ ] A retain/stop provider decision is recorded.

## Manual test plan

1. In Outlook web calendar settings, select the exact work calendar.
2. Select **Can view when I'm busy**, publish, and copy only the ICS link.
3. Paste the link only into Attention Hub's masked field; never paste it into
   chat, a terminal command, logs, screenshots, or documentation.
4. Run one fresh sanitized structure probe.
5. Compare the sanitized counts with the visible Microsoft 365 Calendar
   companion without exposing event content.
6. If Phase A observes one valid calendar, measure direct-feed refresh after a
   harmless manual event change. Attention Hub never writes the event.
7. Unpublish immediately if the URL is exposed or the test is abandoned.

## Non-goals

- Graph/Entra registration, consent, tokens, tenant/admin changes, or requests.
- Outlook or companion automation, OCR, screenshots, pixels, DWM calendar
  crops, caches, databases, profiles, or browser automation.
- URL/header/body/event-value logging or committed fixtures.
- Credential manager integration, durable URL storage, automatic polling,
  semantic extraction, meeting URL return, join actions, full calendar UI,
  seven-day agenda, or widget calendar integration.

Evidence is recorded in
`evidence/m4b/2026-08-11-published-ics-structure.md`.
