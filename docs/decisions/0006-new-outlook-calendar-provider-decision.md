# ADR 0006: Require an explicit provider decision for New Outlook calendar data

- Status: Accepted for a bounded spike
- Date: 2026-08-10

## Context

The unpackaged Windows `AppointmentStore` spike succeeded technically but failed
the product-coverage test. It returned 11 calendars and 13 appointments from a
source identified as the legacy Windows Mail and Calendar application. Direct
comparison with the current New Outlook and Microsoft 365 calendar views showed
a materially different schedule: some old recurring work events overlapped,
but current events were missing or replaced by stale entries. The store is
therefore not an authoritative source for the active work calendar.

The user's work address and calendar/event names are intentionally not recorded
in repository documentation or code. A supported authenticated provider can use
the signed-in identity (`/me`) and does not need a hardcoded email address.

New Outlook does not provide the classic Outlook COM integration used by older
desktop automation. UI Automation against the visible New Outlook calendar
would be application-version-, localization-, layout-, and visibility-dependent
and cannot provide a reliable complete seven-day recovery snapshot.

Microsoft Graph exposes a bounded `/me/calendarView` query. The least-privilege
delegated `Calendars.ReadBasic` permission reads basic event data while excluding
body, attachments, and extensions. This still requires a Microsoft Entra app
registration, user or tenant consent, and local access-token handling.

For Windows desktop applications Microsoft recommends MSAL.NET with the Windows
Web Account Manager broker. That route can reuse accounts known to Windows,
supports conditional access, and manages token caching and refresh, but it would
introduce a small Windows-only .NET authentication/provider component alongside
Tauri/Rust. Implementing OAuth and token storage directly in Rust would keep one
native language but would increase security-sensitive custom code and would not
use Microsoft's recommended desktop authentication library.

## Decision

On 2026-08-10, the user explicitly approved option 1: a bounded Microsoft Graph
spike using delegated `Calendars.ReadBasic`, MSAL.NET/WAM, local token handling,
no backend, and no write access.

The available product policies remain:

1. **Allow a bounded Microsoft Graph exception (recommended if current work
   calendar awareness is essential).** Use delegated `Calendars.ReadBasic`, a
   public-client app registration, MSAL.NET with WAM, no client secret, no
   backend, no write permission, and no email hardcoding. Keep tokens outside
   React and return only the existing normalized calendar model.
2. **Retain the original no-account-authorization rule.** Mark New Outlook
   calendar awareness unavailable and stop calendar provider work. Keep the
   Windows appointment-store code only as documented spike evidence or remove
   it from later product builds.

Do not choose Outlook UI scraping, local cache/profile reverse engineering,
classic Outlook COM, or raw username/password authentication as a fallback.

## Recommended Graph spike boundary

If option 1 is approved, add a new bounded milestone before production UI:

`Microsoft Graph -> MSAL.NET/WAM Windows helper -> normalized JSON -> Rust validation/model -> Tauri IPC -> React debug UI`

The helper owns authentication and Graph transport so access and refresh tokens
do not cross into React or command-line output. Rust remains the application
boundary, validates the helper response, applies privacy redaction, and exposes
the same application-owned DTOs. A single-file Windows sidecar is a hypothesis
to measure, not a permanent architecture commitment.

The spike must prove tenant consent, conditional-access compatibility, silent
refresh, sign-out/revocation, seven-day coverage parity, Teams-meeting metadata
handling, local token-cache behavior, binary/runtime cost, and failure recovery.
If those costs are disproportionate, reconsider the Tauri/helper split rather
than weakening authentication or privacy.

## Consequences

- Phase 2 `AppointmentStore.StoreChanged` work does not proceed because the
  underlying snapshot is not useful for the active work calendar.
- The current Windows appointment-store implementation remains diagnostic
  evidence, not the selected production provider.
- Calendar work is paused at a deliberate policy boundary rather than drifting
  into cloud access or brittle UI scraping.

## Official references

- Microsoft Graph: [List calendarView](https://learn.microsoft.com/en-us/graph/api/user-list-calendarview?view=graph-rest-1.0)
- Microsoft Graph: [Permissions reference (`Calendars.ReadBasic`)](https://learn.microsoft.com/en-us/graph/permissions-reference)
- Microsoft identity platform: [Using MSAL.NET with Web Account Manager](https://learn.microsoft.com/en-us/entra/msal/dotnet/acquiring-tokens/desktop-mobile/wam)
- Microsoft identity platform: [Authorization code flow with PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- Microsoft: [New Outlook state of COM add-ins](https://learn.microsoft.com/en-us/microsoft-365-apps/outlook/get-started/state-of-com-add-ins)
