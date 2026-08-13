# Milestone 8 implementation evidence — 2026-08-13

## Bounded source finding

Current-machine sanitized discovery found one usable taskbar app-button surface
for Slack and WhatsApp and one usable Viber app-button surface after excluding
its notification-area icon. Application accessibility descendants exposed no
trustworthy unread/new-message candidate for any of the three. Numeric taskbar
labels were not accepted as unread semantics.

## Automated evidence

- Widget preference migration tests passed, including one-time catalog migration
  and preservation of a later explicit three-source choice.
- Attention coverage tests passed, including a visual-only-only selection that
  cannot produce all clear.
- Miami conversion tests passed for EST, EDT, invalid input, and the nonexistent
  spring-forward local time.
- Responsive layout tests passed for 0, 1, 3, and 6 visible sources (816–1152
  logical pixels overall).
- TypeScript and the Vite production build passed with 44 transformed modules.
- `cargo test --all-targets` passed 32 tests.
- Rust formatting and `git diff --check` passed.

## Live current-machine evidence

The development widget started with the existing saved preferences/calendar.
Win32 geometry reported:

- main widget: 1152×80;
- Teams visual: 40×40 at source slot 0;
- Telegram visual: 40×40 at source slot 1;
- Slack visual: 40×40 at source slot 3;
- Viber visual: 40×40 at source slot 4;
- WhatsApp visual: 40×40 at source slot 5.

Outlook correctly occupied React slot 2 without a DWM surface. The first run
reproduced a missing Tauri `set-size` capability; adding only that bounded window
permission removed the error on restart. The widget showed the six local/native
icons, 36-pixel clocks labeled Local and ET · Miami, and the existing upcoming
calendar event without changing or fabricating provider data.

No screenshot is retained because the live calendar surface can contain private
subject text. Release packaging, installer execution, and user acceptance are
not claimed by this evidence.
