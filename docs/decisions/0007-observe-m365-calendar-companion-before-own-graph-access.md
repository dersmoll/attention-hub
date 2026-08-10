# ADR 0007: Observe the Microsoft 365 Calendar companion before own Graph access

- Status: Accepted, spike completed with a negative provider decision
- Date: 2026-08-10

## Context

The Windows `AppointmentStore` spike returned useful appointment objects but
only from an old Windows Mail and Calendar data source. It did not return the
current work calendar shown by New Outlook and the Microsoft 365 Calendar app.

ADR 0006 approved a least-privilege Microsoft Graph spike. Its environment-only
Phase 0 succeeded, but creating an Entra application inside an employer-owned
tenant introduces an organization-ownership and approval concern. No Entra
registration, permission, consent, token, or Graph request was created.

The user installed Microsoft's `Microsoft.M365Companions` package. The Calendar
companion displays the correct Microsoft 365 schedule in a taskbar-integrated
window and Microsoft documents that the companion apps are powered by Microsoft
Graph. The companion therefore already owns the organization authentication and
calendar retrieval that Attention Hub needs to observe.

## Decision

Pause Attention Hub's own Graph registration and perform one bounded read-only
Windows UI Automation spike against the Microsoft 365 Calendar companion.

The spike may inspect the companion's accessibility tree and return a normalized
debug snapshot through Rust and Tauri. It must not:

- create or modify an Entra registration;
- request Microsoft Graph permissions or extract the companion's tokens;
- inspect network traffic, inject code, hook the process, or reverse engineer
  private protocols or caches;
- click, edit, join, accept, decline, or otherwise act on calendar items;
- log raw accessibility labels containing event, person, account, or meeting-link
  data during the initial structural probe.

The initial probe returns only structural metadata such as process/window
presence, control type, accessibility-property kind, fixed keyword matches,
time/URL-presence booleans, value length, bounds, offscreen state, and supported
patterns. Returning subjects and times requires a second explicit implementation
phase after the structural surface proves stable enough.

## Why this is proportionate

The companion is an official Microsoft taskbar surface built for persistent
calendar awareness. Observing its accessibility state matches Attention Hub's
observer boundary and avoids a second organization-facing application identity.
It is still less stable than a supported data API, so it remains a spike and not
an assumed production provider.

## Consequences

- The Graph helper Phase 0 remains evidence but WAM/Graph Phase 1 is paused.
- The native `AppointmentStore` snapshot remains useful evidence and may gain
  additional account/source diagnostics, but it cannot select data that its
  providers do not publish.
- Success requires useful accessibility state when the companion is open and a
  documented result when it is minimized/backgrounded.
- If the companion exposes only a foreground-rendered or unstable tree, the
  provider decision returns to Graph-versus-no-calendar-support; private cache
  or token extraction is not an allowed workaround.

## Outcome

The companion exposed useful event structure only while its taskbar flyout was
visible. With the flyout closed, hidden process windows remained but the event
WebView accessibility tree was unloaded. Installing the companion also left the
Windows `AppointmentStore` result unchanged.

Attention Hub will not automatically open or flash the companion because that
would control another application and create interruption. It will not treat a
manual, stale last-opened cache as an authoritative calendar. Normalized agenda
extraction from this surface is stopped, and the temporary diagnostic is not a
product provider. Attention Hub's own Graph work remains paused unless the
employer-owned tenant explicitly approves the registration and delegated
consent.

## Official references

- Microsoft Support: [Get started with Microsoft 365 companions](https://support.microsoft.com/en-us/microsoft-365-companions/get-started-with-microsoft-365-companions)
- Microsoft Learn: [Microsoft 365 companion apps overview](https://learn.microsoft.com/en-us/microsoft-365-apps/companions/overview)
- Microsoft Learn: [`AppointmentCalendar`](https://learn.microsoft.com/en-us/uwp/api/windows.applicationmodel.appointments.appointmentcalendar)
- Microsoft Learn: [`UserDataAccount`](https://learn.microsoft.com/en-us/uwp/api/windows.applicationmodel.userdataaccounts.userdataaccount)
