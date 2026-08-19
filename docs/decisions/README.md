# Stable product decisions

This page replaces milestone-by-milestone planning records with the decisions
that still define the public beta.

1. **Local-first observer.** Source applications own communication state and
   interaction. Attention Hub does not aggregate accounts or host messages.
2. **Normalized native boundary.** Windows adapters return bounded application-
   owned snapshots to the WebView; failures remain explicit.
3. **Semantic and visual state stay separate.** DWM thumbnails are visual-only.
   Unknown counts are never inferred from pixels, process presence, or window
   state.
4. **Fixed source set.** Teams, Telegram, New Outlook, Slack, Viber, and
   WhatsApp are explicit integrations, not a generalized provider framework.
5. **One passive calendar source.** A user-selected Published ICS source is the
   production calendar provider. Earlier AppointmentStore, UI Automation, and
   Graph experiments are retired from the runtime.
6. **Secret-safe calendar links.** The publication URL stays in Windows
   Credential Manager. Meeting URLs stay in Rust memory and cross IPC only as
   ephemeral tokens.
7. **Compact three-zone widget.** Communication, clocks, and calendar retain
   stable ownership and responsive widths; Advanced and Later Inbox open on
   demand.
8. **Local Later Inbox.** Bounded structured text and links are stored in a
   versioned local file. Arbitrary rich HTML, attachments, synchronization, and
   closed-app reminders are outside the beta.
9. **User-controlled lifecycle.** Position, pinning, appearance, enabled
   sources, and app order persist. Autostart, a Hub tray process, updater, and
   signing require separate future decisions.
10. **Evidence without private content.** Public documentation records behavior,
    limits, hashes, and sanitized results—not user paths, calendar URLs, account
    identifiers, messages, or personal notes.
