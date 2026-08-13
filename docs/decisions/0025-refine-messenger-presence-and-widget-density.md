# ADR 0025: Refine messenger presence and widget density

- Status: accepted
- Date: 2026-08-14

## Context

Daily use of Milestone 8 exposed four bounded defects: the Miami converter
inherited a light foreground on its white native time input, tray-resident
Slack/Viber/WhatsApp processes were mistaken for stopped applications, the
single-event calendar kept the dual-event width, and the pin/close surfaces
were visually too large.

The user also supplied evidence that Slack's notification-area icon can carry
green or red source-owned dots while no taskbar app button exists. A bounded
current-machine probe found no accessible `Shell_TrayWnd` or
`NotifyIconOverflowWindow` root from the diagnostic session. There was
therefore no stable source-owned tray rectangle to mirror. Color or pixel
interpretation was not attempted.

## Decision

- Detect fixed messenger presence with the Windows process snapshot, independent
  of visible or UI Automation windows. Continue to report unread as not exposed.
- Keep activation bounded to an existing source-owned window. For fixed
  messengers only, a titled, unowned, non-tool hidden window with main-window
  dimensions and the source's known main-window class may be restored from the
  tray. Process presence does not authorize launching an application or
  clicking its tray icon. A successful restore remains successful if Windows
  shows the window but declines a separate foreground-focus request.
- Give the converter's native time input an explicit high-contrast light color
  scheme and enough width for the complete `HH:mm` value and native picker.
- Add a persisted Compact/Auto/Wide width preference. Compact uses a 304-pixel
  calendar, Auto uses 336 pixels for one event and 432 pixels only for the
  acknowledged-current-plus-next composition, and Wide always uses 432 pixels.
- Keep pin and close hit targets at 40 pixels while reducing their visible
  surfaces to 30 pixels.
- Stop the Slack tray experiment at the discovery gate. Do not ship a tray
  mirror, OCR, color classification, or an inferred Slack attention state.

## Consequences

Tray-resident fixed messengers are truthfully reported as running without
inventing unread semantics. The widget now ranges from 688 to 1152 logical
pixels while its saved position remains clamped to available monitors.

Teams/Telegram taskbar selection and activation, Outlook aggregate unread and
last-observed fallback, calendar/provider behavior, acknowledgement, appearance,
app ordering, and source-owned attention semantics remain unchanged. DWM and
shell pixels remain visual-only. Graph, OCR, generalized providers, application
launching, autostart, product tray lifecycle, updater, signing, and unrelated
lifecycle work remain closed.
