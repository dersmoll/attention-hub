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
   Graph experiments are retired from the runtime. Accepted publishers are a
   bounded, named set — Microsoft 365 Outlook and Google Calendar — each with a
   required path shape. The host list bounds only *which* hosts may be fetched;
   HTTPS-only, credential-free, no query or fragment, blocked redirects, and the
   size and time caps are provider-independent and apply to every entry.
6. **Secret-safe calendar links.** The publication URL stays in Windows
   Credential Manager. Meeting URLs stay in Rust memory and cross IPC only as
   ephemeral tokens.
7. **Five-zone widget with two size presets.** Communication, clocks, calendar,
   Today/Projects destinations, and utility actions retain separate ownership.
   Recommended is the dense default; Compact single-line is the alternate
   compact rail. Project Hub and Advanced open on demand, and native mirrors
   follow the selected geometry.
8. **One local Projects and To-dos workspace.** Projects, personal lists,
   bounded notes and links, calendar bindings, and to-dos share one versioned
   local store. Project Hub is the two-column management surface; compact
   project, note, and to-do views reuse the same records. Arbitrary rich HTML,
   attachments, synchronization, and closed-app reminders are outside the beta.
9. **User-controlled lifecycle.** Position, pinning, appearance, enabled
   sources, and app order persist. A user-confirmed signed updater is supported.
   Autostart, a Hub tray process, and Authenticode signing require separate future decisions.
10. **Evidence without private content.** Public documentation records behavior,
    limits, hashes, and sanitized results—not user paths, calendar URLs, account
    identifiers, messages, or personal notes.
