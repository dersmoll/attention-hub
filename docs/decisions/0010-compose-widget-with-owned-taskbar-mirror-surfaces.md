# ADR 0010: Compose the widget with owned taskbar-mirror surfaces

- Status: Accepted for bounded widget composition
- Date: 2026-08-11

## Context

The clarified product target is a movable three-zone widget, with live
communication icons on the left, clocks in the center, and an active or next
calendar event on the right. The detailed Milestone 3A panel belongs in an
on-demand Advanced view.

ADR 0009 retained one optional Teams visual as a separate movable companion
because a DWM thumbnail registered on Tauri's outer native window renders behind
the WebView child. The widget target requires multiple visuals to appear at
fixed positions inside one composed surface. Teams and Telegram both expose
one unambiguous primary-taskbar button on the development desktop.

## Decision

Use one compact frameless Tauri WebView as the widget and one borderless native
owned tool window for each live taskbar visual:

- the first bounded sources are Teams and Telegram;
- each source independently discovers its primary-taskbar UI Automation
  rectangle and registers the primary `Shell_TrayWnd` with DWM;
- each destination is a no-activate `WS_POPUP`/`WS_EX_TOOLWINDOW` owned by the
  widget, so it remains above its owner without a separate taskbar entry;
- the existing 100 ms cached rectangle check also recalculates the popup's
  physical position from the widget rectangle and current DPI;
- missing, ambiguous, or rebuilding source state hides only that source's
  popup and exposes the React semantic fallback;
- the widget automatically starts both bounded visuals for the current session;
- status remains source-specific and visual-only;
- DWM owns pixel composition. No bitmap, OCR, recognition, count extraction, or
  input forwarding enters Attention Hub.

The primary widget persists only its physical position, pin state, and secondary
IANA timezone. Advanced is created on demand and destroyed on close.

## Consequences

- The live visuals can appear in the product's icon row despite the WebView/DWM
  z-order limitation.
- Moving the widget requires two owned windows to follow it. This passed on the
  tested 100-percent-DPI monitor but mixed-DPI and multi-monitor movement remain
  manual gates.
- Each additional visual application requires bounded identity/discovery
  evidence; this is not a generic guarantee that Slack or Viber will work.
- The existing primary-taskbar-only and brief reflow-flash limitations remain.
- A source visual and its semantic signal remain different contracts. The user
  may see a number that Attention Hub cannot query or assert.
- ADR 0009's separate user-movable Teams companion is superseded for the widget
  composition path. Its visual-only privacy boundary and reflow evidence remain
  applicable.

Implementation evidence is recorded in
`docs/milestones/evidence/m3b/2026-08-11-widget-composition.md`.
