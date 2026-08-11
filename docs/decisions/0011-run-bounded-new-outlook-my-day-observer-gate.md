# ADR 0011: Run a bounded New Outlook My Day observer gate

- Status: Accepted for a bounded diagnostic; provider decision pending
- Date: 2026-08-11

## Context

Windows `AppointmentStore` returned stale legacy residue, while the Microsoft
365 Calendar companion unloaded its useful accessibility tree when its flyout
closed. The supported Microsoft Graph path remains paused before registration,
consent, tokens, or requests. The current machine uses New Outlook (`olk.exe`),
not classic Outlook.

The product needs only the active or next work-calendar event. A final bounded
local hypothesis remains: New Outlook's manually opened My Day Calendar pane
may keep enough passive UI Automation structure available while Outlook is
covered or minimized. This hypothesis must be tested without controlling
Outlook and before any semantic event fields enter Attention Hub.

## Decision

Add one Windows-only, manual structure diagnostic in Advanced view:

- the user opens Outlook Mail and My Day Calendar manually;
- Attention Hub never launches, focuses, clicks, invokes, selects, scrolls, or
  navigates Outlook;
- each button press performs a fresh scan and never returns cached event state;
- the initial DTO contains only control type/role, bounds, state booleans,
  property lengths, supported-pattern booleans, candidate counts, traversal
  bounds, and timing;
- raw accessibility labels, subjects, accounts, attendees, locations, and URLs
  never enter logs, IPC, evidence, or fixtures;
- fixed English `My Day` and `Calendar` comparisons may produce counts only;
  they are diagnostic markers, not a production localization contract;
- traversal is limited to 512 desktop roots, eight Outlook windows, 4,000
  elements, depth 32, 64 returned candidates, 750 ms of gate wait, and 2.5
  seconds of scan time;
- the probe uses the shared priority UI Automation gate. Existing background
  mail observation waits, and taskbar-mirror cached checks skip rather than
  contend;
- semantic extraction stays disabled and source identity stays explicitly
  unverified throughout the structure phase.

Proceed to a separately reviewed minimal semantic phase only if the fresh tree
remains available while visible, covered, minimized, restored, restarted, and
view-switched, and if one account/calendar source can be identified without
ambiguity. That later phase may return only subject, start, end,
active/upcoming classification, and meeting-link presence. It may not return a
meeting URL.

## Stop conditions

Stop this provider path if any of the following occurs:

- My Day must be opened, focused, refreshed, or navigated by Attention Hub;
- the event tree unloads while covered or minimized;
- a bounded scan cannot distinguish My Day Calendar from Mail or unrelated
  Outlook content;
- event time parsing, localization, version coupling, cancellation/private
  handling, or overlapping-event selection is ambiguous;
- multiple accounts or calendars cannot be identified safely without exposing
  or combining their content;
- the probe creates unacceptable latency or contention.

Graph, Outlook cache/profile access, OCR, screenshots, pixel interpretation,
browser automation, and widget calendar integration remain outside this
decision.

Implementation and manual matrix evidence are recorded in
`docs/milestones/evidence/m4a/2026-08-11-new-outlook-my-day-uia.md`.
