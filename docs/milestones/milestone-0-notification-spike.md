# Milestone 0: Windows notification spike

## Status

Completed with a **continue with constraints** decision. The notification vertical slice is technically proven, including one live add/remove cycle under sparse identity, but Telegram unread/taskbar state is not present in the toast snapshot and requiring more Notification Center traffic conflicts with the intended quiet product. The source-owned Windows/window/UI Automation slice works end to end in ordinary unpackaged Tauri: Telegram and New Outlook expose useful numeric state, while Teams exposes a proven qualitative state. The bounded Teams exact-count experiment reached its negative stop condition and its temporary diagnostic implementation was removed. Unrun denial/revocation, sleep/resume, and long-duration matrix cases remain documented limitations rather than blockers to the architecture decision. The development identity/certificate is retained temporarily for the planned Windows appointment-store spike and must be reassessed afterward.

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
- `cargo check`, `cargo test`, `pnpm build`, and the earlier `pnpm tauri build --no-bundle` baseline pass. Interactive `tauri dev` launches the native application successfully.
- The Windows-only adapter now reports API/access/identity state, requests access from Tauri's main thread, reads and normalizes the current toast snapshot, and exposes only application-owned DTOs to React.
- On Windows build 26220.9022, ordinary unpackaged `tauri dev` reports no package identity (`0x80073D54`) while `UserNotificationListener` is available and access is `Allowed`.
- `RequestAccessAsync`, started on Tauri's main thread and completed on Tauri's blocking pool, returned `Allowed` without adding a capability manifest or identity package.
- `GetNotificationsAsync(NotificationKinds.Toast)` returned five current notifications through the full Windows -> Rust -> Tauri -> React path. Notification content was not written to logs or committed evidence.
- The native `NotificationChanged` subscription and React invalidation listener are implemented, but unpackaged subscription currently fails with HRESULT `0x80070490` (“Element not found”). Repeating subscription from an explicitly initialized MTA produced the same result, ruling out the initial UI-apartment hypothesis.
- A sparse package-with-external-location manifest containing `uap3:userNotificationListener`, matching executable `msix` identity metadata, and repeatable development install/uninstall scripts have been added. The identity package builds, signs, and registers after explicit approval to trust its public development certificate in Local Machine `TrustedPeople`; Current User trust alone failed with `0x800B0109` on this machine.
- Identity metadata is opt-in through `ATTENTION_HUB_DEV_IDENTITY=1`. `install-dev-identity.ps1` builds and registers that variant, while `run-dev-with-identity.ps1` launches it; normal Cargo/Tauri commands remain unpackaged and testable.
- The registered identity run reports package identity present, access `Allowed`, a seven-item snapshot, and `NotificationChanged` listener active with no diagnostics.
- A Snipping Tool notification completed one real foreground add/remove cycle: it appeared immediately in the React snapshot and disappeared when dismissed from Windows Notification Center.
- Telegram Desktop 7.0.9 displayed nonzero unread/taskbar badges but had no corresponding current Windows toast. This directly confirms that `UserNotificationListener` does not expose Telegram's application-owned unread state.
- The first dependency-free read-only attention-signal probe returned Telegram application counter 20, Telegram unread chats 9, Teams `New activity`, and Outlook `No unread messages`/0 without creating notifications or controlling the source applications.
- Telegram's title-derived application counter advanced from 20 to 26 while the user independently observed 25 on the rendered taskbar badge immediately beforehand, confirming the signal tracks the badge with a timing race while new messages arrive.
- The source-specific attention adapter now crosses Windows/window/UI Automation -> Rust DTO -> Tauri command -> React debug UI in ordinary unpackaged development mode. After one recorded transient startup error, 15 consecutive complete refreshes returned four signals with no diagnostics.
- Telegram's counter correctly disappeared after the user read all messages, validating its zero transition. Teams' visible taskbar `1` was not present in taskbar or application accessibility properties, while its `New activity` boolean remained accurate. New Outlook's tray `No unread messages` label contradicted a real unread Inbox and was replaced by an app-owned Inbox accessibility count that correctly returned 1.

## Scope

- Request and report notification-listener access.
- Retrieve the current Windows toast/app-notification snapshot.
- Normalize source identity, timestamp, title, body, notification ID, and diagnostic metadata in Rust.
- Expose normalized data through Tauri IPC.
- Detect notification add/remove changes while the app runs.
- Refresh the complete snapshot after a change.
- Evaluate read-only taskbar/tray/window accessibility signals for Telegram, Teams, and Outlook without requiring new toasts.
- Normalize only observed attention status/count plus source, signal origin, raw diagnostic label, and confidence/limitations.
- Display state in a deliberately plain React debug UI.
- Run one manual, sanitized Teams accessibility diagnostic for exact-count feasibility without changing the proven qualitative signal.
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
- OCR/screenshot parsing of taskbar badges, undocumented Explorer internals, and controlling source-application UI during the initial attention-signal feasibility phase.
- Teams profile/database reads, WebView2 remote debugging, Microsoft Graph authentication, or persistence of Teams accessibility text.

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
15. Can a numeric or qualitative attention signal be read from Telegram, Teams, and Outlook window/tray/accessibility state without generating toasts or using credentials?
16. Do those signals update while applications are minimized, and can changes be detected without high-frequency polling?
17. Are the exposed labels stable enough across application versions, account states, and UI languages to justify source-specific observers?
18. Is exact count required for every source, or is a trustworthy `needs attention` state sufficient when an application exposes no count?

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

### Phase 4: persistent attention-signal feasibility

- Confirm whether Windows exposes a supported cross-application taskbar badge getter; record absence rather than inferring from rendered pixels.
- Probe taskbar/tray UI Automation names, top-level window titles, and source-application accessibility labels for exactly Telegram, Teams, and Outlook.
- Start with snapshot acquisition. Add event hooks or bounded low-frequency refresh only after a useful signal is demonstrated.
- Keep source-specific extraction explicit and small; do not build a generalized provider framework.
- Do not enable notifications, capture taskbar screenshots, OCR pixels, or interact with source application UI in this phase.
- Record app-running/minimized/closed behavior, localization dependence, semantic meaning, and discrepancies between visible counts and accessible values.

Exit gate: at least one useful persistent signal crosses a read-only Windows probe -> normalized model -> Tauri -> React path, and limitations for all three target applications are explicit.

### Phase 4b: bounded Teams exact-count accessibility experiment

- Keep the existing Teams notification-area `New activity` boolean unchanged.
- Add a separate manual command; do not place the deeper Teams traversal in the two-second attention-snapshot loop.
- Inspect Teams-owned `AriaProperties`, control type, offscreen state, bounds, and availability of relevant UI Automation patterns in addition to the already-inspected `Name`, `HelpText`, and `ItemStatus` properties.
- Inspect known structural areas such as Quick views, collapsed sections, and materialized Chat rows without focusing, scrolling, expanding, selecting, or clicking anything.
- Analyze text only transiently in Rust. Return fixed keyword matches, numeric tokens, ARIA keys, lengths, geometry, and pattern names; never return or log raw Teams text, chat names, senders, previews, bodies, or ARIA values.
- Compare controlled badge states 0, 1, and 2 or more with Chat visible, another page visible, Teams minimized, and a contributing unread row offscreen where practical.
- Use the semantic name `badgeItems` or a narrower truthful subset name. Do not call the result unread messages: Microsoft documents that the badge combines several item categories.

Prior evidence: with a visible taskbar badge of `1` while Teams showed Calendar, the full taskbar and Teams descendant scan found no matching number in `Name`, `HelpText`, or `ItemStatus`. This phase tests only the remaining ARIA, pattern, and materialized-content hypothesis.

First controlled-comparison finding on 2026-08-10: the existing qualitative Teams signal correctly changed from false at badge zero to true at badge one. The two screenshots contained the same manual-probe capture timestamp, so they do not yet compare deeper accessibility snapshots. A numeric `1` associated with `activity` was already present at badge zero and matched Teams' permanent `Activity (Ctrl+1)` shortcut shape; shortcut-adjacent digits are now excluded from candidates. See `docs/milestones/evidence/m0/2026-08-10-teams-badge-probe.md`.

Final experiment finding: at a naturally occurring visible badge of `2`, a fresh scan of one Teams window/31 elements returned six structural ARIA candidates and no numeric token. Opening Activity cleared both visible Activity and Chat indicators, preventing isolation of the expected intermediate `1` state. A fresh zero-state scan traversed 438 elements, showed qualitative activity structure without a useful count, and the implemented Teams signal returned to false. The exact-count path therefore stopped and the temporary diagnostic code was removed.

Exit gate: either an exact number is derived in at least three controlled states and remains available without keeping Chat visible, or the experiment records a negative/partial result and stops. OCR and credentialed Microsoft Graph access remain separate, unapproved decisions.

### Phase 5: application matrix and behavior study

- Run the source-owned transition cases below for Teams, Outlook, and Telegram.
- Capture observed source IDs, text shapes, timestamp behavior, duplicate/replacement behavior, and removal latency.
- Repeat meaningful cases with the Attention Hub window foregrounded, backgrounded/minimized, and after sleep/resume.
- Record the exact application version and installation/package source for each target application.
- Run at least three attention-state transitions per target application where the application exposes a useful signal, and record success count plus observed convergence latency; this is a small-spike consistency check, not a production reliability claim.
- Record differences between unpackaged and identity-enabled runs.

Do not generate additional toasts solely to satisfy the original notification
matrix. The notification-center vertical slice is already proven; further tests
must exercise source-owned attention state or answer a remaining reliability
question.

Exit gate: the evidence is sufficient to judge usefulness and reliability for all three target applications, including explicit failures.

### Phase 6: findings and decision

- Complete the findings section.
- Update architecture assumptions invalidated by implementation.
- Recommend continue, continue with constraints, change desktop/native boundary, or stop.
- List any scope proposed for Milestone 1 separately; do not implement it here.
- If the technical result is positive, use the debug build during an agreed daily-use observation period (default: one normal work week) before planning Milestone 1. Record whether displayed notification state actually correlated with work that needed attention.

## Acceptance criteria

- [x] A documented, repeatable local launch method reaches the notification API or a reproducible platform blocker is demonstrated.
- [x] Access status is visible as unspecified, allowed, denied, unsupported, or error.
- [x] Permission is requested from an explicit debug-UI action and the result is shown.
- [x] The current snapshot can be requested at any time.
- [x] React receives no WinRT/Windows-specific objects.
- [x] Each visible row shows notification ID, source, timestamp, title, body/raw text, and parsing diagnostics where available.
- [x] Additions and removals update the notification frontend without application restart.
- [x] A complete refresh recovers after application restart and does not rely solely on past incremental events.
- [x] Teams, Outlook, and Telegram each have a documented initial source-owned signal result.
- [ ] Each target application with a useful source-owned signal completes at least three recorded transitions, with success count and convergence latency captured.
- [ ] Permission denial/revocation and malformed or missing text do not crash the application.
- [x] Pure normalization tests cover missing source identity, empty/missing text, multiple text elements, and isolated conversion failure.
- [ ] The complete manual matrix produces zero Attention Hub crashes; any API or parsing failure is represented as data/diagnostics.
- [x] No notification is cleared, dismissed, or mutated by Attention Hub.
- [x] No network backend, telemetry, account credential, database, or out-of-scope product feature is introduced.
- [ ] Findings explicitly assess Tauri plus the required identity/packaging complexity.
- [x] No additional toast is required to make a source's persistent attention state visible.
- [x] Telegram, Teams, and Outlook each have a documented taskbar/tray/window signal result, including exact count or qualitative state.
- [x] The attention-signal probe never focuses, clicks, types into, or otherwise controls a source application.
- [x] The manual Teams accessibility diagnostic emitted no raw Teams text or account/content identifiers and never ran from the automatic polling path; it was removed after the experiment.
- [x] The Teams badge experiment recorded fresh 0 and 2-or-more results and recorded that opening Activity cleared both indicators before an intermediate 1 state could be isolated.

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
| C1 | Cause and clear one Teams attention state | Accessible qualitative/count state and convergence timing are recorded; no extra toast is required by Attention Hub. |
| C1a | With Teams Chat visible, compare manual sanitized probe output at badge 0, 1, and 2 or more | Any candidate number changes with the visible badge without exposing raw content. |
| C1b | Repeat a nonzero Teams badge with another page visible and with Teams minimized | A viable app-level count remains discoverable; a visible-only result is recorded as partial/failed. |
| C1c | Where practical, leave a contributing unread chat outside the materialized/visible rows | Virtualization dependence and any undercount are recorded. |
| C2 | Cause and clear one Outlook unread state | Accessible qualitative/count state and convergence timing are recorded; no extra toast is required by Attention Hub. |
| C3 | Cause and clear one Telegram attention state | Title counter, unread-chat count, badge comparison, and convergence timing are recorded. |
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
| Windows exposes setters but no supported getter for another application's numeric taskbar badge/overlay. | High for exact-count requirements. | Observe source-owned title/accessibility state upstream of the rendered badge; do not claim a generic taskbar-count API exists. |
| UI Automation state is application-defined, version-sensitive, and localized. | High for reliability and maintenance. | Bound the experiment to three named applications, preserve raw labels/diagnostics, and require explicit per-source evidence before implementation is retained. |
| A useful qualitative state may exist without an exact count. | Medium product decision. | Report exact and qualitative capabilities separately; do not invent a number from `New activity` or similar labels. |
| Teams' visible badge combines multiple item categories and is not an unread-message count. | High semantic risk. | Name an exact result `badgeItems` or use a narrower truthful subset name; validate against controlled states. |
| Deeper Teams accessibility traversal can encounter private chat names or previews. | High privacy risk. | Analyze values transiently in Rust and expose only fixed keyword hits, numbers, ARIA keys, lengths, geometry, and pattern names. Never return or log raw Teams text. |
| Teams virtualizes pages and rows, so a UI-derived count may exist only while Chat is visible. | High reliability risk. | Test another page, minimized state, and an offscreen contributing unread row; reject visible-only totals as an app-level badge source. |

## Evidence known before implementation

- Microsoft documents that the listener needs the `userNotificationListener` manifest capability and explicit permission, and that access must be requested on a UI thread.
- Microsoft marks `UserNotificationListener` as MTA and agile; this informs but does not pre-decide the Tauri threading implementation.
- The API exposes current toast notifications, source `AppInfo`, creation time, ID, and notification content.
- Change events distinguish only added and removed notifications and provide a notification ID; this supports using events as invalidation signals rather than treating them as a complete state feed.
- The API was introduced with Windows 10 Anniversary Edition (build 14393), while Microsoft's current package-with-external-location guidance uses build 19041 as its minimum for that packaging technique.
- Tauri documents MSI and NSIS as its standard Windows installers. Its standard flow does not document generating an MSIX identity package with custom capability declarations.
- Microsoft's current Rust bindings expose the required listener methods and event subscription surface.

## Final findings

These findings combine compilation/tests with the recorded live Windows observations. Unrun cases remain explicit rather than being inferred as successful.

### Environment tested

Preliminary development run on 2026-08-09:

- Windows client build 26220.9022, version 25H2, x64.
- Tauri CLI 2.11.4, Tauri Rust crate 2.11.5, `@tauri-apps/api` 2.11.1.
- Rust/Cargo 1.97.1, MSVC target, Windows SDK 10.0.26100.0.
- Unpackaged and sparse-identity development runs across revisions through `1f2c973`.

### Packaging and identity result

Package identity was not required to obtain `Allowed` or a current snapshot on this machine. `Package::Current` returned `0x80073D54` (“The process has no package identity”), while `UserNotificationListener::Current`, `GetAccessStatus`, `RequestAccessAsync`, and `GetNotificationsAsync` succeeded. Foreground event registration did not succeed unpackaged, so one opt-in package-with-external-location route was added for comparison. It builds, signs, and registers as `AttentionHub.Dev_0.1.0.0_neutral__71pqjrj923s6p`; under that identity, the same adapter registered `NotificationChanged` successfully with no diagnostics and completed a real Snipping Tool add/remove cycle. Registration required explicit Local Machine `TrustedPeople` trust because Current User trust alone failed with `0x800B0109`. This is observed behavior on one Windows build, not a distribution-wide guarantee.

### Permission behavior

The first captured status was already `Allowed`, so the first-run Allow/Deny dialog behavior was not observed. Repeated explicit requests returned `Allowed`. Revocation behavior remains pending.

### Snapshot quality by application

| Application | Source identity | Title/body quality | Timestamp/ID behavior | Notes |
| --- | --- | --- | --- | --- |
| Microsoft Teams | Notification-area accessibility label | Qualitative `activityStatus`; no exact count or message details | True-to-false transition validated | Passive exact-count experiment found no stable numeric property and was removed. |
| Microsoft Outlook | `olk.exe` plus English Inbox accessibility labels | Exact aggregate Inbox unread count; no subject/body read | 1-to-0 transition validated | Tray `No unread messages` was observed stale and is not used. |
| Telegram | Window title plus application accessibility labels | Application counter and unread-chat count with distinct semantics | Nonzero-to-zero transition validated | Telegram Desktop 7.0.9 displayed unread/taskbar badges without a current Windows toast. |

The first current notification snapshot contained five entries and completed that vertical slice. Source-owned results were validated separately and must not be relabeled as equivalent notification counts.

### Change and removal behavior

Native subscription and frontend invalidation-refresh behavior are implemented. Unpackaged subscription failed with `0x80070490` from both the Tauri UI thread and an explicitly initialized MTA worker, while snapshots continued to succeed. The identity-enabled application registered the listener successfully and returned a seven-item initial snapshot. A later Snipping Tool notification produced an `Added` event, appeared immediately as a normalized React row, then disappeared when dismissed from Windows Notification Center. One add/remove cycle therefore passes; repeated cycles and target-app cases remain in progress.

### Reliability and recovery

Manual refresh and application restart both recover through a complete snapshot in the development runs completed so far. Frontend reload, sleep/resume, burst behavior, and repeated target-app cycles remain pending.

Existing Telegram unread state did not recover into the snapshot because it was not represented by current Windows toasts. This is a signal-coverage limitation, not a snapshot-recovery failure.

The unpackaged source-owned vertical slice initially returned UI Automation
`0x80004005` during application startup, exposed that failure as diagnostics,
and recovered on the next complete two-second refresh. Fifteen subsequent
refreshes returned four signals without diagnostics. This is promising recovery
evidence, not yet a long-duration reliability result.

### Complexity assessment

The implementation currently needs one Windows-only adapter, Microsoft's `windows` crate, Tauri's existing async/blocking runtime, and a small main-thread result bridge. Snapshot access does not require identity on the tested machine, but foreground events may require the sparse identity/capability route. No helper process, dedicated runtime, database, or provider framework has been introduced.

A read-only diagnostic probe found Telegram folder unread labels through Windows UI Automation, but taskbar, folder, and toast counts had different values and semantics. UI Automation was outside the original notification phases because it introduces per-application coupling and accessibility-tree fragility; ADR 0003 now permits only a bounded three-application feasibility probe rather than adding it to the notification adapter or creating a generalized framework.

After the product requirement was clarified, ADR 0003 authorized a bounded feasibility phase. The reusable PowerShell probe and the Rust/Tauri/React vertical slice now demonstrate that source-owned persistent state is readable without notification traffic: Telegram exposes two different numeric states, Teams exposes only a qualitative activity state, and New Outlook exposes English Inbox unread counts in its application accessibility tree. This materially improves product fit but also confirms that one universal cross-application count contract is unlikely. The current two-second full UI Automation refresh is appropriate for the debug spike only; event-driven or adaptive refresh should be evaluated before production use.

### Decision

Continue with constraints.

Tauri plus a small Rust Windows boundary is proportionate for the source-owned signals proven so far. Do not treat Windows Notification Center as the primary product model and do not introduce a universal unread-count contract. Retain explicit source-specific semantics: Telegram numeric counters, New Outlook Inbox unread count, and Teams qualitative `activityStatus`. Keep the notification-listener adapter as technical evidence/optional input; its sparse identity cost is not required by the primary source-owned path.

Exact Teams counts and sender/message details are deferred. The bounded passive UI Automation experiment found no stable number, and OCR, Microsoft Graph authentication, Teams profile reads, or WebView debugging remain outside the approved architecture.

### Follow-up work

- Finish the Milestone 0 development identity/package cleanup decision and any minimum closure checks still considered valuable.
- Plan a calendar-first next milestone because upcoming commitments are a higher-value attention source than further Teams badge reverse-engineering.
- Treat additional applications as explicit source-specific adapters with truthful signal semantics; do not build a generalized provider framework yet.
- Review the next milestone plan before implementation.

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
