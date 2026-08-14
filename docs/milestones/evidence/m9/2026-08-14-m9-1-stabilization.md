# Milestone 9.1 stabilization evidence — 2026-08-14

## Scope

This bounded pass addresses minimized Slack/Viber/WhatsApp activation,
truthful minimized Outlook state, multiline Later Inbox context, compact window
geometry, dirty-draft close behavior, opener focus return, and local write
recovery. It does not add a semantic messenger provider, background Outlook
synchronization, attachments, reminders, or lifecycle work.

## Automated evidence

- TypeScript and the Vite production build passed with 48 transformed modules.
- Attention-model, widget-preference migration, time-zone, responsive
  widget-layout, and Later Inbox model tests passed.
- All 40 Rust tests passed. The added cases cover iconic Slack/Viber/WhatsApp
  main-window candidates, multiline context at the 4,000-character boundary,
  and destructive writes that leave neither prior-content backup nor pending
  file.
- Clippy passed for all targets with warnings denied.
- Rust formatting and `git diff --check` passed.

## Live evidence still required

- Restart the development app so its Rust process loads this change, minimize
  Slack, Viber, and WhatsApp individually, and confirm each fixed hub button
  restores the correct titled main window without selecting a helper window.
- Minimize New Outlook with a previously observed unread count and confirm the
  widget announces last-observed state plus “open Outlook to refresh,” never a
  fresh inferred zero. Restore Outlook and confirm a fresh observation returns.
- Paste multiline synthetic text into Notes / context, verify the compact
  400×480 layout, edit/restart persistence, native-X draft guard, forced-colors,
  and focus return to both widget and Advanced launchers.

No source message text, calendar content, or screenshot was captured during the
automated gate. The already-running application was not stopped or foregrounded,
so this document does not claim the live checks above.
