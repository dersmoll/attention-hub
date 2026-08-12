# ADR 0018: Polish and activate the left app buttons

- Status: accepted
- Date: 2026-08-12

## Context

The first composed widget used live Teams and Telegram taskbar crops plus Slack
and Viber placeholders. The crops were top-aligned against differently colored
placeholder surfaces, only searched the primary taskbar, and were not useful as
shortcuts back to the source applications. A proven aggregate New Outlook Inbox
unread signal already existed but had no widget slot.

Visual pixels, qualitative activity, and source-owned numeric counts are
different evidence and must remain different product claims.

## Decision

The left row has three real app buttons in a fixed order: Teams, Telegram, and
New Outlook.

- All three use aligned local glyph surfaces as a semantic/failure fallback.
- Teams and Telegram keep opt-in visual-only DWM composition. When a separate
  semantic source reports attention, a bounded square around the complete
  taskbar button is scaled into a centered 44-pixel native surface inset by 4 pixels
  inside its 52-pixel React slot. The native surface uses the same 8-pixel
  corner radius as the surrounding interface. The local glyph remains the
  fallback when the live surface is unavailable.
- A mirror first searches the taskbar on the monitor containing the preferred
  source-owned top-level window, then falls back to the primary and remaining
  taskbars. It re-evaluates topology once per second and performs full UI
  Automation discovery only when the source monitor, taskbar count, cached
  element, or Explorer-owned taskbar changes.
- Telegram may show its proven source-owned numeric application counter. Teams
  may show qualitative activity only. Outlook may show the proven aggregate
  English Inbox unread count when exposed. If minimization changes Outlook to
  `notExposed`, the widget may retain the last observed value in process memory
  with amber/dashed last-known styling; it never substitutes zero or claims the
  retained value is fresh.
- Each slot is an accessible button. Explicit activation may restore and
  foreground an existing running app window. It never launches an application,
  clicks inside it, or converts mirror pixels into semantics.
- The outer widget uses equal 366-pixel left and right panels around a 240-pixel
  center panel, separated by 4-pixel gaps. All three panels are 80 pixels high,
  aligned to one top and bottom edge, and use an 8-pixel corner radius. The
  224-pixel app row is centered in the left panel. The clock uses compact labels
  and tabular time values.

## Consequences

The multi-monitor case no longer depends on a primary-taskbar copy that may lack
the active badge. Failure and stale states remain visible and truthful, and
keyboard users can reach the same activation action as pointer users.

The badge pixels remain visual evidence only; starting the overlay from a
semantic attention state does not turn the pixels into a count. Source
enrollment, per-app visibility settings, taskbar auto/manual discovery,
Slack, Viber, WhatsApp, arbitrary applications, and a generalized provider
framework remain deferred to a separately approved milestone.
