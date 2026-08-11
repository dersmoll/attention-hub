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
- right: a truthful unavailable state until an accurate passive work-calendar
  provider is approved.

The widget can move, toggle always-on-top, and restores its physical position,
pin state, and secondary timezone. The ellipsis creates the Advanced window on
demand. Advanced contains the structured Telegram, New Outlook, and Teams
attention panel plus the retained Graph, calendar, Notification Center, raw
source, and diagnostic evidence.

The live app visuals are DWM-composed primary-taskbar crops. Attention Hub does
not read, recognize, or convert their pixels into counts. Semantic values remain
separate: Telegram exposes two numeric signals, New Outlook exposes aggregate
Inbox unread, and Teams exposes qualitative activity only.

Calendar integration remains unavailable. Milestone 4A's manual sanitized New
Outlook My Day probe found useful structure while Outlook was visible or fully
covered, but the tree unloaded when Outlook was minimized. That passive UI
Automation provider is rejected; semantic extraction and widget calendar data
remain disabled. Windows `AppointmentStore` returned stale legacy data, the
Microsoft 365 Calendar companion exposes event structure only while visible,
and Microsoft Graph work remains paused before registration or consent.

## Source of truth

- [Product vision](docs/vision.md)
- [Architecture](docs/architecture.md)
- [Milestone 3B widget composition spike](docs/milestones/milestone-3b-widget-composition-spike.md)
- [Milestone 4A New Outlook My Day observer spike](docs/milestones/milestone-4a-new-outlook-my-day-observer-spike.md)
- [Architecture decisions](docs/decisions/)

## Development

Prerequisites are Node.js, pnpm, Rust with the MSVC target, Microsoft C++ Build
Tools with the Desktop development with C++ workload, and WebView2.

```powershell
pnpm install --frozen-lockfile
pnpm build
cd src-tauri
cargo test
cargo clippy --all-targets -- -D warnings
cd ..
pnpm tauri dev
```

Ordinary unpackaged runs support the widget and source-owned attention path.
The retained Notification Center live-event experiment has a separate sparse
identity route and is not required by the primary widget.
