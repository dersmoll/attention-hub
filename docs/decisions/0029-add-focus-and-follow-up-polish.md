# ADR 0029: Add focus and follow-up polish

- Status: accepted
- Date: 2026-08-17

## Context

Daily use showed four bounded UX gaps: minimized Outlook displayed a confusing
ellipsis, published calendar events exposed meeting-link presence without a
join action, the primary relative-time line was too small, and Later Inbox
needed collapsed notes, Work/Private organization, and optional due alerts.

New Outlook does not expose a trustworthy minimized Inbox count through the
current passive UI Automation contract. Notification Center entries and DWM
pixels are not Inbox state. Microsoft Graph would require a separate Entra and
delegated-mail authorization milestone.

## Decision

- Show an Outlook number only from a fresh observed Inbox label. A minimized or
  otherwise unexposed Outlook has no badge; hover and accessible text explain
  how to refresh it.
- Extract only bounded HTTPS meeting links for Teams, Zoom, Google Meet, and
  Webex. Keep URLs in Rust process memory, expose only ephemeral tokens, and
  open a current token through one narrow command after explicit activation.
- Increase the primary calendar detail line from 11 to 12 pixels without
  changing the 80-pixel widget or calendar-width modes.
- Keep the 360 by 420 Later Inbox. Add Work/Private tabs and native collapsed
  note disclosures.
- Replace the test-only schema with schema v3. Do not migrate old records. New
  records carry Work/Private scope and the exact follow-up value already
  notified.
- Add an opt-in native notification check every 30 seconds while the installed
  application is running. Aggregate simultaneous due items, omit private item
  titles, and notify only once per exact follow-up value.

## Consequences

The compact surfaces become clearer without inventing Outlook state or granting
generic URL/notification capabilities to a WebView. Meeting URLs remain absent
from IPC, logs, fixtures, and evidence. Work/Private is organizational only;
both scopes share the same per-user local file and backup.

Notifications are not promised while Attention Hub is closed, the computer is
asleep, Windows notifications are disabled, or the development build is used.
This decision adds no Graph, background task, autostart, tray lifecycle,
scheduled-toast activation, cloud sync, encryption, OCR, or generalized
provider work.
