# Milestone 2: Microsoft Graph calendar spike

## Status

Paused after Phase 0. Explicitly approved on 2026-08-10 through ADR 0006
option 1, but no Entra registration was created and no tenant change was made.
The user raised a valid organization-ownership concern before Phase 1. ADR 0007
therefore triggered a bounded Microsoft 365 Calendar companion accessibility
spike. That spike is complete and did not produce a passive background provider.
Graph remains paused unless the organization explicitly approves Attention
Hub's application registration and delegated consent.

## Purpose

Prove or disprove this assumption:

> Attention Hub can use least-privilege delegated Microsoft Graph access through
> Microsoft's supported Windows authentication broker to obtain an accurate
> seven-day New Outlook work-calendar snapshot, while keeping authentication,
> tokens, and provider-specific objects outside React.

This is a bounded provider/authentication spike, not production account support
or a product calendar UI.

## Paused policy exception

- Microsoft Graph cloud access is allowed only for this calendar spike.
- Request delegated `Calendars.ReadBasic` only.
- Use a desktop public client with MSAL.NET and Windows Web Account Manager.
- Keep tokens local and broker-managed; do not return or log tokens.
- No client secret, backend, write permission, application permission, daemon,
  username/password flow, or hardcoded email address.
- Authentication must start from an explicit user action after explanatory UI.
- The first query targets the selected account's default `/me/calendarView`.

## Non-scope

- Production calendar/agenda UI, settings, multi-account aggregation, or account
  auto-discovery.
- Event bodies, body previews, attendees, organizer addresses, attachments,
  extensions, meeting transcripts, chats, or online-meeting APIs.
- Creating, updating, accepting, declining, deleting, or responding to events.
- Shared mailboxes, group calendars, room calendars, or delegated calendars.
- A cloud backend, client secret, telemetry, database, or custom token service.
- Replacing WAM/MSAL with raw OAuth, embedded credentials, browser scraping, New
  Outlook UI Automation, local Outlook-cache reads, COM, VBA, VSTO, or MAPI.
- Production installer/signing decisions for the helper.

## Registration contract

The spike requires a Microsoft Entra application registration with:

- account type: initially single-tenant work/school account;
- platform: Mobile and desktop applications;
- WAM redirect URI:
  `ms-appx-web://microsoft.aad.brokerplugin/{application-client-id}`;
- public client flow enabled;
- Microsoft Graph delegated permission: `Calendars.ReadBasic` only;
- no secret or certificate credential.

The application/client ID and tenant/directory ID are development coordinates,
not secrets, but they must not be inferred from or replaced by the user's email.
For the spike they are supplied through ignored local configuration or scoped
environment variables and are not committed until the registration ownership
and intended distribution policy are decided.

Tenant policy can still block user consent even though the permission itself
does not normally require administrator consent. Record the exact result; do
not broaden permissions to work around a tenant restriction.

## Architecture hypothesis

```text
Microsoft Graph
  -> Windows-only .NET 8 helper (MSAL.NET + WAM + bounded Graph HTTP)
  -> one-request/one-response normalized JSON protocol
  -> Rust process adapter, validation, privacy redaction, application DTO
  -> Tauri commands
  -> React debug UI
```

The helper is a sidecar hypothesis, not an automatic permanent dependency. It
owns token acquisition and Graph transport so tokens never cross stdout or IPC.
Rust supplies the Tauri window handle for WAM parenting, validates bounded JSON,
re-applies URL/privacy filtering, and remains the contract owner. React receives
no MSAL, Graph, access-token, account-email, or Windows broker types.

## Helper protocol constraints

- One JSON request on standard input and one JSON response on standard output.
- Standard output contains protocol JSON only; diagnostics are sanitized.
- Never emit access tokens, refresh tokens, authorization codes, claims, email
  addresses, raw Graph responses, body fields, attendees, or meeting links.
- Initial operations: environment/status, interactive connect, seven-day
  snapshot, and local sign-out/cache removal.
- Interactive connect requires a real Tauri HWND and explicit button click.
- Try silent token acquisition before interactive fallback, but do not trigger
  interactive UI from startup/status/snapshot commands without user action.
- Apply response-size, process-duration, and item-count bounds in Rust.
- A complete Graph snapshot remains authoritative; no delta/webhook/subscription
  work is allowed until parity and recovery are proven.

## Normalized snapshot contract

The existing application-owned calendar shape remains the target, with provider
metadata added only where required for diagnostics:

```ts
interface GraphCalendarSnapshot {
  accessStatus: "notConfigured" | "signedOut" | "allowed" | "denied" | "error";
  capturedAt: string;
  rangeStart: string;
  rangeEnd: string;
  source: "microsoftGraph";
  appointments: CalendarAppointment[];
  diagnostics: string[];
}
```

Safe event selection is limited to identifiers, subject, start/end, all-day,
location after URL redaction, show-as/busy state, sensitivity, recurrence/type,
and cancellation state if required to prevent false attention. No raw response
is passed through.

## Implementation phases

### Phase 0: tooling, registration, and protocol skeleton

- Install the supported .NET 8 SDK; do not use the installed end-of-support
  .NET 5 SDK.
- Add a Windows-only helper project and deterministic build command.
- Add MSAL.NET broker dependencies and a protocol-only environment operation.
- Add Rust invocation with strict output/time/size/error handling.
- Keep client and tenant IDs unconfigured; prove the missing-config diagnostic.

Exit gate: helper builds, Rust invokes it safely, no secrets/tokens are emitted,
and missing registration coordinates are a clear nonfatal status.

Result on 2026-08-10: passed. .NET 8 SDK 8.0.423 was installed, the
framework-dependent single-file helper built with MSAL.NET and WAM broker
4.87.0, and the Tauri -> Rust -> helper -> normalized React path returned
`notConfigured`. The helper and Windows/WAM were available, both registration
coordinates were absent, and no authentication or Graph request occurred.

### Phase 1: WAM consent feasibility

- Configure the Entra public-client registration.
- Pass the real Tauri HWND to the helper.
- From an explicit debug-UI button, attempt silent acquisition then interactive
  WAM account selection/consent for `Calendars.ReadBasic`.
- Record tenant consent, conditional-access, cancellation, denial, repeat, app
  restart, and local sign-out behavior.

Exit gate: WAM returns a Graph token internally for the selected work account,
or an exact tenant/registration/broker blocker is recorded.

### Phase 2: seven-day parity snapshot

- Query `/v1.0/me/calendarView` with explicit UTC start/end values.
- Use `$select` to request only approved basic fields.
- Normalize inside the helper, validate/redact again in Rust, and render an ugly
  debug table.
- Compare the result directly with current New Outlook and Microsoft 365 views,
  including a naturally occurring Teams meeting.

Exit gate: the current schedule materially matches New Outlook, or Graph/tenant
behavior is proven unsuitable.

### Phase 3: refresh, recovery, and decision

- Prove silent refresh after token expiry/cache reuse where practical.
- Prove restart recovery, sign-out, revoked consent, offline/network errors, and
  one add/edit/remove cycle through complete refresh.
- Measure sidecar size, startup latency, runtime dependencies, and packaging
  impact.
- Decide whether to retain the sidecar, change desktop technology, use another
  supported MSAL host, or stop calendar support.

No webhooks, delta queries, polling policy, background scheduling, or product UI
is added in this milestone.

## Acceptance criteria

- [ ] Only delegated `Calendars.ReadBasic` is requested.
- [x] No client secret, backend, write/application permission, or email hardcode in the Phase 0 helper/protocol.
- [ ] WAM UI is explicit and parented to Attention Hub.
- [x] Phase 0 emits no tokens or raw Graph responses through stdout, Rust IPC, or logs.
- [x] Phase 0 React receives only an application-owned environment report.
- [ ] Meeting URLs are omitted even when embedded in `location`.
- [ ] A complete seven-day snapshot matches the current work calendar, or an
      explicit provider/tenant blocker is recorded.
- [ ] A naturally occurring Teams meeting is represented without fetching its
      join URL, attendees, or body.
- [ ] Restart, silent acquisition, sign-out, denial, offline, and revocation
      behavior are recorded.
- [ ] Sidecar/runtime/packaging cost is measured before architecture acceptance.

## Main risks

| Risk | Spike response |
| --- | --- |
| Tenant disables app registration or user consent. | Record the exact policy error; do not broaden permissions. |
| WAM requires correct app registration and parent HWND. | Validate both before Graph work; surface sanitized broker diagnostics. |
| A .NET sidecar is disproportionate for a small Tauri app. | Measure binary, runtime, build, startup, and packaging cost and allow a technology reconsideration. |
| Token or PII leakage through process diagnostics. | Helper emits bounded normalized JSON only; Rust rejects oversized/malformed output and never logs payloads. |
| `location` or another basic field contains meeting links. | Redact URL-like values in the helper and again in Rust. |
| Basic permission omits a field needed for attention semantics. | Record the limitation; do not escalate permission without a new decision. |
| Corporate conditional access blocks the helper. | Treat the exact WAM/Graph result as a valid negative outcome. |
| Account selection chooses a personal or stale account. | Require explicit selection/diagnostics without serializing the account email. |

## Final findings

Phase 0 confirms that the proposed process boundary is technically viable. The
published helper executable is discovered from a bounded development path, uses
a one-request/one-response JSON protocol, and reports only configuration
booleans and component versions. Rust enforces a five-second process timeout and
64 KiB output limit. The helper currently implements only `environment`; WAM and
Graph are not contacted.

Phase 1 is paused before registration or consent because the selected work
account belongs to an organization-owned tenant. The alternative ADR 0007
companion observer was useful only while its flyout was visible and therefore
failed Attention Hub's passive-background requirement. Resume this milestone
only with explicit organization approval; otherwise its current outcome is a
safe, unconfigured proof of the helper boundary, not an active calendar
provider.

## Official references

- Microsoft: [Using MSAL.NET with Web Account Manager](https://learn.microsoft.com/en-us/entra/msal/dotnet/acquiring-tokens/desktop-mobile/wam)
- Microsoft: [Configure desktop apps that call web APIs](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-configuration)
- Microsoft Graph: [List calendarView](https://learn.microsoft.com/en-us/graph/api/user-list-calendarview?view=graph-rest-1.0)
- Microsoft Graph: [Permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference)
