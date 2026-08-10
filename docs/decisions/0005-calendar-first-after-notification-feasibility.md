# ADR 0005: Make calendar awareness the next technical spike

- Status: Accepted for planning
- Date: 2026-08-10

## Context

Milestone 0 proves that Tauri and a small Rust Windows boundary can expose useful source-owned state, but source semantics differ: Telegram and New Outlook expose numeric values while Teams exposes only a trustworthy qualitative activity state. Further Teams badge reverse-engineering reached its stop condition and would require disproportionate application-specific techniques.

Upcoming meetings and appointments are a higher-value answer to “what needs my attention?” than another round of badge scraping. Microsoft documents a Windows `AppointmentStore` API that can request read-only access to calendars on the device and query appointments by time range. Microsoft also documents a package `appointments` capability for reading appointments from synchronized accounts. However, current API reference pages label the requirement `appointmentsSystem`, and it is not yet proven that New Outlook publishes the user's work calendar into this Windows store for a medium-integrity sparse-package desktop app.

Classic Outlook COM integration is not a viable direction for this machine because Microsoft states that New Outlook for Windows does not support COM add-ins. Microsoft Graph offers strong calendar coverage through delegated permissions such as `Calendars.ReadBasic`, but that requires OAuth/account authorization and conflicts with the current no-Outlook-credentials principle.

## Decision

Plan Milestone 1 as a bounded Windows appointment-store spike.

- Test ordinary unpackaged execution first, then the existing sparse-identity route with `uap:Capability Name="appointments"` only after reviewing the manifest/privacy change.
- Request `AllCalendarsReadOnly`; do not request write access.
- Prove whether real New Outlook and Teams meeting events appear before building any calendar product UI.
- Keep a complete normalized snapshot as the recovery authority and treat store events only as invalidation signals if the snapshot succeeds first.
- Keep Graph, Outlook UI Automation, local Outlook-profile reads, and classic Outlook COM out of the initial spike.

If the Windows store is empty or inaccessible, stop and present a product-policy decision: explicitly allow local OAuth with Microsoft Graph, accept calendar unavailability, or reconsider the source. Do not silently add credentials or scrape the Outlook UI.

## Identity cleanup

Retain the existing development identity and certificate only through the appointment-store feasibility test because calendar access may depend on package identity/capability. Reassess and remove them after the spike if they are not needed. This is not a production packaging commitment.

## Consequences

- Calendar work remains local-first and credential-free during its first hypothesis test.
- Package capability and New Outlook interoperability are explicit spike variables rather than assumed facts.
- A negative appointment-store result is allowed and will trigger a user-visible architecture decision instead of an unapproved Graph pivot.
