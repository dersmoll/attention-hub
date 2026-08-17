# Milestone 9.3: Focus and follow-up polish

## Outcome

Make minimized Outlook truthful, make joinable calendar events actionable, and
make Later Inbox easier to review and follow up without expanding provider or
background lifecycle scope.

## Acceptance gate

- [x] Outlook shows no number or ellipsis when Inbox state is not exposed.
- [x] The primary calendar detail line is 12 pixels without changing widget
  geometry or width modes.
- [x] Allowlisted Teams, Zoom, Google Meet, and Webex links receive a compact
  Join action; the raw URL never crosses serialized IPC.
- [x] Unknown, expired, credentialed, non-HTTPS, and non-allowlisted meeting
  links fail closed.
- [x] Work and Private items are separated in the 360 by 420 Later Inbox.
- [x] Notes/context on open cards are collapsed by default through a native
  keyboard-accessible disclosure.
- [x] Schema v3 starts clean from disposable earlier test schemas and contains
  no legacy migration path.
- [x] Due notifications are opt-in, one-shot per follow-up value, aggregated
  when simultaneous, and title-redacted for Private items.
- [x] Notifications require the installed application to be running; no
  closed-app or wake guarantee is claimed.
- [ ] Live installed verification covers Outlook minimize/restore, a real
  meeting Join action, Work/Private keyboard review, and one due notification.

## Preserved boundaries

Teams/Telegram semantics, visual-only DWM surfaces, Slack/Viber/WhatsApp
presence boundaries, app activation, clocks/converter, responsive widths,
calendar selection and acknowledgement, saved ICS storage, appearance, order,
pinning/position, and source-owned attention semantics remain unchanged.

Graph, OCR, arbitrary integrations, cloud sync, encryption, attachments,
autostart, tray, updater, signing, scheduled closed-app notifications, and
generalized providers remain out of scope.
