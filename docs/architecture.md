# Architecture

## Status

This document describes the intended Milestone 0 architecture. Windows notification access and package identity remain unvalidated hypotheses until the spike findings are recorded.

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

### Windows adapter

- Compiled only on Windows and isolated below a narrow Rust interface.
- Uses Microsoft's `windows` Rust bindings for `Windows.UI.Notifications` and `Windows.UI.Notifications.Management` if the feasibility phase validates this path.
- Maps WinRT results into normalized Rust data immediately.
- Records missing bindings/text and conversion failures instead of inventing content.
- Never removes, clears, or otherwise mutates source notifications during the spike.

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

## Snapshot and update strategy

The complete current snapshot is authoritative. Native `NotificationChanged` events are invalidation signals, not incremental state mutations in React:

1. React subscribes to the change signal.
2. React requests a complete snapshot.
3. Rust queries Windows and returns normalized current state.
4. When Windows reports an add/remove change, Rust emits a small invalidation event.
5. React requests a fresh snapshot. If real behavior shows event bursts require coalescing, implement it once in Rust before emitting the invalidation signal rather than adding per-subscriber timers in React.
6. Window reload, missed events, listener restart, and resume can recover by requesting a new snapshot.

This trades small repeated reads for inspectability and recovery. Milestone 0 notification volume is expected to be small; measure before optimizing.

## Permission and threading

Microsoft documents that `UserNotificationListener.RequestAccessAsync` must be called from a UI thread and requires explicit user permission. The implementation phase must prove which Tauri thread/window hook can reliably make that request. Background access must not be requested automatically before an explanatory user action in the debug UI.

Microsoft also marks `UserNotificationListener` as MTA and agile. This does not by itself prove that a dedicated native thread is necessary. Phase 1 must first test the smallest correct Tauri main-thread/apartment integration for the permission operation, and Phase 3 must prove event-subscription lifetime and callback behavior. A dedicated OS thread or channel bridge is permitted only if those experiments demonstrate a concrete need and the milestone plan is updated with the finding.

## Package identity and manifests

Microsoft requires the `uap3:Capability Name="userNotificationListener"` package-manifest declaration. This makes package identity and manifest delivery part of the spike, not a later installer detail.

Tauri's standard Windows bundles are MSI or NSIS installers for a Win32 executable. They should not be assumed to provide MSIX package identity or an Appx/MSIX capability manifest. The spike will compare:

1. ordinary `tauri dev` / unpackaged executable behavior;
2. a development-only package-identity route, most likely an MSIX package or a package-with-external-location identity;
3. only if necessary, a minimal native helper/host boundary.

No production installer choice is made in Milestone 0. A sparse/external-location identity is attractive for preserving Tauri's normal executable, but Microsoft documents additional manifest alignment, signing, registration, and Windows 10 build 19041 minimum requirements. Those costs must be measured rather than assumed acceptable.

## Tauri IPC and security

Commands are used for request/response operations because they return typed serialized data and errors. A Tauri event is used only as a low-volume invalidation signal. The frontend must unsubscribe during React cleanup.

Only commands required by the debug UI should be registered. No filesystem, shell, opener, network, or remote-content capability is required for this milestone. The application remains local and does not transmit notification content.

The bundled application uses a restrictive Content Security Policy that permits local assets and Tauri IPC only. Development-server exceptions, if needed, must remain development-only.

## Test boundary

Keep WinRT acquisition separate from pure normalization. Unit tests should cover mapping synthetic extracted values into application-owned DTOs, including missing source identity, absent or empty text elements, multiple body lines, and per-entry conversion failure. Live permission, listener, identity, and notification lifecycle behavior remains a manual Windows integration test.

## Error behavior

- Permission denial is an observable state, not a crash.
- Unsupported API, missing identity/capability, malformed notification content, and WinRT failures must be distinguishable in diagnostics.
- One malformed notification must not prevent other notifications from appearing.
- Listener failure must leave manual snapshot refresh available when possible.
- Logs must avoid unnecessary duplicate notification content; the debug UI itself is already sensitive and should be used only on the developer machine.

## Dependency policy

Use Tauri, React, TypeScript, Vite, Serde, and Microsoft's `windows` crate. Do not add state management, a database, UI frameworks, async runtimes, or abstraction layers unless an observed implementation constraint requires one and the milestone plan is updated first.

## Current documentation evidence

- Microsoft: [Notification listener](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/notification-listener)
- Microsoft: [`UserNotificationListener` API](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.management.usernotificationlistener)
- Microsoft: [`uap3:Capability`](https://learn.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/element-uap3-capability)
- Microsoft: [App capability declarations](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/app-capability-declarations)
- Microsoft: [Package identity with external location](https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/grant-identity-to-nonpackaged-apps)
- Microsoft: [`windows` Rust binding for `UserNotificationListener`](https://microsoft.github.io/windows-docs-rs/doc/windows/UI/Notifications/Management/struct.UserNotificationListener.html)
- Tauri: [IPC concepts](https://v2.tauri.app/concept/inter-process-communication/)
- Tauri: [Calling the frontend from Rust](https://v2.tauri.app/develop/calling-frontend/)
- Tauri: [Content Security Policy](https://v2.tauri.app/security/csp/)
- Tauri: [Windows installers](https://v2.tauri.app/distribute/windows-installer/)
