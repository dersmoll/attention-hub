# Attention Hub

Attention Hub is a local-first Windows desktop widget that keeps communication
attention, two clocks, and work-calendar context visible without replacing or
controlling the source applications.

## Current product slice

The primary window is a compact, frameless three-zone widget:

- left: aligned Microsoft Teams, Telegram, and New Outlook buttons; Teams and
  Telegram can show smaller inset live taskbar tiles while Outlook uses its
  local glyph and truthful semantic state;
- center: local time and a configurable secondary timezone, defaulting to
  `America/New_York` with automatic EST/EDT handling;
- right: the active or next timed work-calendar event, with all-day entries used
  only as fallback context.

The approved compact shell is a 960 by 80 logical-pixel window. Its aligned
304, 208, and 432-pixel panels are 72 pixels high with 8-pixel gaps. App and
Advanced targets are 48 pixels square, pin and close have dedicated 40-pixel
targets inside the calendar panel, and the two clocks share one horizontal row.

The widget can move, toggle always-on-top, and restores its physical position,
pin state, secondary timezone, panel color and opacity, and left-panel app
order. The ellipsis creates the Advanced window on demand. Advanced contains
these bounded widget preferences, the production work-calendar configuration,
the structured Telegram, New Outlook, and Teams attention panel, and retained
Notification Center/source diagnostics. Advanced remains fixed last in the app
row; native Teams and Telegram visuals follow reordered slots.

The live Teams and Telegram tiles are inset DWM-composed crops
selected from the taskbar on the source application's monitor, with bounded
fallback across the available taskbars. They appear only while the separate
semantic source reports attention. Attention Hub does not read, recognize, or
convert their pixels into counts. Semantic values remain separate: Telegram exposes numeric
signals, New Outlook exposes aggregate Inbox unread only when its English UI
Automation label is available, and Teams exposes qualitative activity only.
Selecting an app button activates an existing source window; it does not launch
the app or interact with its contents.

If minimizing New Outlook temporarily removes that accessibility label, the
widget may retain the last count observed during this process. That fallback is
amber and dashed, is announced as last-observed, and clears when Outlook stops;
it is not presented as a fresh count.

The work-calendar source is one explicitly selected Microsoft 365 Published ICS
calendar whose bearer link is stored only in Windows Credential Manager. The
widget shows a bounded active-or-next selection, prioritizes timed events over
all-day context, warns five minutes before a meeting, and supports an in-memory
**I'm in** acknowledgement that reveals one upcoming companion. It never
returns meeting URLs or controls Outlook. Earlier My Day, AppointmentStore, and
Graph provider experiments are retired from the production command surface and
remain documented as historical evidence.

## Production-ready beta

Version `0.3.0-beta.1` is the production-ready daily-use beta. It uses one
supported distributable: the NSIS setup executable created by
`pnpm tauri build`. Development executables and Cargo/Vite output are not
release artifacts. The exact validated installer path and SHA-256 are recorded
in [the 0.3.0-beta.1 release record](docs/releases/attention-hub-0.3.0-beta.1.md).
The previous `0.2.0` release record remains historical evidence.

## Source of truth

- [Product vision](docs/vision.md)
- [Architecture](docs/architecture.md)
- [Milestone 3B widget composition spike](docs/milestones/milestone-3b-widget-composition-spike.md)
- [Milestone 4A New Outlook My Day observer spike](docs/milestones/milestone-4a-new-outlook-my-day-observer-spike.md)
- [Milestone 4B Published ICS observer spike](docs/milestones/milestone-4b-published-ics-observer-spike.md)
- [Milestone 4C Published ICS semantic gate](docs/milestones/milestone-4c-published-ics-semantics.md)
- [Milestone 4D saved work-calendar widget](docs/milestones/milestone-4d-widget-calendar.md)
- [Milestone 5A left icon panel polish](docs/milestones/milestone-5a-left-icon-panel.md)
- [Milestone 5B compact widget Option A](docs/milestones/milestone-5b-compact-widget-option-a.md)
- [Milestone 5C widget alignment and personalization](docs/milestones/milestone-5c-widget-personalization.md)
- [Attention Hub 0.3.0-beta.1 release record](docs/releases/attention-hub-0.3.0-beta.1.md)
- [Attention Hub 0.2.0 release record](docs/releases/attention-hub-0.2.0.md)
- [Architecture decisions](docs/decisions/)

## Development

Prerequisites are Node.js, pnpm, Rust with the MSVC target, Microsoft C++ Build
Tools with the Desktop development with C++ workload, and WebView2.

For ordinary user testing, double-click `RUN-ATTENTION-HUB.cmd` in the repository
root. It switches to the correct checkout, stops a previous Attention Hub run,
cleans up a stale repository-owned development server, installs dependencies on
the first run, and launches the current development build. The launcher uses the
bundled local Node runtime and does not require `pnpm` on the system PATH.

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
