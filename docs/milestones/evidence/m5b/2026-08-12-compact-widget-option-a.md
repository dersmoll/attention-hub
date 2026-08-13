# Compact widget Option A evidence

- Date: 2026-08-12 Europe/Kyiv
- Scope: approved compact main-widget geometry and accessibility contract
- Sensitive values recorded: none

## Approved geometry

- Outer window: 960 by 80 logical pixels.
- Panels: 304, 208, and 432 pixels wide; 72 pixels high at `y=4`.
- Gaps: 8 pixels. Panel radius: 10 pixels.
- App and Advanced targets: 48 by 48 pixels.
- Local and native inner surfaces: 40 by 40 pixels.
- Pin and close controls: 40 by 40 pixels.

## Automated validation

- TypeScript `--noEmit` passed.
- Vite production build passed with 41 transformed modules.
- Rust `cargo test --all-targets` passed 30 tests.
- `cargo clippy --all-targets -- -D warnings` passed.
- `cargo fmt --all -- --check` and `git diff --check` passed.

## Live geometry gate

The maintained `RUN-ATTENTION-HUB.cmd` launcher opened one development instance
from the active `5bc5` checkout. At 96 DPI, Win32 reported:

- main window: `1255,728,2215,808`, exactly 960 by 80;
- Teams native surface: `1303,748,1343,788`, exactly 40 by 40 and therefore
  `x=48`, `y=20` relative to the main window;
- Telegram native surface: `1359,748,1399,788`, exactly 40 by 40 and therefore
  `x=104`, `y=20` relative to the main window.

Both DWM registrations succeeded. Teams selected the primary taskbar and
Telegram selected the secondary taskbar containing its source window.

The first capture exposed an inherited generic `section + section` margin that
shifted the clock and calendar down by 32 pixels. The widget zones now reset
that document-flow margin. A second exact-window capture confirmed all three
panels aligned at `y=4...76`, complete horizontal clocks, and dedicated control
space inside the calendar panel. The test app and Vite server were then stopped.

Disk audit found the original `D:` checkout still held a stale 20.79 GiB Rust
target. `cargo clean` removed 32,340 rebuildable files and 20.8 GiB there. The
current `5bc5` target remains the single build cache at approximately 6.26 GiB.

## User acceptance

Option A was approved before implementation. On 2026-08-13 the user reported
that the result was much better; the follow-up clock, calendar-fit, and bounded
personalization requests are implemented and recorded in Milestone 5C.
