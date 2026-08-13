# ADR 0019: Adopt compact widget Option A

- Status: accepted
- Date: 2026-08-12
- Supersedes: ADR 0018 geometry only

## Context

The preserved Milestone 5A widget compiled and retained the required behavior,
but its 980 by 176 transparent Tauri window was much taller than its visible
80-pixel panels. The CSS and native DWM layers also used separate hard-coded
coordinates. The resulting screenshot showed excess physical window space,
incoherent proportions, inconsistent icon and badge surfaces, cramped clocks,
an isolated Advanced ellipsis, and pin/close controls over calendar content.
Live validation also confirmed that the generic Advanced-view
`section + section` margin shifted the clock and calendar down by 32 pixels;
widget zones now reset that unrelated document-flow margin explicitly.

Three dimensioned alternatives were reviewed before implementation. The user
approved Option A as the visual source of truth.

## Decision

The main widget uses this logical-pixel geometry at 100 percent scale:

- outer Tauri window: 960 by 80, fixed and frameless;
- grid: 304-pixel apps, 208-pixel clocks, and 432-pixel calendar;
- panel bounds: `y=4`, height 72, with 8-pixel horizontal gaps;
- panel border radius: 10 pixels;
- app row targets: four 48 by 48 buttons at `x=44,100,156,212`, `y=16`;
- Teams and Telegram native surfaces: 40 by 40 at `x=48,104`, `y=20`;
- local icon surfaces: the same 40 by 40 geometry with 8-pixel radius;
- semantic local badges: 18-pixel minimum, contained by the 48-pixel target;
- clocks: two horizontal cells with tabular `HH:mm` values;
- pin and close: separate 40 by 40 buttons inside the calendar grid.

React and the Win32 DWM adapter share these coordinates explicitly. DPI scaling
is applied only at the native boundary. The complete taskbar crop remains
visual-only; it is never read back, recognized, or described as a semantic
count.

The existing Teams, Telegram, Outlook, calendar, position, pinning, clocks,
Advanced, and source-owned attention behavior remains unchanged. Outlook's
last-observed value remains amber, dashed, and explicitly named in the button's
accessible label.

## Accessibility contract

- App and Advanced targets are 48 by 48 pixels; pin and close are 40 by 40.
- The calendar acknowledgement remains at least 24 by 24 pixels.
- Every icon-only control has an explicit accessible name.
- Keyboard focus remains visible outside native mirror surfaces.
- Text meets WCAG 2.2 AA contrast; structural borders and focus indicators meet
  the 3:1 non-text contrast requirement.
- Last-observed, retrying, stale, and unavailable states do not rely on color
  alone, including Windows forced-colors mode.

## Consequences

The physical window loses 96 logical pixels of unused height and the controls no
longer float over calendar content. A single geometry contract now governs CSS
and native popups. The calendar has less vertical room, so acknowledged current
and next events use two compact columns rather than a vertical stack.

The fixed 960-pixel width favors a stable desktop bar over responsive resizing.
Any future size or composition change must update the Tauri, CSS, and Win32
coordinates together and must be approved against a dimensioned mockup.
