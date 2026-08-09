# Milestone 0 evidence: first live cycle and Telegram badge distinction

## Run context

- Date/time: 2026-08-09, Europe/Kyiv (UTC+03:00).
- Windows: client build 26220.9022, version 25H2, x64.
- Launch mode: registered sparse identity `AttentionHub.Dev_0.1.0.0_neutral__71pqjrj923s6p`.
- Access status: `Allowed`.
- Foreground listener: active with no diagnostics.
- Screenshots were reviewed interactively but are not committed because they contain private application state.

## Snipping Tool cycle

| Observation | Result |
| --- | --- |
| Add | A screen-capture notification produced an `Added` signal and appeared immediately in the React snapshot. |
| Normalized fields | Source display name, AUMID, package family, ID, creation time, title, and body were populated. |
| Remove | Dismissing the item from Windows Notification Center removed it from Attention Hub without restarting. |
| Conclusion | One end-to-end identity-enabled add/remove cycle passed. More cycles are required by the milestone matrix. |

The observed source was Windows Snipping Tool / ScreenSketch. Notification content is intentionally omitted.

## Telegram distinction

- Installed client: unpackaged Telegram Desktop 7.0.9 at the per-user desktop installation path.
- Registered Start application ID: `Telegram.TelegramDesktop`.
- Visible Telegram/taskbar badge: nonzero (13 in the supplied screenshot).
- Current Windows toast snapshot: no Telegram entry.
- Windows notification-settings registry: no Telegram Desktop key was found; the only Telegram-named key belonged to Phone Link's Android notification forwarding and was disabled.
- Read-only UI Automation observation: Telegram exposed `All chats (9 unread chats)` plus folder-level unread-chat labels. The discrepancy from the visible badge demonstrates that even Telegram-owned counters can have different semantics, such as unread chats versus messages or account-specific counts.
- Read-only taskbar UI Automation exposed the pinned application as `Telegram pinned` with AUMID `Telegram.TelegramDesktop`, but did not expose the visible numeric badge value. The useful unread labels came from Telegram's own accessibility tree, not from a generic taskbar badge property.

## Interpretation

`UserNotificationListener` observes current Windows app/toast notifications. It does not provide a cross-application unread-count or taskbar-badge snapshot. Telegram's existing unread badge is therefore not expected to appear unless Telegram also creates a current Windows notification.

This does not yet prove Telegram native notifications cannot be captured. The remaining Telegram case is to verify that Telegram's Windows/native notifications are enabled, minimize or unfocus Telegram, and receive a new notification from an unmuted chat. No Telegram UI Automation integration is authorized or implemented in Milestone 0.
