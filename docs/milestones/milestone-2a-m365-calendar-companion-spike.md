# Milestone 2A: Microsoft 365 Calendar companion observer spike

## Status

Complete with a negative provider decision. Approved by ADR 0007 on 2026-08-10.
The Graph spike remains paused and no Entra tenant change has been made.

## Purpose

Prove or disprove this assumption:

> Attention Hub can obtain a useful current work-calendar snapshot by observing
> the official Microsoft 365 Calendar companion's Windows accessibility state,
> without owning Microsoft Graph credentials, permissions, or tokens.

This is a read-only accessibility feasibility spike, not a product calendar UI.

## Observed environment

- Package: `Microsoft.M365Companions`
- Version: `2.2605.21000.0`
- Calendar executable: `Calendar.exe`
- Packaging: Microsoft-signed MSIX/full-trust application
- Declared capabilities observed: full trust, package management, internet
  client; no Windows appointments capability was observed
- Runtime shape: taskbar companion backed by WebView2
- Microsoft documentation: companion calendar data is powered by Microsoft
  Graph

The package identity, version, and process path are environment evidence only.
Attention Hub must discover the executable by stable identity/name rules and
must not depend on the observed versioned installation path.

## Scope

- Detect the Calendar companion process and accessible top-level windows.
- Run a manual sanitized UI Automation probe from an explicit debug button.
- Record behavior while the companion is visible, dismissed/minimized, and
  restarted.
- If the structural probe succeeds, extract the smallest useful normalized
  seven-day/current-agenda model from accessibility properties.
- Compare the result with the visible companion and New Outlook calendar.
- Recover through complete snapshots; accessibility events are optional only
  after snapshot usefulness is proven.

## Non-scope

- Reading companion configuration, caches, cookies, WebView profiles, tokens,
  network requests, or private protocols.
- Process injection, hooks, screen OCR, image recognition, or coordinate-based
  scraping.
- Clicking events or invoking edit, join, chat, copy-link, or meeting actions.
- Event bodies, attendee lists, organizer addresses, account email, meeting
  links, or raw accessibility-tree dumps.
- Production agenda UI, settings, background polling policy, installer, or
  generalized provider framework.
- Resuming Attention Hub's own Graph registration during this spike.

## Phases

### Phase 0: package and provider evidence

- Identify the installed package/process and inspect its declared capabilities.
- Verify official Microsoft documentation for its calendar source.
- Record why installing the companion does not automatically prove that it
  populates Windows `AppointmentStore`.

Exit gate: the companion is an official current-calendar surface worth probing,
without assuming an undocumented store integration.

### Phase 1: sanitized accessibility surface

- Add a Windows-only native probe isolated from the normalized product model.
- Return structural metadata only: no raw labels, ARIA values, subjects, people,
  account identifiers, locations, or URLs.
- Bound window/element counts, output size, duration, and candidate count.
- Exercise it with the companion visible, dismissed/minimized, and restarted.

Exit gate: event-like elements are distinguishable through stable structural
signals, or the exact accessibility limitation is recorded.

### Phase 2: minimal normalized agenda — stopped at the product gate

Proceed only if Phase 1 succeeds in both visible and background states.

- Extract only the fields needed for attention: stable-enough local key,
  start/end or all-day state, subject, and cancellation/busy state when exposed.
- Omit/redact account identifiers, people, bodies, locations containing URLs,
  and join links before Rust returns data.
- Compare a complete current snapshot with the visible companion and New
  Outlook.

Exit gate: the snapshot materially matches the current work calendar without a
foreground-only/manual-navigation dependency, or the limitation is recorded.

### Phase 3: freshness and provider decision

- Test app restart, companion restart, visible-to-minimized transition, one
  naturally occurring event transition, and complete snapshot recovery.
- Measure scan latency and CPU cost.
- Decide: retain the companion observer, resume bounded Graph, or stop current
  work-calendar support.

## Acceptance criteria

- [x] No Entra registration, consent, permission, or token is created/read.
- [x] The probe emits no raw calendar/accessibility content.
- [x] Process-not-running and no-accessible-window states are nonfatal.
- [x] Visible and background/minimized behavior is recorded separately.
- [x] A complete snapshot matches the current companion calendar, or an exact
      blocker is recorded.
- [x] Meeting URLs, account email, attendees, and organizer data do not cross
      the Rust/Tauri boundary.
- [x] Scan latency and element/candidate bounds are recorded.

## Main risks

| Risk | Spike response |
| --- | --- |
| The WebView accessibility tree exists only while the flyout is visible. | Test each visibility state and reject foreground-only behavior if it cannot support the product. |
| Virtualization exposes only currently rendered events. | Compare the full desired range; do not infer missing items. |
| Labels mix subject, people, and meeting URLs. | Phase 1 returns structural metadata only; Phase 2 uses allowlisted parsing and redaction. |
| App updates/localization change the tree. | Prefer stable control roles/patterns and record package version; keep confidence explicit. |
| Scanning a large WebView tree is expensive. | Bound elements/candidates/duration and measure every manual probe. |
| The companion is Graph-backed but does not publish `AppointmentStore` data. | Treat UI Automation as a separate observer hypothesis; do not call it source switching. |

## Final findings

The installed Microsoft 365 Calendar companion did not add or switch a Windows
`AppointmentStore` provider. The count-only store query remained 11 calendars,
one distinct source display name, and 13 appointments. Because
`AllCalendarsReadOnly` already returns every calendar published to that store,
Attention Hub cannot select the missing current work calendar through a source
switch.

The companion's visible 450 by 724 flyout exposed a useful WebView
accessibility tree: one sample contained 139 elements, 31 sanitized candidates,
time and busy-state structure, and at least three event-like invokable rows.
When the flyout closed, 13 hidden process-owned windows remained but their 13
accessibility roots exposed only 21 shell elements, one candidate, and no event
or time structure. Timed repeat samples were unchanged.

This fails the passive-background requirement. Attention Hub will not flash or
open another application's flyout to refresh its state, and a cache updated only
when the user opens the companion would be stale by design. Phase 2 normalized
agenda extraction is therefore stopped. The companion observer is not retained
as an authoritative provider. Full redacted evidence is in
`evidence/m2a/2026-08-10-m365-calendar-companion-uia.md`.
