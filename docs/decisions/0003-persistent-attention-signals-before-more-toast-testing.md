# ADR 0003: Evaluate persistent attention signals before more toast testing

- Status: Accepted and implemented for Milestone 0 feasibility
- Date: 2026-08-09
- Updated: 2026-08-10

## Context

The `UserNotificationListener` vertical slice works under a sparse package identity, and a real Snipping Tool notification completed the Windows -> Rust -> Tauri -> React add/remove path. However, Telegram displayed persistent unread/taskbar counts while no Telegram toast existed. Requiring applications to create or retain more Windows notifications would contradict Attention Hub's goal of reducing notification noise.

The intended signal is the state already represented by source applications and their taskbar/tray presence. Microsoft provides taskbar/badge methods for an application to set its own state, but no supported getter for another application's numeric badge. Generic taskbar UI Automation identified the Telegram button but did not expose the rendered number.

Read-only local probes found source-owned alternatives:

- Telegram Desktop exposed a trailing numeric count in its top-level window title and unread-chat counts in its UI Automation tree.
- Microsoft Teams exposed `New activity` through its notification-area accessibility label.
- New Outlook exposed `No unread messages` through its notification-area accessibility label in the observed state.

These labels are application-defined and are not yet proven stable or semantically equivalent.

## Decision

Extend Milestone 0 with one bounded persistent-attention-signal feasibility phase before continuing the toast application matrix.

The phase may read top-level window metadata and Windows UI Automation properties for exactly Telegram, Teams, and Outlook. It must remain local and read-only, use no source credentials, generate no notifications, perform no UI control, and add no OCR or undocumented Explorer scraping. The implementation should normalize application-owned data immediately and preserve raw diagnostic labels.

The existing notification adapter remains as technical evidence and a possible optional sensor. It is not assumed to be the primary product foundation.

## Implementation result

The bounded adapter now works through Windows/window UI Automation -> Rust normalized DTOs -> Tauri command -> React debug UI in ordinary unpackaged mode. Telegram produces two distinct numeric signals, Teams produces a qualitative activity signal, and New Outlook produces an aggregate of explicit unread counts from its English Inbox accessibility labels. The initial Outlook notification-area `No unread messages` label was rejected after it contradicted a real unread Inbox. React uses complete non-overlapping two-second refreshes for spike visibility and recovery. That cadence is explicitly not a production architecture decision.

Tauri remains proportionate for this experiment: this path needs neither sparse package identity nor a helper process. The final product decision still depends on transition, localization, version-drift, and long-duration behavior.

## Consequences

- The project can evaluate the signal the user actually wants without polluting Notification Center.
- Exact counts may be available for some sources and only qualitative state for others.
- Source-specific matching and localization/version fragility become explicit costs to measure.
- If the bounded probe is not reliable, the honest next choices are a separately reviewed OCR experiment, credentialed source APIs that conflict with current principles, or stopping/reframing the product—not pretending the toast snapshot is unread state.
