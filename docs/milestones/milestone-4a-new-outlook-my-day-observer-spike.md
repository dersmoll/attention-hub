# Milestone 4A: New Outlook My Day current/next-event observer spike

## Status

Stopped on 2026-08-11. The bounded sanitized structure probe passed while New
Outlook was visible and fully covered, but the My Day tree unloaded when
Outlook was minimized. The passive UI Automation provider is rejected.
Semantic extraction and widget integration did not start.

## Product question

Can Attention Hub passively observe a fresh, unambiguous active-or-next event
from New Outlook's My Day Calendar pane after the user opens it manually,
without controlling Outlook or authorizing Microsoft Graph?

## Phase A: sanitized structure gate

- Run only from an explicit Advanced-view button.
- Inspect already-accessible `olk.exe` top-level windows.
- Return fixed roles/control types, bounds, booleans, text-property lengths,
  supported-pattern presence, counts, timing, and traversal state.
- Emit no raw accessibility label or calendar content.
- Use a fresh complete scan with no event cache.
- Serialize UI Automation work with the existing attention and taskbar-mirror
  paths.
- Treat scan bounds, missing markers, missing candidate structure, and source
  identity uncertainty as unavailable rather than inferred success.

## Phase B: minimal semantics — gated and not implemented

Proceed only after Phase A passes visible, covered, minimized, restored,
restarted, Mail/Calendar-switched, and My-Day-closed cases.

Allowed fields are subject, start, end, active/upcoming classification, and
meeting-link presence. The meeting URL, account, attendees, organizer, body,
location, and event history remain excluded. Multiple accounts/calendars must
never be silently combined. Private content must be redacted from evidence.

## Acceptance criteria

- [x] Dedicated `codex/m4a-outlook-my-day-observer` branch preserves the
      inherited Milestone 3B working state and user-owned untracked files.
- [x] The probe never launches, focuses, clicks, invokes, scrolls, or navigates
      Outlook.
- [x] The initial IPC DTO and logs contain structural metadata only.
- [x] Traversal, returned candidates, duration, and gate wait are bounded.
- [x] A shared priority gate prevents concurrent in-process UIA traversal.
- [x] Semantic extraction is explicitly disabled and source identity is
      explicitly unverified.
- [x] The previous UI result is cleared at the start of each manual probe, and
      only the fresh completed result is then shown.
- [x] My Day Calendar visible structure is recorded.
- [x] Covered and minimized states are recorded. Minimized operation reached
      the mandatory stop condition, so later state and event cases were
      intentionally not run.
- [ ] Before/during/after real-event behavior was not run after the structure
      gate failed.
- [ ] Recurring, one-off, cancelled, private, all-day, and overlapping cases
      were not run after the structure gate failed.
- [ ] Coexistence with Telegram, Teams, and Outlook-mail observations is
      measured.
- [x] A stop provider decision is recorded.

## Outcome

The minimized probe truthfully returned `unavailable`: one minimized Outlook
window exposed only 12 elements, with zero structural/right-pane candidates
and zero My Day, Calendar, or selected markers. No cached visible result was
presented as current. This satisfies the approved stop rule, so Phase B is not
authorized and the remaining matrix is not required for this provider.

## Non-goals

- Graph/Entra registration, consent, tokens, tenant/admin changes, or requests.
- OCR, screenshots, image recognition, pixels, DWM calendar crops, browser
  automation, Outlook cache/database/profile/token access, or classic COM.
- Automatic My Day opening or any source-app input.
- Meeting URL return, attendees, organizer, body, location, join action, full
  calendar UI, seven-day agenda, generalized provider framework, installer, or
  polling redesign.

## Manual matrix

For each row, the user changes Outlook state and then presses **Run sanitized
structure probe**. Record only the resulting counts/booleans/timing and never
copy raw Outlook accessibility content into evidence.

| Outlook state | Expected provider result |
| --- | --- |
| Mail + My Day Calendar visible | Fresh sanitized structure or exact blocker |
| Outlook fully covered | Same fresh structure without focus/input, or stop |
| Outlook minimized | Same fresh structure without focus/input, or stop |
| Outlook restored | Fresh recovery without cached carry-over |
| Outlook restarted; My Day closed | Unavailable |
| Outlook restarted; My Day manually reopened | Fresh structure recovery |
| My Day switched to Mail | Calendar structure unavailable/distinguishable |
| My Day switched back to Calendar | Fresh structure recovery |
| My Day closed | Unavailable immediately on the next probe |

Evidence is recorded in
`evidence/m4a/2026-08-11-new-outlook-my-day-uia.md`.
