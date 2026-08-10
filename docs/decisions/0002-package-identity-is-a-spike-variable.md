# ADR 0002: Treat Windows package identity as a spike variable

- Status: Accepted; unpackaged path provisionally viable
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

## Implementation finding

On 2026-08-09, Windows build 26220.9022 allowed the unpackaged Tauri development executable to use `UserNotificationListener` even though `Package::Current` returned `0x80073D54` because the process had no package identity. Access status and `RequestAccessAsync` returned `Allowed`, and a five-item current snapshot succeeded.

The unpackaged `NotificationChanged` subscription subsequently failed with `0x80070490` from both the UI thread and an explicitly initialized MTA worker. A single sparse identity/capability route was therefore tested for the live-update requirement. Identity-bearing executable metadata is opt-in through `ATTENTION_HUB_DEV_IDENTITY=1`, preserving ordinary unpackaged development and test binaries. The identity package builds, signs, and registers after explicit Local Machine `TrustedPeople` certificate trust; Current User trust alone failed with `0x800B0109` on this machine. Under the registered identity, the same listener registration succeeds with no diagnostics. Identity is therefore a demonstrated development/runtime requirement for foreground events on this machine and remains a release/distribution compatibility variable until broader validation is complete.
