# ADR 0024: Add fixed messenger visuals and Miami time tools

- Status: accepted
- Date: 2026-08-13

## Context

The daily beta covers Teams, Telegram, and Outlook semantically. The user also
needs quick access to Slack, Viber, and WhatsApp, larger clocks, a practical
Miami-to-local time answer, a left panel that fits its enabled apps, and visible
elapsed time for an active calendar event.

A bounded live accessibility probe found running Slack, Viber, and WhatsApp
windows and taskbar buttons, but no trustworthy source-owned unread number or
qualitative unread state. Numeric taskbar labels were structural/grouping
values, not proven unread counts. Treating them as semantic badges would weaken
the existing all-clear contract.

## Decision

- Add Slack, Viber, and WhatsApp as fixed Windows app sources with presence,
  activation, local glyphs, and opt-in DWM taskbar surfaces.
- Keep those taskbar pixels visual-only. Do not parse labels, pixels, or OCR and
  do not include these three sources in semantic attention coverage.
- Preserve Teams, Telegram, and Outlook as the only sources contributing to
  needs-attention and all-clear claims.
- Expand the fixed preference catalog with an explicit catalog version so old
  three-source defaults migrate once while later user selections remain stable.
- Size the left panel and main window from zero through six enabled sources;
  keep Advanced fixed last and keep native surfaces aligned to the same slots.
- Keep `America/New_York` as the DST-aware Miami zone and label it **ET · Miami**.
  Clicking its live clock opens an inline 24-hour Miami-to-local converter with
  explicit local day rollover.
- Double the live clock numerals from 18 to 36 pixels.
- Show a three-pixel semantic progress line for active timed calendar events,
  derived only from the already approved start and end timestamps.

## Consequences

The requested messengers are visible and activatable without inventing unread
semantics. An enabled Slack, Viber, or WhatsApp visual may show whatever pixels
its real Windows taskbar button currently owns, including an app-rendered badge,
but Attention Hub cannot state the badge value.

The widget width ranges from 816 to 1152 logical pixels. Position clamping,
multi-monitor taskbar selection, pinning, app ordering, appearance, Outlook
fallback, acknowledgement, and saved Published ICS behavior remain intact.

Graph, OCR, generalized providers, arbitrary app enrollment, new calendar
providers, autostart, tray, updater, and unrelated lifecycle work remain closed.
