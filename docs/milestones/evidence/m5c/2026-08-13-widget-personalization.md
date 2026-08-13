# Widget personalization evidence

- Date: 2026-08-13 Europe/Kyiv
- Scope: clock alignment, two-event composition, panel appearance, app order,
  and native slot synchronization
- Sensitive values recorded: none

## Geometry contract

- Both clock labels: 24 logical pixels high in the same grid row.
- Calendar panel: unchanged at 432 by 72 logical pixels.
- Calendar content after padding, controls, and gaps: approximately 318 by 54
  pixels; two-event mode provides approximately 154 pixels per event.
- Each event uses three single-line rows with bounded overflow and ellipsis.
- App order contains exactly Teams, Telegram, and Outlook; Advanced is outside
  the ordered list and remains fixed last.

## Automated validation

- TypeScript and Vite production build passed with 42 transformed modules.
- Rust `cargo test` passed 30 tests.
- Rust `cargo clippy --all-targets --all-features -- -D warnings` passed.
- Rust formatting and Git whitespace checks passed.

## Live validation

The maintained `RUN-ATTENTION-HUB.cmd` launcher opened the current `5bc5`
checkout using the existing Rust target. Win32 reported the main window as
exactly 960 by 80 logical pixels. The live screenshot confirmed that Local and
New York occupy the same label row and that the existing panel geometry remains
aligned.

Advanced opened at its normal desktop size with native color and range inputs,
visible opacity output, named Move up and Move down controls, and both reset
actions. A bounded live interaction produced this evidence:

- opacity changed from 100 to 92 percent and all three normal panel surfaces
  updated immediately;
- Telegram moved from the second to the third React slot;
- its 40 by 40 native DWM surface moved from relative `104,20` to `160,20`
  within the existing reflow interval;
- Reset panel appearance restored 100 percent opacity;
- Reset default order restored Teams, Telegram, Outlook and returned the native
  Telegram surface to relative `104,20`;
- the Advanced button remained fixed last throughout.

The current calendar source exposed one upcoming event during the live pass, so
the two-event state was validated against its explicit CSS geometry contract
rather than by modifying calendar/provider data. The current and next columns
each have approximately 154 by 54 pixels, while their three bounded text rows
consume less than 48 pixels vertically.
