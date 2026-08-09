# ADR 0002: Treat Windows package identity as a spike variable

- Status: Accepted for investigation
- Date: 2026-08-09

## Context

Microsoft documents a package-manifest capability for `UserNotificationListener`. Tauri's standard Windows distribution path produces MSI or NSIS installers around a Win32 application, and must not be assumed to grant MSIX package identity.

## Decision

Milestone 0 will test ordinary unpackaged Tauri behavior first and record the exact result. If identity is required, it will validate one minimal supported development identity route—preferably package identity with external location or a full MSIX experiment—before expanding the native implementation.

No production packaging approach is selected yet. If reliable access requires disproportionate manifest, signing, registration, helper-host, or installer complexity, changing the native boundary or desktop technology remains a valid result.

## Consequences

- Packaging feasibility is an early exit gate rather than late release work.
- Development and production-like launch behavior may differ and must be tested separately.
- The spike may end with a negative recommendation even if React/Tauri scaffolding is otherwise successful.
- Installer, signing, and updater productionization remain out of scope.
