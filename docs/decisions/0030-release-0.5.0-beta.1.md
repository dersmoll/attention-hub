# ADR 0030: Release 0.5.0-beta.1 Later Inbox beta

- Status: accepted
- Date: 2026-08-17

## Context

Since `0.4.0-beta.1`, Milestone 8 refined the existing fixed messenger surfaces
and time tools. Milestone 9 added the bounded local-first Later Inbox, retained
safe links from pasted context, compacted its review surface, made minimized
Outlook state truthful, added allowlisted calendar Join actions, and introduced
opt-in due notifications while Attention Hub is running.

Automated validation passed. The user then tested the completed build throughout
a workday, reported no critical or release-blocking issue, and approved release.

## Decision

Release this product slice as `0.5.0-beta.1` using the existing unsigned x64
NSIS distribution.

The minor beta increment reflects the first release of the user-owned Later
Inbox and its Work/Private follow-up flow. Earlier disposable Later Inbox test
schemas start clean; no legacy migration layer is included.

## Consequences

The release preserves fixed-source attention semantics, visual-only DWM
surfaces, source activation, widget preferences and position, time tools, and
the single saved Published ICS provider. Meeting URLs remain in Rust behind
ephemeral tokens, and Private reminder titles remain redacted.

The installer remains unsigned. Execution of this exact installer, in-place
upgrade from `0.4.0-beta.1`, uninstall retention, clean-machine behavior,
signing, updater, autostart, tray, Graph, OCR, cloud sync, generalized providers,
attachments, and scheduled closed-app reminders are not claimed.
