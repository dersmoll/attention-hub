# Milestone 0: Windows notification spike

## Status

Planning complete; Phase 0 toolchain verification is substantially complete. Native notification integration has not started.

## Purpose

Prove or disprove this assumption:

> A Tauri-based Windows desktop application can reliably obtain useful current Windows notification state and expose it to a React frontend.

The outcome is evidence and a technology decision, not a production interface.

## Current scaffold and environment status

Inspected on 2026-08-09:

- The project was scaffolded with the official `create-tauri-app` React + TypeScript template and then reduced to a minimal Attention Hub shell.
- Frontend dependencies are installed and `pnpm build` passes.
- Tauri CLI 2.11.4 and `@tauri-apps/api` 2.11.1 are resolved in the current lockfile.
- Tauri diagnostics report Windows build 26220 x64 and WebView2 152.0.4191.10.
- Rust 1.97.1, Cargo 1.97.1, and the stable `x86_64-pc-windows-msvc` toolchain are installed. The current long-lived shell predates installation, so `%USERPROFILE%\.cargo\bin` must be added to `PATH` in that shell or the shell must be restarted.
- Visual Studio Build Tools 18 with MSVC 14.51.36231 and Windows SDK 10.0.26100.0 are installed.
- `cargo check` and `pnpm tauri build --no-bundle` pass for the minimal Tauri shell, producing `src-tauri/target/release/attention-hub.exe`. A complete interactive `tauri dev` launch is still outstanding.
- No Windows notification integration, listener capability manifest, or identity package has been added.

## Scope

- Request and report notification-listener access.
- Retrieve the current Windows toast/app-notification snapshot.
- Normalize source identity, timestamp, title, body, notification ID, and diagnostic metadata in Rust.
- Expose normalized data through Tauri IPC.
- Detect notification add/remove changes while the app runs.
- Refresh the complete snapshot after a change.
- Display state in a deliberately plain React debug UI.
- Manually test Microsoft Teams, Microsoft Outlook, and Telegram.
- Compare development and identity/packaging paths needed for the API.
- Record observed behavior and complete the findings section.

## Non-scope

- Production UI or design system.
- Calendar integration.
- Notification history or a database.
- Settings, source filters, themes, tray, autostart, global shortcuts, privacy mode, application launching/focusing, installer/updater productionization, cloud features, analytics, or telemetry.
- Mutating, dismissing, or clearing notifications from Attention Hub.
- Generalized provider abstractions.

## Technical questions

1. Does `UserNotificationListener` function at all from a normal unpackaged Tauri development executable?
2. If not, which minimal package-identity approach works with Tauri: full MSIX, package with external location, or another supported route?
3. Can the `userNotificationListener` capability be declared for that route and registered repeatably on a developer machine?
4. Can `RequestAccessAsync` be invoked on an appropriate UI thread from the Tauri lifecycle?
5. How does permission denial, later revocation, and repeated access requesting behave?
6. Does `GetNotificationsAsync(NotificationKinds.Toast)` return useful current entries for Teams, Outlook, and Telegram?
7. Which source identifiers are stable and available: display name, application user model ID, package family name, or another value?
8. How consistently do the three target applications populate generic toast text elements, title, body, and creation time?
9. Does `NotificationChanged` report both additions and removals reliably while foregrounded, minimized, and after sleep/resume?
10. What happens when a toast is dismissed from the popup, removed from Notification Center, expires, is replaced, or is cleared by its source app?
11. Are notification IDs unique only within a source/app/user scope, and are they reused?
12. Can snapshot refresh recover cleanly after frontend reload, listener interruption, or missed events?
13. Is the required Tauri/Windows packaging complexity proportionate to the product value?
14. What is the smallest correct integration for the UI-thread permission operation, WinRT async completion, and long-lived `NotificationChanged` subscription within Tauri's event loop/runtime?

## Implementation phases

### Phase 0: toolchain and baseline

- Install/verify the current Rust MSVC toolchain, Microsoft C++ Build Tools Desktop development workload, Windows SDK, Node/pnpm, and WebView2.
- Run `pnpm build`, `cargo check`, and `pnpm tauri dev` without notification code.
- Record Windows build, tool versions, and baseline launch result.

Exit gate: the unmodified minimal Tauri shell launches locally.

### Phase 1: packaging and permission feasibility

- Add the smallest Windows-only `windows` crate feature set required by the listener.
- Add a diagnostic command for API availability/access status.
- Attempt access from ordinary `tauri dev` and record the exact result.
- Create the minimum development identity/manifest experiment declaring `uap3:userNotificationListener` if required.
- Invoke `RequestAccessAsync` from a user action on the appropriate UI thread.
- Prove how the WinRT async operation completes without blocking the Tauri UI/event loop. Do not introduce a dedicated OS thread or channel bridge unless this direct experiment demonstrates the need.
- Record permission prompt, allow, deny, repeat, and revocation behavior.

Exit gate: either one repeatable development launch path reaches `Allowed`, or the milestone records a reproducible blocker and stops before unnecessary UI work.

Exploration bound: test the ordinary unpackaged path and one supported identity-enabled path. Do not add a second packaging architecture, helper process, UI Automation fallback, or account-specific API without first updating this plan and reviewing the new scope.

### Phase 2: normalized snapshot

- Implement a Windows-only adapter that reads toast notifications.
- Extract source metadata, creation time, ID, generic binding text elements, and parsing diagnostics.
- Map immediately to serializable application-owned Rust DTOs.
- Keep extraction and normalization separable, and unit-test the pure mapping with synthetic missing/empty/multi-line/error cases.
- Expose a snapshot command and render the result in the React debug UI.
- Keep malformed entries isolated so the rest of the snapshot remains visible.

Exit gate: at least one real notification crosses the complete Windows -> Rust -> Tauri -> React path.

### Phase 3: live invalidation and recovery

- Subscribe to `NotificationChanged` for the Tauri application lifetime.
- Emit a small invalidation event on added/removed changes.
- If clear-all or other behavior produces problematic bursts, coalesce invalidations in Rust before emitting; do not add React-owned debounce state by default.
- Have React request a complete fresh snapshot on each invalidation.
- Verify listener cleanup and React unsubscribe behavior.
- Test frontend reload and application restart recovery from a complete snapshot.

Exit gate: the visible debug state changes without restarting Attention Hub and converges to the current Windows snapshot.

### Phase 4: application matrix and behavior study

- Run the manual cases below for Teams, Outlook, and Telegram.
- Capture observed source IDs, text shapes, timestamp behavior, duplicate/replacement behavior, and removal latency.
- Repeat meaningful cases with the Attention Hub window foregrounded, backgrounded/minimized, and after sleep/resume.
- Record the exact application version and installation/package source for each target application.
- Run at least three add/remove cycles per target application and record success count plus observed convergence latency; this is a small-spike consistency check, not a production reliability claim.
- Record differences between unpackaged and identity-enabled runs.

Exit gate: the evidence is sufficient to judge usefulness and reliability for all three target applications, including explicit failures.

### Phase 5: findings and decision

- Complete the findings section.
- Update architecture assumptions invalidated by implementation.
- Recommend continue, continue with constraints, change desktop/native boundary, or stop.
- List any scope proposed for Milestone 1 separately; do not implement it here.
- If the technical result is positive, use the debug build during an agreed daily-use observation period (default: one normal work week) before planning Milestone 1. Record whether displayed notification state actually correlated with work that needed attention.

## Acceptance criteria

- [ ] A documented, repeatable local launch method reaches the notification API or a reproducible platform blocker is demonstrated.
- [ ] Access status is visible as unspecified, allowed, denied, unsupported, or error.
- [ ] Permission is requested from an explicit debug-UI action and the result is shown.
- [ ] The current snapshot can be requested at any time.
- [ ] React receives no WinRT/Windows-specific objects.
- [ ] Each visible row shows notification ID, source, timestamp, title, body/raw text, and parsing diagnostics where available.
- [ ] Additions and removals update the frontend without application restart.
- [ ] A complete refresh recovers after frontend reload and does not rely solely on past incremental events.
- [ ] Teams, Outlook, and Telegram each have documented observed results.
- [ ] Each target application completes at least three recorded add/remove cycles, with success count and convergence latency captured.
- [ ] Permission denial/revocation and malformed or missing text do not crash the application.
- [ ] Pure normalization tests cover missing source identity, empty/missing text, multiple text elements, and isolated conversion failure.
- [ ] The complete manual matrix produces zero Attention Hub crashes; any API or parsing failure is represented as data/diagnostics.
- [ ] No notification is cleared, dismissed, or mutated by the spike.
- [ ] No network backend, telemetry, account credential, database, or out-of-scope product feature is introduced.
- [ ] Findings explicitly assess Tauri plus the required identity/packaging complexity.

## Manual test cases

Run each case with timestamps and screenshots/notes sufficient to reproduce the observation. Do not record sensitive message content in committed fixtures; redact evidence when necessary.

For every execution, record: case ID, date/time and timezone, Windows build, Attention Hub revision, launch/identity mode, source application name/version/package source, expected result, actual result, convergence latency when applicable, and pass/fail/blocked status. Store redacted notes under `docs/milestones/evidence/m0/` during the spike. Do not commit raw notification bodies or screenshots containing private content by default.

Use synthetic unit-test inputs for malformed and missing payload shapes. If real applications cannot exercise replacement/burst cases deterministically, a dependency-free developer-only local-toast stimulus may be added after Phase 2 using official Windows notification APIs; document its identity and limitations, and do not add BurntToast or another third-party notification dependency merely for the harness.

| ID | Case | Expected observation |
| --- | --- | --- |
| P1 | First access request, choose Allow | Status becomes allowed; snapshot request is enabled. |
| P2 | First access request, choose Deny | Status becomes denied; app remains usable and explains the state. |
| P3 | Re-run after a previous decision | Actual prompt/status behavior is recorded. |
| P4 | Revoke permission in Windows settings while running | Revocation detection/error and recovery behavior are recorded. |
| S1 | Launch with existing Notification Center entries | Debug UI shows the current snapshot without waiting for a new event. |
| S2 | Reload the frontend | A fresh snapshot restores current state. |
| S3 | Restart Attention Hub | Current notifications reappear without local history. |
| C1 | Receive one Teams notification | Source, timestamp, title/body shape, ID, and add timing are recorded. |
| C2 | Receive one Outlook notification | Same fields and timing are recorded. |
| C3 | Receive one Telegram notification | Same fields and timing are recorded. |
| C4 | Receive multiple notifications from one source | Count, IDs, order, and grouping assumptions are recorded. |
| C5 | Receive notifications from all three sources | Snapshot remains complete and source identities remain distinguishable. |
| R1 | Dismiss a toast popup | Whether/when the entry disappears is recorded. |
| R2 | Remove an entry from Notification Center | A remove signal and converged snapshot are expected; actual latency is recorded. |
| R3 | Use “clear all” in Notification Center | All removal behavior and event burst characteristics are recorded. |
| R4 | Source app replaces/updates a notification | ID reuse, event kind, and final snapshot are recorded. |
| L1 | Minimize/background Attention Hub, then receive/remove | Listener behavior while not foregrounded is recorded. |
| L2 | Sleep/resume, then receive/remove | Listener continuity and snapshot recovery are recorded. |
| E1 | Notification lacks generic binding or text | Other entries still render; diagnostics show missing data. |
| E2 | Start without required package identity/capability | Exact API/status/error behavior is recorded, not hidden. |

## Known risks and assumptions

| Risk / assumption | Impact | Spike response |
| --- | --- | --- |
| Package identity is required and standard Tauri MSI/NSIS output does not provide it by itself. | High: normal development and distribution may not access the listener. | Test unpackaged first, then one minimal supported identity route; measure signing/registration cost. |
| The capability declaration may impose packaging, Windows-version, or deployment constraints. | High. | Validate on the actual developer machine and record the exact manifest/package requirements. |
| `RequestAccessAsync` must run on a UI thread. | High: an incorrect Tauri thread call can fail or hang. | Make permission a user-initiated command and prove the thread/apartment path before other native work. |
| Notification content is producer-defined and may be incomplete or privacy-redacted. | High for product usefulness. | Preserve raw text-element evidence and nullable normalized fields; test all three apps. |
| A notification is not necessarily equivalent to unread state. | High for the product premise. | Compare notification lifecycle with the actual source application state; do not label counts “unread” in the spike. |
| Notification change events may be missed or bursty. | Medium. | Treat them as invalidation signals and always recover through a complete snapshot. |
| IDs may not be globally stable or durable. | Medium. | Use IDs only as diagnostic/current-snapshot metadata until observed semantics are known. |
| Permission can be denied or revoked. | Medium. | Model access explicitly and keep errors non-fatal. |
| Sleep/resume and application lifecycle may invalidate subscriptions. | Medium. | Test lifecycle cases and reinitialize/re-snapshot if evidence requires it. |
| WinRT UI-thread permission, async completion, COM apartment rules, and event-subscription lifetime may not align cleanly with Tauri's event loop/runtime. | High: incorrect integration can hang, fail with apartment/thread errors, or silently lose events. | Prove the smallest direct integration in Phases 1 and 3. Add a dedicated thread/channel only when observed behavior requires it; add no async runtime speculatively. |
| If `UserNotificationListener` is not viable, Windows exposes no equivalent official API that directly answers attention state across arbitrary apps within the current privacy/scope constraints. | High for the product premise. | Record a stop/reconsider outcome rather than silently pivoting to UI Automation, taskbar scraping, calendar, or credentialed app APIs. |

## Evidence known before implementation

- Microsoft documents that the listener needs the `userNotificationListener` manifest capability and explicit permission, and that access must be requested on a UI thread.
- Microsoft marks `UserNotificationListener` as MTA and agile; this informs but does not pre-decide the Tauri threading implementation.
- The API exposes current toast notifications, source `AppInfo`, creation time, ID, and notification content.
- Change events distinguish only added and removed notifications and provide a notification ID; this supports using events as invalidation signals rather than treating them as a complete state feed.
- The API was introduced with Windows 10 Anniversary Edition (build 14393), while Microsoft's current package-with-external-location guidance uses build 19041 as its minimum for that packaging technique.
- Tauri documents MSI and NSIS as its standard Windows installers. Its standard flow does not document generating an MSIX identity package with custom capability declarations.
- Microsoft's current Rust bindings expose the required listener methods and event subscription surface.

## Final findings

Complete this section after the spike. Do not infer success from compilation alone.

### Environment tested

Pending.

### Packaging and identity result

Pending.

### Permission behavior

Pending.

### Snapshot quality by application

| Application | Source identity | Title/body quality | Timestamp/ID behavior | Notes |
| --- | --- | --- | --- | --- |
| Microsoft Teams | Pending | Pending | Pending | Pending |
| Microsoft Outlook | Pending | Pending | Pending | Pending |
| Telegram | Pending | Pending | Pending | Pending |

### Change and removal behavior

Pending.

### Reliability and recovery

Pending.

### Complexity assessment

Pending.

### Decision

Pending: continue / continue with constraints / change native boundary or desktop technology / stop.

### Follow-up work

Pending. Any proposed next milestone must be reviewed before implementation.

## References

- Microsoft: [Notification listener](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/notification-listener)
- Microsoft: [`UserNotificationListener.RequestAccessAsync`](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.management.usernotificationlistener.requestaccessasync)
- Microsoft: [`UserNotification` fields](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.usernotification)
- Microsoft: [`UserNotificationChangedKind`](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.usernotificationchangedkind)
- Microsoft: [`NotificationBinding.GetTextElements`](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.notificationbinding.gettextelements)
- Microsoft: [App capability declarations](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/app-capability-declarations)
- Microsoft: [`uap3:Capability`](https://learn.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/element-uap3-capability)
- Microsoft: [Package identity with external location](https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/grant-identity-to-nonpackaged-apps)
- Microsoft: [`windows` crate listener binding](https://microsoft.github.io/windows-docs-rs/doc/windows/UI/Notifications/Management/struct.UserNotificationListener.html)
- Tauri: [Prerequisites](https://v2.tauri.app/start/prerequisites/)
- Tauri: [Calling Rust from the frontend](https://v2.tauri.app/develop/calling-rust/)
- Tauri: [Calling the frontend from Rust](https://v2.tauri.app/develop/calling-frontend/)
- Tauri: [Content Security Policy](https://v2.tauri.app/security/csp/)
- Tauri: [Windows installers](https://v2.tauri.app/distribute/windows-installer/)
