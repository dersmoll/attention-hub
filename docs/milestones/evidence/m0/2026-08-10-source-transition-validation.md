# Milestone 0 evidence: source-owned transition validation

## Run context

- Date: 2026-08-10, Europe/Kyiv (UTC+03:00).
- Ordinary unpackaged Attention Hub development/release builds.
- User-observed real Telegram, Microsoft Teams, and New Outlook state.
- Read-only taskbar and application UI Automation inspection; no source UI was controlled.
- No message sender, chat name, subject, account identifier, or body was retained.

## Telegram result

The Telegram application counter tracked incoming messages correctly. After the
user read all messages, the visible taskbar badge disappeared and the trailing
window-title counter disappeared. Attention Hub consequently removed the
Telegram counter row on its next complete refresh. This validates both the
nonzero updates and Telegram's zero-state representation.

## Teams result

Teams had one unread private message and displayed a red `1` on its taskbar
button. The Windows taskbar accessibility tree exposed the button identity and
`Microsoft Teams | New activity`, but did not expose the rendered number in
Name, HelpText, ItemStatus, ItemType, or descendants. Teams' own Activity and
Chat navigation controls exposed only their labels and keyboard shortcuts; no
numeric `1` or unread property was present.

Result: `needsAttention = true` is supported and matched the live state. An exact
count is not exposed through the bounded read-only metadata/UI Automation path.
Attention Hub must display `not exposed`, not invent `1`.

## Outlook result

New Outlook had at least one unread email while its notification-area label said
`No unread messages`. The tray-derived zero was therefore rejected as a mailbox
attention signal.

New Outlook's own accessibility tree exposed an Inbox folder label with an
explicit unread count of 1. The Rust adapter now finds `olk.exe`, deduplicates
English Inbox labels, sums only explicit unread counts, and returns:

```text
outlook:inboxUnread count=1 needs_attention=true
```

Account names and message content are neither returned nor logged. The matching
remains English-label and application-version dependent and needs a read-to-zero
transition test.

## Verification

- Nine Rust tests passed.
- Strict Clippy passed with warnings denied.
- TypeScript and Vite production build passed.
- Five consecutive unpackaged Tauri snapshots returned Outlook 1/true and Teams
  no-count/true after the known recoverable first-request UI Automation error.
