# ADR 0026: Add a local-first Later Inbox

- Status: accepted
- Date: 2026-08-14

## Context

Lower-priority requests accumulate during the workday, while project names,
task links, and intended follow-up times are easy to lose. Microsoft To Do,
OneNote, Notion, and Google Keep can hold this information, but each moves
capture into a separate application or account and does not provide the
one-click path inside the already visible Attention Hub widget.

Attention Hub currently stores only bounded display preferences in WebView
local storage. User-authored inbox content needs a durable, versioned,
application-owned boundary shared by the widget, the on-demand Later window,
and Advanced. The application has no product tray or autostart lifecycle, and
closing the widget exits the process tree, so an in-process reminder would be
misleading.

## Decision

- Add a fixed 48-pixel **Later Inbox** utility button after enabled app sources
  and before the fixed-last Advanced button.
- Open one on-demand 400 by 480 logical-pixel Later window, with a 360 by 420
  minimum. Reuse and focus the existing window instead of creating duplicates.
- Capture one required title plus optional multiline plain-text notes/context,
  HTTP(S) URL, and passive follow-up time. Bound notes to 4,000 characters and
  preserve line breaks. Do not add rich-text markup, attachments, priorities,
  recurrence, tags, or collaboration.
- Store user-authored items in a Rust-owned schema-v1 JSON document under the
  per-user application-data directory. Keep one previous-valid local backup,
  bound item/file/field sizes, validate every loaded record, and refuse to
  overwrite an unknown future schema.
- Use complete snapshots and a payload-free invalidation event across Tauri
  windows. Do not place Later items in widget-preference local storage.
- Treat the Later count and due state as a personal queue, never as an
  `AttentionSignal`, monitored source, coverage input, or **All clear** input.
- Make follow-up passive: it affects sorting and explicit due presentation only.
  Do not produce Windows notifications, sounds, background timers, or delivery
  guarantees.
- Open a saved link only after explicit user action, by item ID through a narrow
  Rust command that revalidates HTTP/HTTPS and rejects embedded credentials.
  Do not grant a generic shell/opener capability to the WebViews.
- Add Advanced data controls for counts, storage disclosure, completed cleanup,
  and a two-step delete-all action. Explicit deletion removes the previous
  backup containing the deleted content.

## Geometry

The extra fixed utility target increases the left panel by 56 logical pixels.
The widget remains 80 pixels high and responsive to zero through six enabled
sources and Compact/Auto/Wide calendar modes. Its total width becomes 744
through 1208 pixels; six-source Auto with one calendar event is 1112 pixels.
Source buttons remain first, so native DWM slot indices do not change.

## Consequences

Attention Hub gains a fast local capture/review flow without becoming a task
manager or cloud integration host. User content is plaintext within the current
Windows user's application-data boundary and is not automatically synchronized
or backed up off-device. The documented JSON file and one previous-valid local
copy are the v1 portability and recovery story.

Real reminders require a separate decision covering Windows scheduled
notifications, activation, disabled-notification behavior, edit/cancel
reconciliation, time-zone changes, missed delivery, restart, and upgrade
evidence. They do not enter this milestone.

Teams, Telegram, Outlook, Slack, Viber, WhatsApp, taskbar selection and
activation, clocks/converter, calendar/provider behavior, saved ICS,
acknowledgement, appearance, app order, pinning/position, and source-owned
attention meanings remain unchanged. DWM pixels remain visual-only.
