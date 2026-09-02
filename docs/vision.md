# Product vision

Attention Hub answers one question at a glance: **what needs my attention
now?**

It is a quiet, movable Windows observer rather than another communication or
task container. Source applications continue to own their messages, unread
state, windows, and interaction. Attention Hub composes only bounded operating-
system state, local time, one passive work-calendar source, and user-authored
project or personal to-dos.

## Principles

- Local-first, with no telemetry or cloud backend.
- Truthful semantics: unknown state stays unknown; visual pixels never become
  counts.
- Low friction: useful at a glance and quick to dismiss or review.
- Explicit user control over observed sources, placement, appearance, calendar,
  and reminders.
- Secure by default: no account passwords, raw private URLs in the WebView, or
  content in diagnostics.
- Add capability only after daily use demonstrates a concrete need.

## Product shape

The primary widget has five stable zones:

1. fixed communication application surfaces;
2. Local and selectable secondary time with inline conversion;
3. the active or next work-calendar event.
4. compact Today and Projects destinations;
5. close, pin, and settings controls.

Advanced settings and Project Hub open on demand. They do not enlarge the
primary widget or turn it into a dashboard.

## Current non-goals

Attention Hub does not aggregate accounts, send messages, control source-app
content, scrape pixels, use OCR, require Microsoft Graph, synchronize Project
Hub data, run a cloud service, or promise notifications while closed.
