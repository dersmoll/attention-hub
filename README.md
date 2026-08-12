# Attention Hub

Attention Hub is a local-first Windows desktop widget that keeps communication
attention, two clocks, and work-calendar context visible without replacing or
controlling the source applications.

## Current product slice

The primary window is a compact, frameless three-zone widget:

- left: live visual taskbar crops for Microsoft Teams and Telegram, with
  placeholders for Slack and Viber;
- center: local time and a configurable secondary timezone, defaulting to
  `America/New_York` with automatic EST/EDT handling;
- right: the active or next timed work-calendar event, with all-day entries used
  only as fallback context.

The widget can move, toggle always-on-top, and restores its physical position,
pin state, and secondary timezone. The ellipsis creates the Advanced window on
demand. Advanced contains the production work-calendar configuration, the
structured Telegram, New Outlook, and Teams attention panel, and retained
Notification Center/source diagnostics.

The live app visuals are DWM-composed primary-taskbar crops. Attention Hub does
not read, recognize, or convert their pixels into counts. Semantic values remain
separate: Telegram exposes two numeric signals, New Outlook exposes aggregate
Inbox unread, and Teams exposes qualitative activity only.

The work-calendar source is one explicitly selected Microsoft 365 Published ICS
calendar whose bearer link is stored only in Windows Credential Manager. The
widget shows a bounded active-or-next selection, prioritizes timed events over
all-day context, warns five minutes before a meeting, and supports an in-memory
**I'm in** acknowledgement that reveals one upcoming companion. It never
returns meeting URLs or controls Outlook. Earlier My Day, AppointmentStore, and
Graph provider experiments are retired from the production command surface and
remain documented as historical evidence.

## Canonical Windows build

Version `0.2.0` uses one supported distributable: the NSIS setup executable
created by `pnpm tauri build`. Development executables and Cargo/Vite output are
not release artifacts. The exact validated installer path and SHA-256 are
recorded in [the 0.2.0 release record](docs/releases/attention-hub-0.2.0.md).

## Source of truth

- [Product vision](docs/vision.md)
- [Architecture](docs/architecture.md)
- [Milestone 3B widget composition spike](docs/milestones/milestone-3b-widget-composition-spike.md)
- [Milestone 4A New Outlook My Day observer spike](docs/milestones/milestone-4a-new-outlook-my-day-observer-spike.md)
- [Milestone 4B Published ICS observer spike](docs/milestones/milestone-4b-published-ics-observer-spike.md)
- [Milestone 4C Published ICS semantic gate](docs/milestones/milestone-4c-published-ics-semantics.md)
- [Milestone 4D saved work-calendar widget](docs/milestones/milestone-4d-widget-calendar.md)
- [Attention Hub 0.2.0 release record](docs/releases/attention-hub-0.2.0.md)
- [Architecture decisions](docs/decisions/)

## Development

Prerequisites are Node.js, pnpm, Rust with the MSVC target, Microsoft C++ Build
Tools with the Desktop development with C++ workload, and WebView2.

```powershell
pnpm install --frozen-lockfile
pnpm build
cd src-tauri
cargo test --all-targets
cargo clippy --all-targets -- -D warnings
cd ..
pnpm tauri dev
pnpm tauri build
```

Ordinary unpackaged runs support the widget and source-owned attention path.
The retained Notification Center live-event experiment has a separate sparse
identity route and is not required by the primary widget.
