# Milestone 5C: Widget alignment and personalization

## Status

Completed on 2026-08-13 and accepted as the `0.3.0-beta.1` production-ready
beta. Automated and live interaction evidence is recorded separately.

## Product outcome

Correct the remaining clock-label mismatch, guarantee the acknowledged
current-plus-next calendar composition fits Option A, and add bounded visual
and app-order preferences without reopening provider or lifecycle work.

## Scope

- One 24-pixel clock-label row for both Local and the timezone selector.
- Explicit equal-column current and next event layout within the existing
  432 by 72-pixel calendar panel.
- Shared panel background color and 85–100 percent opacity in Advanced.
- Automatically derived foreground, muted, and border contrast.
- Keyboard and pointer app ordering for Teams, Telegram, and Outlook.
- Advanced fixed last and one default-order reset.
- Native Teams and Telegram surfaces synchronized with the ordered React slots.

## Frozen behavior

Published ICS semantics and storage, Graph, installer, autostart, tray,
multi-monitor source selection, app activation, Outlook last-observed behavior,
widget geometry and persistence, clocks, acknowledgement, and Advanced
diagnostics remain unchanged. DWM pixels remain visual-only.

## Acceptance gate

- [x] User approves the bounded recommendation.
- [x] Local and secondary labels share identical 24-pixel geometry.
- [x] Two calendar events fit three single-line rows in two bounded columns.
- [x] Panel appearance updates immediately and semantic calendar overlays win.
- [x] App ordering is named, keyboard operable, resettable, and keeps Advanced
      fixed last.
- [x] Native mirror slots consume the same app order as React.
- [x] TypeScript, Vite, Rust tests, Clippy, formatting, and diff checks pass.
- [x] Live launcher pass confirms visual alignment, immediate preference
      application, reset behavior, and native slot movement.
