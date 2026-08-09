# Milestone 0 evidence: unpackaged Phases 0-2

## Run context

- Date/time: 2026-08-09, Europe/Kyiv (UTC+03:00).
- Windows: client build 26220.9022, version 25H2, x64.
- Attention Hub base revision: `41b8f62` plus the uncommitted Milestone 0 implementation.
- Launch mode: ordinary unpackaged `pnpm tauri dev`.
- Package identity: absent; `Package::Current` returned HRESULT `0x80073D54`.
- Sensitive notification bodies were neither logged nor committed.

## Observations

| Case | Expected | Actual | Result |
| --- | --- | --- | --- |
| Phase 0 launch | Minimal native Tauri window launches. | `target/debug/attention-hub.exe` launched and remained responsive. | Pass |
| API availability | Listener runtime type can be detected. | `UserNotificationListener` reported available. | Pass |
| Existing access | Status is represented without crashing. | Status was already `Allowed`; first-run prompt behavior was therefore not captured. | Pass with limitation |
| Repeated access request | Exact result is visible. | Explicit UI requests returned `Allowed`. | Pass |
| Package identity | Exact unpackaged behavior is recorded. | No package identity, but listener access still worked. | Pass; earlier assumption invalidated |
| Current snapshot | At least one notification crosses the full boundary. | Five current notifications crossed Windows -> Rust adapter -> normalized DTO -> Tauri IPC -> React debug table. | Pass |
| Normalization tests | Missing/empty/multiple text shapes and missing/conversion-error fields are stable. | Five Rust unit tests passed for missing, empty, multi-line, absent source identity, and isolated conversion diagnostics. | Pass |
| Foreground event subscription | Add/remove events can invalidate the frontend. | Registration returned `0x80070490` on the Tauri UI thread. An explicitly initialized MTA worker returned the same result. | Fail unpackaged |
| Snapshot recovery without event | Manual/restart snapshot still converges. | A later snapshot contained six entries instead of five, while listener registration remained failed. | Pass for snapshot recovery |
| Sparse identity package | One identity-enabled route can be built without breaking ordinary test binaries. | The opt-in package-with-external-location variant built, signed, and registered as `AttentionHub.Dev_0.1.0.0_neutral__71pqjrj923s6p`. Current User `TrustedPeople` was insufficient (`0x800B0109`); registration succeeded after explicit Local Machine `TrustedPeople` trust. | Pass; live listener pending |
| Identity listener registration | The registered identity can subscribe to foreground changes. | Access was `Allowed`; `NotificationChanged` registered active with no diagnostics, and the initial snapshot contained seven entries. | Pass; add/remove event pending |

## Commands validated

- `cargo check`
- `cargo test`
- `pnpm build`
- interactive `pnpm tauri dev`

## Still pending

- First-run Allow/Deny and revocation behavior.
- Identity-enabled foreground add/remove event and snapshot convergence evidence.
- Frontend reload and sleep/resume behavior.
- Teams, Outlook, and Telegram three-cycle matrix with versions and redacted field-quality notes.
