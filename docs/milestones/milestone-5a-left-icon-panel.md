# Milestone 5A: Left icon panel polish

## Status

Implemented on 2026-08-12. Automated validation, the bounded two-monitor live
gate, three-icon visibility, pointer activation, and cross-monitor Telegram
count passed. Further user visual passes rejected both oversized full-slot
taskbar crops and miniature badge-only crops, and clarified that the center
panel must share one level with the side panels. The current inset live-tile,
level three-panel composition awaits visual confirmation.

## Product outcome

Make the existing Teams and Telegram surfaces visually coherent, add New
Outlook as a truthful real source, select the correct taskbar in a multi-monitor
desktop, and let the user return to a running source app from its icon.

## Scope

- Fixed Teams, Telegram, Outlook, Advanced order.
- Consistent 52-pixel button surfaces owned by local Teams, Telegram, and
  Outlook glyphs.
- Attention-gated 44-pixel DWM taskbar tiles for Teams and Telegram, centered
  with a 4-pixel inset inside their 52-pixel slots without pixel recognition.
- A centered 224-pixel app row inside a 366-pixel left panel.
- Symmetric 366-pixel side panels around a 240-pixel center panel, with 4-pixel
  gaps; all three are 80 pixels high and use 8-pixel corner radii.
- Local fallback glyphs; no runtime icon download or taskbar enrollment.
- Proven semantic badges only: Telegram numeric, Teams qualitative, Outlook
  aggregate English Inbox unread when exposed, plus a distinctly marked
  in-memory last-observed Outlook fallback while minimization hides the source.
- Source-monitor-first taskbar selection with bounded fallback and Explorer/
  monitor recovery.
- Pointer and keyboard activation of an existing top-level source window.
- Accessible names, focus visibility, forced-colors support, and explicit
  unavailable/retrying/stale presentation.

## Acceptance gate

- [x] Slack and Viber placeholders are removed from the current product row.
- [x] Teams and Telegram use the same centered 44-pixel inset live-tile
      geometry and 8-pixel corner radius.
- [x] Outlook is a real third button without a fabricated badge.
- [x] Semantic counts and visual pixels remain separate contracts.
- [x] A two-taskbar live run selects Teams on the primary monitor and Telegram
      on the secondary monitor containing its window.
- [x] Cached UI Automation tracking remains single-flight and bounded.
- [x] App buttons expose accessible action/status labels and focus styling.
- [x] Activation restores/foregrounds an existing window and never launches or
      forwards input into the source app.
- [x] Rust tests, clippy, TypeScript checking, Vite production build, formatting,
      and diff checks pass.
- [x] User confirms all three icons are visible and pointer activation works.
- [x] User confirms Telegram numbers work across both monitors.
- [ ] User confirms the smaller Teams and Telegram live tiles fit naturally
      inside their 52-pixel slots while preserving the real rendered badges.
- [ ] User confirms all three panels share one top/bottom level, equal side
      widths, 4-pixel gaps, and consistent 8-pixel corners.
- [ ] User confirms the amber/dashed last-observed Outlook count remains after
      minimizing Outlook and refreshes after restoring it.

## Non-goals

No Slack, Viber, WhatsApp, generic app/provider framework, taskbar enrollment,
per-app visibility settings, arbitrary executable configuration, exact Teams
count, pixel recognition, calendar changes, Graph, installer, autostart, or tray
work.

## Manual validation

1. Place Teams on monitor 1 and Telegram on monitor 2 with taskbar buttons shown
   on both displays.
2. Start one development instance and confirm each live tile comes from the
   taskbar on its source-app monitor.
3. Confirm each 44-pixel live tile is centered with an even 4-pixel inset inside
   its 52-pixel slot, has 8-pixel corners, and preserves the rendered badge.
4. Confirm the complete icon row is centered in the left panel and all three
   panels share the same top edge, bottom edge, height, and corner radius.
5. Trigger Telegram numeric and Teams qualitative activity; confirm their live
   tiles appear and disappear with attention, and neither visual tile is
   relabeled as a semantic count.
6. Observe Outlook aggregate Inbox unread, minimize Outlook, and confirm the
   same number remains amber/dashed as last-observed. Restore Outlook and confirm
   the fresh red count resumes; closing Outlook must clear the retained value.
7. Click Teams and Telegram, then use keyboard and pointer activation on
   Outlook; each action should foreground an existing window without launching
   a new instance.
8. Move a source app between monitors and restart Explorer; confirm recovery
   without a permanent stale crop.
