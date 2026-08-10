# Milestone 2 evidence: Graph helper environment boundary

- Date: 2026-08-10
- Windows build: 26220.9022 (25H2)
- Tauri launch: self-contained ordinary unpackaged executable
- Helper: framework-dependent single-file .NET 8 Windows executable
- Operation: `environment`

## Observed result

- Environment status: `notConfigured`
- Helper available: `true`
- Windows/WAM supported: `true`
- Client ID configured: `false`
- Tenant ID configured: `false`
- .NET runtime: 8.0.29
- MSAL.NET: 4.87.0.0
- WAM broker package: 4.87.0.0
- Authentication prompt: none
- Microsoft Graph request: none

The helper was invoked by Rust through the versioned JSON protocol and the
normalized result rendered in React. Rust tests cover the absence of account or
token fields in the request and rejection of oversized helper output. The live
adapter also applies a five-second timeout and 64 KiB stream limit.

No client ID, tenant ID, email address, account identifier, token, claim,
authorization code, calendar data, or event data is recorded in this evidence.
