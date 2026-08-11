# Milestone 4C: Published ICS bounded current/next semantics

## Status

Implemented on 2026-08-11 and awaiting the first live title-capable probe. This
milestone is a manual one-shot provider gate. It does not add polling, secret
storage, widget integration, or a join action.

## Product question

Can one user-selected Microsoft 365 Published ICS calendar yield one truthful
active event, or otherwise the next upcoming event, with deterministic
recurrence, timezone, cancellation, privacy, and overlap behavior?

## Approved semantic boundary

The user selected the **Can view titles and locations** publication level.
Microsoft documents that this level grants any link holder access to both
titles and locations. Attention Hub accepts that user-approved source but
discards location and returns only:

- subject;
- start;
- end;
- `active` or `upcoming` classification;
- meeting-link presence, never the URL.

The publication URL, location, account, attendees, organizer, body, UID, raw
calendar, and meeting URL stay excluded from IPC, logs, fixtures, and evidence.
Private and confidential subjects are replaced with `Private event`, and
meeting-link presence is withheld for that selection.

## Deterministic selection

1. Expand only the fixed interval from 31 days before now through 366 days
   after now.
2. Exclude cancelled series and cancelled recurrence instances.
3. Apply recurrence exceptions by UID and original `RECURRENCE-ID` in memory;
   neither identifier is returned.
4. Prefer events where `start <= now < end`.
5. If active events overlap, prefer the most recently started, then the one
   ending first, then stable internal UID/source order.
6. Otherwise prefer the earliest upcoming start, then earliest end, then the
   same internal tie-breakers.
7. Return only one selection.

This follows RFC 5545 recurrence-set precedence: `DTSTART`, `RRULE`, and
`RDATE` include occurrences; `EXDATE` excludes them. Per-instance overrides
replace the original occurrence. A `RANGE=THISANDFUTURE` override, duplicate
master, unsupported timezone, floating time, ambiguous DST transition,
unbounded duration, malformed event, or recurrence cap produces unavailable
instead of a guess.

## Bounds

The Milestone 4B URL, host, redirect, Referrer, timeout, 8 MiB body, line,
property, event, and structure-scan limits remain in force. The semantic scan
adds:

| Boundary | Limit |
| --- | ---: |
| Semantic parse | 750 ms |
| One unfolded content line | 256 KiB |
| Subject | 512 Unicode characters |
| Event duration | 31 days |
| Recurrence lookback | 31 days |
| Recurrence lookahead | 366 days |
| Occurrences per series | 4,096 |
| Expanded occurrences total | 20,000 |

Timezone references accept IANA identifiers or CLDR-backed Windows timezone
identifiers. Floating date-times are not interpreted through the machine's
locale. All-day events require an explicit event or calendar-default timezone.

## Manual test plan

1. In Outlook web settings, select the exact work calendar and change its
   publication level to **Can view titles and locations**.
2. Copy only the ICS link. Do not paste it into chat, a terminal, screenshots,
   logs, or documentation.
3. In Attention Hub Advanced, paste it into the masked field, confirm the exact
   publication level, and run **Run title-capable event probe**.
4. Compare the one returned event against the visible Microsoft 365 Calendar
   companion. The companion remains a manual oracle, not an automated source.
5. Validate naturally available in-progress, upcoming, recurring, one-off,
   cancelled, private, all-day, and overlapping cases. Record only sanitized
   behavior; redact subjects and times from committed evidence.
6. Unpublish immediately if the bearer-style URL is exposed or testing stops.

## Acceptance gate

- [x] Dedicated semantic branch preserves completed M4B evidence and
      user-owned untracked files.
- [x] A separate user confirmation is required before title extraction.
- [x] URL and raw body remain bounded and absent from the result.
- [x] Only the approved five semantic fields can enter the selection DTO.
- [x] Recurrence expansion and candidate selection are bounded.
- [x] Private/confidential title and meeting-link state are redacted.
- [x] Location and meeting URL are never returned.
- [x] Focused one-off, active/upcoming, overlap, recurrence/cancellation,
      Windows timezone, all-day, private, and link-presence tests pass.
- [ ] The live title-capable feed produces a correct active-or-next result.
- [ ] Required live edge cases are validated where naturally available.
- [ ] A provider decision is recorded.

## Non-goals

No Graph/Entra activity, source-app control, OCR, screenshot or pixel analysis,
Outlook cache access, secret persistence, credential-manager integration,
automatic polling, provider framework, widget integration, meeting URL return,
join action, full calendar UI, or seven-day agenda.

Sanitized live evidence belongs in
`evidence/m4c/2026-08-11-published-ics-semantics.md`.
