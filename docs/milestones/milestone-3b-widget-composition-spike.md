# Milestone 3B: Movable widget and multi-icon composition spike

## Status

Approved and implemented on 2026-08-11. The primary composition gate passes on
the development desktop. Multi-monitor DPI movement, real Telegram taskbar
reflow, Explorer restart, source close/reopen, timezone-change persistence, and
a longer combined run remain open manual gates.

Milestone 3A's structured source boundary is retained. Its panel is now the
Advanced view rather than the primary product surface.

## Product question

Can Attention Hub behave like the intended compact desktop widget while two
live taskbar visual surfaces remain aligned with a moving WebView-owned shell?

## Scope

- Replace the 800 by 600 primary panel with a 980 by 176 frameless widget.
- Compose fixed left, center, and right zones from the approved product sketch.
- Show live Teams and Telegram primary-taskbar crops in the first two left-side
  slots without reading or interpreting their pixels.
- Show future Slack and Viber slots without pretending they are observed.
- Show local time and a configurable secondary IANA timezone, defaulting to
  `America/New_York` with automatic daylight-saving behavior.
- Show a truthful calendar-unavailable state until a passive provider is
  approved.
- Support dragging, always-on-top toggle, work-area-aware position restoration,
  timezone persistence, and clean whole-application close.
- Create the existing detailed panel as an on-demand Advanced WebView and
  destroy it on close.

## Acceptance criteria

- [x] The default surface is the compact three-zone widget, not the diagnostic
      panel.
- [x] Teams and Telegram each have an independent live visual crop and status.
- [x] Both crops occupy 52 by 52 physical slots aligned to the widget at the
      tested 100-percent-DPI position.
- [x] Moving the widget causes both native surfaces to reacquire their exact
      relative positions within one 100 ms check.
- [x] A missing visual hides its native surface so the semantic fallback is not
      covered by a blank popup.
- [x] The visual surfaces are owned no-activate tool windows and create no
      separate taskbar entries.
- [x] Local and `America/New_York` clocks render simultaneously; the secondary
      label reflects EDT/EST rather than hardcoding EST.
- [x] Pin toggles the real native topmost style.
- [x] Position and pin state survive restart; restoration clamps a saved point
      to an available monitor work area.
- [x] Advanced is created only on demand, renders the retained panel, and is
      destroyed on close.
- [x] The widget close control exits cleanly and tears down both mirrors.
- [ ] A user drag gesture is validated on each monitor and DPI used for daily
      work.
- [ ] Changing and restarting with a non-default timezone is manually verified.
- [ ] Real taskbar reflow is tested while both sources are mirrored.
- [ ] Explorer restart and Teams/Telegram close/reopen recover correctly.
- [ ] A 30-to-60-minute combined run records CPU, memory, alignment, and
      recovery.

## Non-goals

- Slack or Viber observation or visual discovery.
- Calendar-provider implementation, Entra registration, consent, or Graph call.
- Exact semantic Teams counts.
- OCR, image recognition, screenshots, pixel readback, or badge extraction.
- Input forwarding to any mirrored application.
- Secondary taskbars, final visual design, themes, tray, autostart, installer,
  update, analytics, or telemetry work.

## Manual test plan

1. Drag the widget repeatedly on the primary monitor and verify both crops.
2. Move it between monitors with different scale factors.
3. Toggle Pin and verify z-order over several applications.
4. Trigger real Teams and Telegram badge changes.
5. Reorder taskbar icons and restart Explorer.
6. Close and reopen Teams and Telegram.
7. Restart Attention Hub and verify position, pin state, and timezone.
8. Select a DST-sensitive secondary timezone and verify its abbreviation.
9. Open, close, and reopen Advanced without disturbing the widget.
10. Run for 30 to 60 minutes and record resource and recovery behavior.

Initial implementation evidence is recorded in
`evidence/m3b/2026-08-11-widget-composition.md`.
