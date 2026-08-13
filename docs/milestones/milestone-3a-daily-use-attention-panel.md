# Milestone 3A: Daily-use attention panel

## Status

Approved and implemented on 2026-08-11, then superseded as the primary product
surface when the user clarified the three-zone desktop-widget vision. The
structured source contract, state model, and detailed panel remain implemented
as the on-demand Advanced view. The proposed five-day dogfood of this panel as
the primary surface is cancelled; Milestone 3B validates the actual widget
composition instead.

## Purpose

Answer this product question before adding more providers or lifecycle work:

> Does a compact, persistent panel of the already-proven source-owned signals
> help the user decide what currently needs attention?

The panel is a dogfood instrument, not a production design-system milestone.

## Entry evidence

- Telegram exposes an application counter and unread-chat count with different
  semantics.
- New Outlook exposes an aggregate English Inbox unread count.
- Teams exposes a qualitative activity state, not an exact count.
- ADR 0009 retains the optional visual-only Teams primary-taskbar mirror. Its
  cached 100 ms rectangle tracker, separate native window, session lifecycle,
  and accepted brief reflow flash remain unchanged.
- Windows `AppointmentStore` is stale, the Microsoft 365 Calendar companion is
  foreground-only, and Graph Phase 1 is paused before registration or consent.

## Phase A scope

### Structured observation boundary

- Return one structured observation for each fixed source: Telegram, Outlook,
  and Teams.
- Distinguish `observed`, `notRunning`, `notExposed`, and `error` without
  parsing diagnostic prose in React.
- Capture each source independently so one UI Automation error does not prevent
  later sources from being checked.
- Preserve the flattened signal list and source diagnostics for the technical
  evidence view.
- Emit observed inferred zeroes explicitly where the validated source contract
  represents zero by an absent count. Keep the `inferred` flag visible.

### Daily panel

- Lead with one overall attention summary, freshness, coverage, and a complete
  manual refresh.
- Always render Telegram, Outlook, and Teams in a fixed order.
- Keep Telegram's application counter and unread-chat count separate.
- Label Outlook specifically as aggregate Inbox unread.
- Label Teams as qualitative activity only; never invent a count.
- Keep the existing visual mirror control with Teams. The mirror remains a
  separate native companion rather than inline WebView content.
- Move Graph, calendar, Notification Center, raw signals, and diagnostics into
  one collapsed, always-reachable technical disclosure.
- Use a five-second, non-overlapping attention-snapshot loop as a measured
  dogfood variable. Do not change the mirror's native 100 ms cached check or
  its separate status poll.

## State rules

Attention and data health are separate dimensions.

- Any fresh or last-known positive signal remains `Needs attention`, even if
  another source is unavailable or the snapshot later becomes stale.
- `All clear` requires all three fixed sources to be freshly observed and
  clear.
- If at least one source is clear but coverage is incomplete, say `No attention
  detected` and show coverage rather than claiming all clear.
- If no source is readable, say `Nothing observed`.
- Preserve the last successful snapshot after an IPC refresh failure. The
  first failure is `retrying`; two consecutive failures or data older than
  three polling intervals is `stale`. With no usable snapshot, report failure.
- Source health is always expressed with text and never through color alone.

## Acceptance criteria

- [x] Every snapshot contains structured outcomes for all three fixed sources.
- [x] A failure capturing one source does not suppress the other captures.
- [x] React does not parse diagnostic strings to derive source state.
- [x] Telegram zero, Outlook zero, Teams inactive, not-running, not-exposed,
      and error cases render distinctly.
- [x] A positive source is never hidden by another source's failure.
- [x] Unqualified `All clear` appears only with fresh 3/3 clear coverage.
- [x] Manual and automatic attention refreshes cannot overlap.
- [ ] A successful live transition appears within one completed refresh cycle,
      targeting no more than eight seconds on the tested desktop.
- [x] The technical disclosure remains keyboard-operable, keeps its open state
      across refreshes, and retains every existing diagnostic surface.
- [x] The primary state is understandable without color and does not require
      horizontal scrolling at the default window size.
- [ ] The existing Teams mirror still starts asynchronously, shows the real
      taskbar visual, drags, stops, restarts, and closes cleanly.
- [x] TypeScript, Vite, Rust formatting, Clippy, Rust tests, and diff checks
      pass.
- [ ] A 30-to-60-minute same-day run records recovery and resource behavior.
- [ ] Five working days of dogfood produce an explicit continue, coverage,
      lifecycle, Graph-policy, or stop decision.

## Non-goals

- New calendar-provider work, Entra registration, consent, token, or Graph call.
- New observed sources or a generalized provider framework.
- Exact Teams counts, OCR, image recognition, pixel readback, or interpretation
  of the visual mirror.
- Changes to the mirror's accepted reflow behavior or secondary-taskbar work.
- UI Automation events, adaptive refresh, tray, autostart, persistence,
  installer work, themes, or a design system.
- Source-application input, focus, dismissal, or other control.

## Phase B dogfood gate

Run the Phase A build for five working days and record:

- false positives and false negatives;
- any false or misleading all-clear;
- source-not-running, not-exposed, and error periods;
- attention needs that the current signals cannot represent, especially Teams
  boolean coarseness and missing calendar data;
- observed transition latency and whether five seconds feels too slow;
- mirror use and reflow friction;
- whether the panel changed which applications the user manually checked.

Any unqualified all-clear while a source is stale, failed, or unobserved is an
implementation failure and must be fixed. Signal-coverage misses are recorded
separately so the exit decision can distinguish UI/state defects from provider
limitations.

## Exit decision

Milestone 3A completes when the dogfood evidence supports one explicit choice:

1. proceed to bounded lifecycle/presence work;
2. fix one demonstrated source reliability problem;
3. reopen a signal-coverage or organization-approved Graph decision;
4. stop or pivot because the panel does not improve the user's workflow.

Initial implementation and validation evidence is recorded in
`evidence/m3a/2026-08-11-phase-a-implementation.md`.
