# Attention Hub

Attention Hub is a local-first Windows desktop widget that keeps communication
attention, two clocks, work-calendar context, and a personal Later Inbox visible
without replacing or controlling the source applications.

## Current product slice

The primary window is a compact, frameless three-zone widget:

- left: ordered Microsoft Teams, Telegram, New Outlook, Slack, Viber, and
  WhatsApp buttons; five sources can use inset live taskbar pixels while Outlook
  uses its local glyph and truthful semantic state;
- center: doubled-size local and secondary clocks, defaulting to DST-aware
  **ET · Miami**, with an inline Miami-to-local time converter;
- right: the active or next timed work-calendar event, with a thin active-event
  progress line and all-day entries used only as fallback context.

The next-release shell is a 744–1208 by 80 logical-pixel window whose left
panel follows the enabled app count. The clock panel is 296 pixels; the
calendar panel is 304, 336, or 432 pixels by density mode. All panels are 72
pixels high with 8-pixel gaps. App and
Later/Advanced targets are 48 pixels square, pin and close have dedicated
40-pixel targets inside the calendar panel, and the two clocks share one
horizontal row. The six-source Auto single-event composition is 1112 pixels
wide.

The widget can move, toggle always-on-top, and restores its physical position,
pin state, secondary timezone, panel color and opacity, and left-panel app
order. Advanced can monitor any selected subset of the three fixed sources and
can independently disable the visual-only Teams or Telegram taskbar surface;
existing preferences migrate to all sources and both visuals enabled. Coverage
is reported against the selected sources, and selecting none reports monitoring
paused rather than all clear. The ellipsis creates the Advanced window on
demand. Advanced contains these bounded widget preferences, the production
work-calendar configuration,
the structured fixed-source attention panel and retained
Notification Center/source diagnostics. Advanced remains fixed last in the app
row; enabled native visual surfaces follow reordered slots.

The fixed Later button sits after enabled source apps and before Advanced. It
opens one on-demand 360×420 local capture/review window with a required title,
optional link-aware multiline notes/context, HTTP(S) URL, and follow-up time.
Work and Private tabs separate review without using separate storage;
notes on open cards are collapsed by default. Pasted linked words and line
breaks are retained without storing arbitrary HTML. Items use a Rust-owned
schema-v3 JSON file and one previous-valid local backup under this Windows
user's application-data directory. Earlier test-only schemas are reset rather
than migrated. They never enter source attention coverage or **All clear**.
An opt-in Windows notification can fire once when a follow-up becomes due while
Attention Hub is installed, running, and awake; private reminders omit the item
title. There is no closed-app delivery guarantee. Advanced exposes bounded
Later data and deletion controls.

The live Teams, Telegram, Slack, Viber, and WhatsApp tiles are inset
DWM-composed crops
selected from the taskbar on the source application's monitor, with bounded
fallback across the available taskbars. Teams and Telegram appear only while
their separate semantic source reports attention; the added messenger surfaces
follow running app presence. Attention Hub does not read, recognize, or
convert their pixels into counts. Semantic values remain separate: Telegram exposes numeric
signals, New Outlook exposes aggregate Inbox unread only when its English UI
Automation label is available, and Teams exposes qualitative activity only.
Slack, Viber, and WhatsApp do not contribute to semantic coverage because their
current source surfaces do not expose a trustworthy unread contract.
Selecting an app button activates an existing source window; it does not launch
the app or interact with its contents.

If New Outlook is minimized or temporarily removes that accessibility label,
the widget removes the numeric badge instead of presenting stale data or an
ellipsis. Attention Hub does not infer a current zero from a minimized
accessibility tree. Hover and accessible text explain that opening Outlook is
required to refresh the unread count.

The work-calendar source is one explicitly selected Microsoft 365 Published ICS
calendar whose bearer link is stored only in Windows Credential Manager. The
widget shows a bounded active-or-next selection, prioritizes timed events over
all-day context, warns five minutes before a meeting, and supports an in-memory
**I'm in** acknowledgement that reveals one upcoming companion. Allowlisted
Teams, Zoom, Google Meet, and Webex links can be opened through a compact Join
control. Rust retains the URL behind an ephemeral token; the URL never enters
the WebView, logs, fixtures, or evidence. The provider never controls Outlook.
Earlier My Day, AppointmentStore, and Graph provider experiments are retired
from the production command surface and remain documented as historical
evidence.

## Current beta

Version `0.4.0-beta.1` is the current daily-use beta. It uses one
supported distributable: the NSIS setup executable created by
`pnpm tauri build`. Development executables and Cargo/Vite output are not
release artifacts. The exact validated installer path and SHA-256 are recorded
in [the 0.4.0-beta.1 release record](docs/releases/attention-hub-0.4.0-beta.1.md).
The `0.3.0-beta.1` and `0.2.0` release records remain historical evidence.

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
- [Milestone 6 beta hardening and daily-use evidence](docs/milestones/milestone-6-beta-hardening.md)
- [Milestone 7 fixed-source monitoring controls](docs/milestones/milestone-7-fixed-source-controls.md)
- [Milestone 8 messenger and clock refinement](docs/milestones/milestone-8-messenger-clock-refinement.md)
- [Milestone 9 local-first Later Inbox](docs/milestones/milestone-9-later-inbox.md)
- [Milestone 9.2 link-aware compact Later Inbox](docs/milestones/milestone-9-2-link-aware-compact-inbox.md)
- [Milestone 9.3 focus and follow-up polish](docs/milestones/milestone-9-3-focus-follow-up-polish.md)
- [Attention Hub 0.4.0-beta.1 release record](docs/releases/attention-hub-0.4.0-beta.1.md)
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
