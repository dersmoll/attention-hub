# Milestone 9.2: Link-aware compact Later Inbox

## Status

Implemented on 2026-08-14. Automated evidence is recorded separately; live
clipboard, compact-layout, and restart acceptance remain explicit gates.

## Product outcome

Paste a manager request into the mini inbox without losing linked words, while
keeping the capture/review window materially smaller and never presenting an
unobservable Outlook count as current.

## Acceptance gate

- [x] Valid schema-v1 items migrate to schema v2 without losing IDs, plain note
      text, task URL, follow-up, timestamps, or completion state.
- [x] Pasted HTML retains only text, paragraph breaks, and validated HTTP(S)
      anchors; arbitrary HTML and media are not stored or rendered.
- [x] Pasted plain-text HTTP(S) URLs become linked segments; unsupported URLs and
      embedded credentials never become activatable links.
- [x] Inline link activation is explicit and Rust verifies the URL against the
      saved item before opening it.
- [x] Notes remain bounded to 4,000 visible characters, 256 segments, 25 linked
      segments, and the existing 1 MiB file limit.
- [x] The Later window defaults to 360 by 420 with a 340 by 360 minimum and
      retains keyboard focus, dirty-close, forced-colors, and scrolling behavior.
- [x] A not-exposed Outlook state shows a nonnumeric ellipsis while its
      last-observed count remains available in the accessible explanation.
- [ ] Live current-machine evidence verifies HTML clipboard links from a real
      work application, keyboard editing, schema migration after restart,
      compact geometry, and the Outlook ellipsis transition.

## Non-goals

Bold/italic styling, arbitrary HTML, Markdown, images, attachments, embeds,
previews, mentions, tables, collaboration, cloud sync, reminders, Graph, OCR,
generalized providers, product tray, autostart, updater, signing, installer
changes, and unrelated lifecycle work remain outside this milestone.
