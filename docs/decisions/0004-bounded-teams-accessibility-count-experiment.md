# ADR 0004: Run one bounded Teams accessibility count experiment

- Status: Completed with a negative exact-count result
- Date: 2026-08-10

## Context

The source-owned attention adapter reliably reports the Microsoft Teams notification-area state as a qualitative `New activity` signal. During manual testing, that signal changed from true to false correctly, but the taskbar displayed a numeric badge of `1` that was absent from the generic taskbar and Teams UI Automation `Name`, `HelpText`, and `ItemStatus` properties inspected so far.

Microsoft documents that the Teams badge is not an unread-message total. It combines unread unmuted chats, channels with unread personal or tag mentions, and unread followed threads. The Activity state has different semantics. Therefore any exact result must be named as a Teams badge-item or unread-conversation count rather than an unread-message count.

The peer review converged on one remaining privacy-preserving hypothesis: Teams may expose contributing counters through ARIA properties, UI Automation pattern availability/state, Quick views, collapsed-section counters, or materialized Chat rows even though the generic properties and rendered taskbar button did not expose the badge.

## Decision

Add one manual, read-only Teams accessibility diagnostic to Milestone 0. It is separate from the normal attention-signal snapshot and its two-second refresh loop.

The diagnostic may:

- traverse accessible elements owned by the running Teams desktop process;
- read `Name`, `HelpText`, `ItemStatus`, `AriaProperties`, control type, offscreen state, bounds, and pattern availability;
- transiently analyze text in native memory;
- return only fixed attention-keyword matches, numeric tokens, ARIA property keys, value lengths, control type, offscreen state, bounds, and pattern names.

It must not:

- return or log raw Teams labels, chat names, sender names, message previews, message bodies, account identifiers, or ARIA values;
- focus, click, expand, scroll, select, type into, or otherwise control Teams;
- run automatically or poll;
- read Teams profile/database files, attach WebView2 debugging, call Microsoft Graph, capture taskbar pixels, or perform OCR.

## Test and stop conditions

Manually compare badge states 0, 1, and 2 or more with Chat visible, another Teams page visible, Teams minimized, and a contributing unread row offscreen where practical.

Treat the experiment as successful only if an exact number is derivable in at least three controlled states and remains available without keeping the relevant Teams page visible. If it exposes only a subset such as materialized unread chats, retain that result only under a truthful partial-signal name. Stop this path if the value requires UI control, private-content persistence, visible-only virtualized rows, or unstable heuristics with no semantic marker.

OCR or credentialed Microsoft Graph access requires a separate architecture review. Neither is authorized by this decision.

## Consequences

- The proven qualitative Teams `activityStatus` signal remains the implemented behavior.
- The experiment returned only sanitized, application-owned metadata and did not persist or commit private Teams content.
- The experimental native command, DTOs, and React table were removed after the stop condition was reached; they are not a production subsystem.
- Exact Teams counts and sender/message details are deferred. Reopening them requires a separate decision about OCR, credentialed Microsoft Graph access, or another source-specific technique.

## Outcome

At a naturally occurring visible Teams badge of `2`, the fresh sanitized scan traversed one Teams window and 31 elements. Its six candidates contained structural ARIA keys but no numeric token. Opening Activity cleared both the Activity and Chat indicators, so a stable intermediate badge of `1` could not be isolated from that state. A later fresh zero-state scan traversed 438 elements and showed qualitative `activity` structure without an exposed count. The existing notification-area signal changed back to `activityStatus=false` correctly.

The earlier apparent `activity` numeric token `1` was present at badge zero and matched the permanent `Activity (Ctrl+1)` navigation shortcut. Filtering shortcut-adjacent digits removed that false lead.

This satisfies the experiment's negative stop condition: exact badge state was not available through a stable, passive UI Automation property within the bounded effort. Attention Hub will use a truthful boolean for Teams and spend the next product effort on broader source coverage and calendar awareness.
