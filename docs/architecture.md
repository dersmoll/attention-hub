# Architecture

## Status

This document describes the implemented Milestone 0 debug architecture and the remaining reliability questions. Notification access, sparse identity, and the first source-owned attention-signal path have been validated on the development machine; their broader reliability remains under test.

## System boundary

```text
Windows notification APIs
        |
        v
Rust Windows adapter
        |
        v
Application-owned normalized model
        |
        v
Tauri commands + change signal
        |
        v
React debug UI
```

React must not import or model WinRT objects. The adapter owns Windows API calls, thread/apartment concerns, access-status mapping, content extraction, and conversion failures. The Tauri boundary exposes only serializable application-owned types.

Milestone 0 now also evaluates this sibling boundary after the notification-only product mismatch was observed:

```text
Windows shell + source application accessibility/window state
        |
        v
Small Windows attention-signal probe
        |
        v
Application-owned normalized signal model
        |
        v
Tauri commands/events -> React debug UI
```

This remains an observer boundary. The probe may read window titles and UI Automation properties but must not click, type, focus, dismiss, or otherwise control source applications.

The completed Teams exact-count experiment used an explicitly separate manual diagnostic. It performed a broader Teams-owned accessibility traversal only on demand and never entered the normal two-second attention-snapshot loop. Raw Teams accessibility values were inspected transiently in Rust and discarded; only sanitized structural metadata crossed Tauri IPC. The experiment found no useful numeric badge property and its command, DTOs, native traversal, and React table were removed. Only the qualitative Teams `activityStatus` signal remains implemented.

## Proposed Milestone 0 components

### Frontend

- React and TypeScript built by Vite.
- One deliberately plain debug screen.
- A typed frontend contract mirroring serialized Rust DTOs.
- A snapshot request on startup and after every native change signal.
- Explicit loading, access, and error states.

### Tauri application core

- A small set of commands: request access, read access status, and request a complete snapshot.
- One change event that means “notification state may have changed”; it is not the source of truth.
- Application lifecycle ownership for starting and stopping the native listener.
- No general provider/plugin framework in Milestone 0.

This boundary represents current Windows toast notifications only. It does not represent taskbar badges, tray-icon overlays, application-internal unread counters, or all work requiring attention. Those are separate signals, and `UserNotificationListener.GetNotificationsAsync` currently supports app/toast notifications rather than a cross-application badge snapshot.

### Windows adapters

- Compiled only on Windows and isolated below a narrow Rust interface.
- Uses Microsoft's `windows` Rust bindings for `Windows.UI.Notifications` and `Windows.UI.Notifications.Management` if the feasibility phase validates this path.
- Maps WinRT results into normalized Rust data immediately.
- Records missing bindings/text and conversion failures instead of inventing content.
- Never removes, clears, or otherwise mutates source notifications during the spike.
- Keeps notification acquisition and source-owned attention acquisition in separate modules because they have different semantics and deployment costs.
- Reads Telegram window/accessibility state, New Outlook Inbox accessibility labels, and the Teams notification-area activity label explicitly; it does not pretend that Windows exposes a universal cross-application badge API.

## Normalized contract

The first implementation should keep the contract small and evidence-oriented. Exact names may change during implementation, but the shape should remain application-owned.

```ts
type NotificationAccessStatus =
  | "unspecified"
  | "allowed"
  | "denied"
  | "unsupported"
  | "error";

interface NotificationSnapshot {
  accessStatus: NotificationAccessStatus;
  capturedAt: string;
  notifications: AttentionNotification[];
  diagnostics: string[];
}

interface AttentionNotification {
  id: number;
  source: {
    displayName: string | null;
    appUserModelId: string | null;
  };
  createdAt: string;
  title: string | null;
  body: string[];
  rawTextElements: string[];
}
```

Dates cross IPC as ISO 8601 strings. Optional fields remain explicit because notification producers do not necessarily populate a uniform payload. `rawTextElements` is spike-only debugging evidence and should be reconsidered after findings are known.

The implemented source-owned contract is separate and equally application-owned:

```ts
interface AttentionSignalSnapshot {
  capturedAt: string;
  signals: AttentionSignal[];
  diagnostics: string[];
}

interface AttentionSignal {
  sourceKey: string;
  displayName: string;
  kind: string;
  count: number | null;
  needsAttention: boolean | null;
  origin: string;
  rawLabel: string | null;
  confidence: "low" | "medium" | "high";
  meaning: string;
  diagnostics: string[];
}
```

The contract distinguishes signal kind and meaning instead of forcing Telegram application counters, unread-chat counts, and qualitative Teams activity into a misleading universal “unread count.” Raw labels and confidence are debug-spike metadata, not a proposed production UI contract.

## Snapshot and update strategy

The complete current snapshot is authoritative. Native `NotificationChanged` events are invalidation signals, not incremental state mutations in React:

1. React subscribes to the change signal.
2. React requests a complete snapshot.
3. Rust queries Windows and returns normalized current state.
4. When Windows reports an add/remove change, Rust emits a small invalidation event.
5. React requests a fresh snapshot. If real behavior shows event bursts require coalescing, implement it once in Rust before emitting the invalidation signal rather than adding per-subscriber timers in React.
6. Window reload, missed events, listener restart, and resume can recover by requesting a new snapshot.

This trades small repeated reads for inspectability and recovery. Milestone 0 notification volume is expected to be small; measure before optimizing.

The source-owned debug UI currently requests a complete attention-signal snapshot every two seconds. Requests do not overlap: the next timer starts only after the previous command completes. This proved recovery after a transient startup failure and avoids fragile incremental frontend state, but full UI Automation traversal every two seconds is not a production recommendation. Before Milestone 1, compare UI Automation property-change/window events, slower adaptive refresh, and refresh-on-resume while retaining complete snapshot recovery.

The removed Teams accessibility diagnostic was manual because it traversed a larger application tree and existed only to answer a bounded feasibility question. Its negative result was never merged into `AttentionSignal`. The existing `activityStatus` signal is the authoritative implemented Teams behavior; exact Teams counts and message details are deferred rather than approximated.

## Permission and threading

Microsoft documents that `UserNotificationListener.RequestAccessAsync` must be called from a UI thread and requires explicit user permission. The implementation phase must prove which Tauri thread/window hook can reliably make that request. Background access must not be requested automatically before an explanatory user action in the debug UI.

Microsoft also marks `UserNotificationListener` as MTA and agile. This does not by itself prove that a dedicated native thread is necessary. Phase 1 must first test the smallest correct Tauri main-thread/apartment integration for the permission operation, and Phase 3 must prove event-subscription lifetime and callback behavior. A dedicated OS thread or channel bridge is permitted only if those experiments demonstrate a concrete need and the milestone plan is updated with the finding.

Implementation finding on 2026-08-09: `RequestAccessAsync` is started inside `AppHandle::run_on_main_thread`. Its WinRT async operation is then completed on Tauri's existing blocking pool, so the UI thread is not blocked while Windows handles consent. A bounded standard-library channel carries only the immediate main-thread result. No dedicated OS thread or additional async runtime was introduced.

## Package identity and manifests

Microsoft requires the `uap3:Capability Name="userNotificationListener"` package-manifest declaration. This makes package identity and manifest delivery part of the spike, not a later installer detail.

Tauri's standard Windows bundles are MSI or NSIS installers for a Win32 executable. They should not be assumed to provide MSIX package identity or an Appx/MSIX capability manifest. The spike will compare:

1. ordinary `tauri dev` / unpackaged executable behavior;
2. a development-only package-identity route, most likely an MSIX package or a package-with-external-location identity;
3. only if necessary, a minimal native helper/host boundary.

No production installer choice is made in Milestone 0. A sparse/external-location identity is attractive for preserving Tauri's normal executable, but Microsoft documents additional manifest alignment, signing, registration, and Windows 10 build 19041 minimum requirements. Those costs must be measured rather than assumed acceptable.

Implementation finding on Windows build 26220.9022: an ordinary unpackaged `tauri dev` process reported `0x80073D54` when checking `Package::Current`, yet the listener API was available, access was `Allowed`, an explicit access request returned `Allowed`, and a current snapshot succeeded. However, `NotificationChanged` registration failed with `0x80070490` from both the Tauri UI thread and an explicitly initialized MTA worker. The same adapter registered `NotificationChanged` successfully with no diagnostics when launched as the sparse identity `AttentionHub.Dev_0.1.0.0_neutral__71pqjrj923s6p`. Identity is therefore required for live updates on the tested machine even though snapshot access works unpackaged.

Product-signal finding: Telegram Desktop 7.0.9 showed nonzero taskbar and application unread badges while no Telegram entry existed in the Windows toast snapshot. A read-only UI Automation probe exposed an application-owned `All chats (9 unread chats)` label and a separate title/taskbar application counter. The latter advanced from 20 to 26 while the user independently observed 25 on the rendered badge immediately beforehand, confirming the same live signal with a timing race. ADR 0003 authorized the bounded feasibility work, and the explicit three-source adapter now crosses the Rust/Tauri/React boundary in ordinary unpackaged mode.

Plan update: the product requirement was clarified to prefer persistent taskbar/application state without creating Notification Center noise. Microsoft exposes methods for applications to set their own taskbar overlay or badge, but no supported getter for another application's numeric badge. On the tested desktop, generic taskbar UI Automation identified source buttons but omitted rendered badge numbers. The bounded implementation therefore reads source-owned window/accessibility state upstream of the rendered badge: Telegram exposes a title count and unread-chat labels; New Outlook exposes per-Inbox unread counts; Teams exposes only a tray `New activity` label. The Outlook tray's `No unread messages` label was rejected after it contradicted a real unread Inbox. These are application-specific feasibility contracts, not universal Windows state.

Visual-fallback Phase 0 finding on Windows build 26220.9022: a manual native
Cargo example successfully registered the primary vertical `Shell_TrayWnd` as
a DWM thumbnail source. The complete taskbar surface rendered live in an
Attention Hub-owned native destination, included the real Teams badge, and
reflected badge changes without pixel readback or re-registration. This proves
taskbar-surface feasibility on the tested machine. A separately approved static
crop pass then found exactly one Teams taskbar button, excluded its notification
area icon, and translated its physical UI Automation bounds into the correct
unpadded DWM source rectangle. The isolated icon and badge were correct at rest.
After taskbar reordering, the fixed crop displayed the icon that moved into the
old rectangle. An Explorer WinEvent invalidation attempt missed a controlled
new taskbar button, and a taskbar-descendant UI Automation event subscription
was rejected after `STATUS_HEAP_CORRUPTION`. The manual example now contains a
100 ms semantic UI Automation rectangle revalidation fallback. A supervised
reflow produced many real rectangle transitions and the DWM crop followed
Teams, with a brief, user-accepted flash of another icon during movement. The
readiness pass now retains the discovered Teams element for cheap rectangle
checks and uses full taskbar traversal only for bounded recovery. A 612-second
debug run measured 0.018% total CPU and a 20.85 MiB maximum working set. Two
Explorer taskbar-owner restarts hid the mirror, rebound the new DWM source, and
recovered Teams after the rebuilt accessibility tree became available. The
example stays outside Tauri IPC and the normalized signal model; retaining the
mirror in the product still requires an explicit product decision. The semantic
Teams behavior remains the proven `activityStatus` boolean.

The development identity route uses a package with external location mapped to `src-tauri/target/debug`, embeds matching `msix` metadata in the executable manifest through `tauri-build`, and declares `uap3:userNotificationListener`, `runFullTrust`, and `unvirtualizedResources` in the sparse package manifest. The executable metadata is opt-in through `ATTENTION_HUB_DEV_IDENTITY=1`; ordinary builds and tests remain unpackaged. The install and launch scripts set this variable deliberately so a binary that declares identity is never produced accidentally without the matching package registration. On the tested machine, package registration succeeded only after the public development certificate was explicitly trusted in Local Machine `TrustedPeople`; Current User `TrustedPeople` alone produced deployment error `0x800B0109`. This is a development experiment, not a production installer decision. Generated packages and certificates stay under ignored `target` output; scripts provide scoped registration, launch, and removal.

Calendar Phase 0 finding on Windows build 26220.9022: the ordinary unpackaged
Tauri executable successfully obtained
`AppointmentManager.RequestStoreAsync(AllCalendarsReadOnly)` even though
`Package::Current` returned `0x80073D54` (no package identity). Calendar
snapshot work therefore stays unpackaged and the sparse manifest does not gain
an `appointments` capability. Rust normalizes the appointment-store data before
IPC; details/body, people, organizer data, URI, and meeting links are excluded
from the Milestone 1 contract. Because meeting URLs can also appear inside the
ordinary appointment `Location` property, URL-like location values are omitted
in Rust before serialization rather than relying only on avoiding the dedicated
online-meeting and URI properties.

Calendar Phase 1 coverage finding: all returned appointment calendars were
attributed to the legacy Windows Mail and Calendar source. Comparison with the
current New Outlook and Microsoft 365 views showed a materially stale/partial
schedule, including a current Teams meeting absent from the Windows snapshot.
`AppointmentStore` is therefore retained as spike evidence rather than selected
as the product's calendar provider, and `StoreChanged` work is stopped. ADR 0006
defines the required policy choice between a least-privilege Microsoft Graph
exception and no New Outlook calendar support.

ADR 0006 option 1 was approved. The Graph spike's Phase 0 uses a Windows-only
.NET 8 helper with official MSAL.NET/WAM 4.87.0 packages and a bounded JSON
process protocol. In the verified unconfigured state, the helper returns only
Windows support, registration-coordinate presence, and component versions; it
does not authenticate or contact Graph. Rust locates the development helper,
enforces a five-second timeout and 64 KiB stream limit, parses the expected
protocol version/operation, and exposes an application-owned environment report
through Tauri. Tokens and raw provider responses are not part of this boundary.
Phase 1 is paused: the work tenant is organization-owned, and no Entra
registration, consent, token, or Graph request was created.

ADR 0007 tested the installed Microsoft 365 Calendar companion before accepting
that organization-facing cost. Installation did not change the Windows
`AppointmentStore` result: `AllCalendarsReadOnly` still returned 11 calendars,
one distinct source display name, and 13 appointments. A sanitized native UI
Automation probe found useful event/time structure while the companion flyout
was visible, but the event WebView tree disappeared when the flyout closed even
though hidden process-owned windows remained. The companion is therefore not a
passive background provider. Attention Hub will not automatically open another
application to refresh it, and normalized companion agenda extraction is
stopped. The temporary probe is evidence, not a new provider architecture.

## Tauri IPC and security

Commands are used for request/response operations because they return typed serialized data and errors. A Tauri event is used only as a low-volume invalidation signal. The frontend must unsubscribe during React cleanup.

Only commands required by the debug UI should be registered. No filesystem, shell, opener, network, or remote-content capability is required for this milestone. The application remains local and does not transmit notification content.

The bundled application uses a restrictive Content Security Policy that permits local assets and Tauri IPC only. Development-server exceptions, if needed, must remain development-only.

## Test boundary

Keep WinRT acquisition separate from pure normalization. Unit tests should cover mapping synthetic extracted values into application-owned DTOs, including missing source identity, absent or empty text elements, multiple body lines, and per-entry conversion failure. Live permission, listener, identity, and notification lifecycle behavior remains a manual Windows integration test.

Source-owned parser tests cover Telegram title counts and unread-chat labels, Teams qualitative activity classification, and Outlook unread labels. Live UI Automation availability, localization, application-version drift, and state transitions remain integration evidence and must never be inferred from parser tests alone.

## Error behavior

- Permission denial is an observable state, not a crash.
- Unsupported API, missing identity/capability, malformed notification content, and WinRT failures must be distinguishable in diagnostics.
- One malformed notification must not prevent other notifications from appearing.
- Listener failure must leave manual snapshot refresh available when possible.
- Logs must avoid unnecessary duplicate notification content; the debug UI itself is already sensitive and should be used only on the developer machine.
- The completed Teams exact-count diagnostic did not log or serialize raw Teams accessibility text. Its temporary DTO contained only fixed keyword matches, numeric tokens, ARIA property keys, lengths, UIA control/pattern metadata, visibility, and bounds; the diagnostic code was removed after the experiment.

## Dependency policy

Use Tauri, React, TypeScript, Vite, Serde, and Microsoft's `windows` crate. Do not add state management, a database, UI frameworks, async runtimes, or abstraction layers unless an observed implementation constraint requires one and the milestone plan is updated first.

## Current documentation evidence

- Microsoft: [Notification listener](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/notification-listener)
- Microsoft: [`UserNotificationListener` API](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.management.usernotificationlistener)
- Microsoft: [`uap3:Capability`](https://learn.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/element-uap3-capability)
- Microsoft: [App capability declarations](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/app-capability-declarations)
- Microsoft: [Package identity with external location](https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/grant-identity-to-nonpackaged-apps)
- Microsoft: [`windows` Rust binding for `UserNotificationListener`](https://microsoft.github.io/windows-docs-rs/doc/windows/UI/Notifications/Management/struct.UserNotificationListener.html)
- Microsoft: [UI Automation fundamentals](https://learn.microsoft.com/en-us/windows/win32/winauto/entry-uiautocore-overview)
- Microsoft: [`ITaskbarList3`](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nn-shobjidl_core-itaskbarlist3)
- Microsoft: [`ITaskbarList3::SetOverlayIcon`](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-itaskbarlist3-setoverlayicon)
- Microsoft: [`BadgeNotificationManager`](https://learn.microsoft.com/en-us/windows/windows-app-sdk/api/winrt/microsoft.windows.badgenotifications.badgenotificationmanager)
- Tauri: [IPC concepts](https://v2.tauri.app/concept/inter-process-communication/)
- Tauri: [Calling the frontend from Rust](https://v2.tauri.app/develop/calling-frontend/)
- Tauri: [Content Security Policy](https://v2.tauri.app/security/csp/)
- Tauri: [Windows installers](https://v2.tauri.app/distribute/windows-installer/)
