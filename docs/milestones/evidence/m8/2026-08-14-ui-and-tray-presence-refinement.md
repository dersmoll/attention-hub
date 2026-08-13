# Milestone 8.1 UI and tray-presence refinement — 2026-08-14

## Implemented scope

- Converter time input uses explicit dark text on its light native surface.
- Slack, Viber, and WhatsApp presence is based on Windows process enumeration,
  so a tray-resident process no longer requires a visible app window.
- Compact/Auto/Wide widget width is normalized, persisted, and applied live.
- Auto uses a 336-pixel single-event calendar and expands to 432 pixels only
  for the existing acknowledged-current-plus-next composition.
- Pin and close retain 40-pixel interaction targets with 30-pixel visual
  surfaces.

## Slack notification-area gate

The sanitized current-machine UI Automation probe found zero accessible shell
roots and zero `NotifyItemIcon` candidates in the diagnostic session. Because
no stable source-owned Slack rectangle was available, the experiment stopped
before DWM registration. No label, badge color, pixels, or OCR result was used
as an attention signal.

## Automated evidence

- Widget layout tests passed for Compact, Auto single, Auto dual, and Wide
  widths across zero through six visible sources.
- Preference migration tests passed with old records defaulting safely to Auto.
- Time-zone and attention-coverage tests passed.
- TypeScript and the Vite production build passed with 44 transformed modules.
- Focused native attention tests passed 7/7, including process presence without
  a window and an impossible-process negative case.
- Rust formatting and diff checks passed after the bounded patch.

## Live current-machine evidence

The development widget rendered at 1056×80 in the saved default Auto mode with
six fixed sources and a single calendar event. The Miami converter showed dark,
readable digits on its white input. The calendar occupied the narrower Auto
width. Pin and close rendered as smaller visual surfaces while retaining their
larger button boxes. Advanced rendered the persisted Compact/Auto/Wide control.

The development process tree and private screenshots were removed after the
check. Installer packaging and user acceptance are not claimed here.
