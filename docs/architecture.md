# Architecture

## Status

This document describes the implemented Windows observation architecture
through the Milestone 9 local-first Later Inbox. Notification
access, sparse identity, the source-owned attention-signal path, five fixed live
taskbar crops, the responsive movable widget shell, and one Published ICS
active-or-next selection have been validated to their recorded milestone
gates; multi-monitor reliability, additional sources, remaining calendar edge
cases, and daily product usefulness remain under test.

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
React widget or on-demand Advanced UI
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

Observation remains read-only. The only source-window action is an explicit
user activation from an app button: Attention Hub may restore and foreground an
existing fixed-source top-level window, but it does not launch,
click inside, type into, dismiss, or otherwise control the source application.

## Window and visual composition

The primary Tauri window is a fixed-height, responsive-width frameless widget
with three React zones. It is skipped from the taskbar, starts pinned, and uses
supported Tauri window APIs for dragging, always-on-top, physical position events, and
work-area-aware position restoration. Local storage keeps only widget position,
pin state, the selected IANA timezone, normalized panel appearance, the six
fixed app keys in their user-selected order, the selected subset of those fixed
sources, and the independent five-source live-visual preferences; it does
not persist attention data or source labels. Missing source-control fields
migrate once to the six-source catalog and five visuals enabled. Tauri events synchronize
that record between the widget and Advanced WebViews. User-authored Later Inbox
content is intentionally not part of this presentation-preference record.

The Advanced WebView is created only when the ellipsis is activated and is
destroyed when closed. This keeps Graph, calendar, Notification Center, and raw
diagnostic initialization out of the ordinary widget runtime.

The fixed Later utility button is placed after all enabled source buttons and
before Advanced. It adds one 48-pixel target plus the existing 8-pixel gap, so
the responsive widget becomes 744–1208 by 80 logical pixels. Source buttons
remain first and keep their existing zero-through-five slot indices; the native
DWM geometry contract therefore does not treat Later as a source. Later opens
one on-demand 360×420 WebView with a 340×360 minimum and focuses an existing
instance instead of duplicating it. The opener identity is passed explicitly so
closing returns focus to either the widget or Advanced control that launched it.

DWM thumbnails registered on the Tauri parent render behind its WebView child,
so live taskbar visuals cannot be React components. React owns local fallback
glyphs; Rust owns five rounded, borderless, no-activate inset surfaces owned by
the widget:

```text
source app window monitor
       | orders primary and secondary taskbar surfaces
       | UIA discovers one source rectangle
       | DWM composes source pixels
       v
Teams  Telegram  Outlook  Slack  Viber  WhatsApp
 live    live     React    live   live    live
       \          |          /
        local-glyph button slots
               |
               v
       Tauri widget WebView
```

Each 40-pixel rounded popup is centered with a 4-pixel inset inside its current
48-pixel ordered button and tracks the widget's physical position, current DPI,
visible-source count, and fixed-source slot index every 100 ms
while its existing cached source-rectangle check runs. Once per second a cheap
top-level-window/taskbar topology check detects monitor movement, taskbar-count
changes, and Explorer replacement; a full UI Automation rediscovery runs only
when recovery is required. Each popup composes a bounded square around the
complete taskbar button. Teams and Telegram start only while their separate
source signal reports attention; Slack, Viber, and WhatsApp follow observed app
presence. Owned tool windows do not create taskbar buttons or
take focus. If discovery becomes absent or ambiguous, the popup hides while the
local glyph and React state remain available. The five sources have
separate lifecycle/status records and failures.

The selected React slots are real buttons with keyboard focus, accessible status
labels, stale/retrying/unavailable presentation, and local app glyphs. A user
activation restores and foregrounds an existing source-owned top-level window.
It never launches an application or forwards input into application content.
The five native DWM inset surfaces handle the same activation on pointer release
while remaining visual-only.

No bitmap crosses into Attention Hub. DWM retains pixel composition, and the
application cannot claim which numeric badge the user sees. The structured
Telegram numeric signals, Outlook aggregate English Inbox unread signal, and
qualitative Teams activity signal remain distinct queryable contracts. Missing
or inaccessible Outlook labels are `notExposed`, never zero. A minimized
Outlook removes the numeric badge rather than exposing a stale count or
nonnumeric placeholder; hover and accessible text explain that Outlook must be
opened to refresh. Slack,
Viber, and WhatsApp expose app presence and optional visual-only taskbar
surfaces, but do not contribute to semantic coverage or all-clear claims.

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
  sources: AttentionSourceObservation[];
  signals: AttentionSignal[];
  diagnostics: string[];
}

interface AttentionSourceObservation {
  sourceKey: "telegram" | "outlook" | "teams" | "slack" | "viber" | "whatsapp";
  displayName: string;
  state: "observed" | "notRunning" | "notExposed" | "error";
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
  inferred: boolean;
  meaning: string;
  diagnostics: string[];
}
```

The contract distinguishes signal kind and meaning instead of forcing Telegram application counters, unread-chat counts, and qualitative Teams activity into a misleading universal “unread count.” Raw labels and confidence are debug-spike metadata, not a proposed production UI contract.

Milestone 3A adds one structured observation for each fixed source. Source
absence and capture failure no longer have to be reconstructed from English
diagnostic strings. Telegram, Outlook, and Teams capture independently, so a
failure in one provider cannot prevent the later providers from being checked.
The flattened `signals` list remains as technical evidence. `inferred` marks a
zero produced from a successfully observed source whose count disappears at
zero; it is not used to increase confidence or hide provider limitations.

## Snapshot and update strategy

The complete current snapshot is authoritative. Native `NotificationChanged` events are invalidation signals, not incremental state mutations in React:

1. React subscribes to the change signal.
2. React requests a complete snapshot.
3. Rust queries Windows and returns normalized current state.
4. When Windows reports an add/remove change, Rust emits a small invalidation event.
5. React requests a fresh snapshot. If real behavior shows event bursts require coalescing, implement it once in Rust before emitting the invalidation signal rather than adding per-subscriber timers in React.
6. Window reload, missed events, listener restart, and resume can recover by requesting a new snapshot.

This trades small repeated reads for inspectability and recovery. Milestone 0 notification volume is expected to be small; measure before optimizing.

The widget and Milestone 3A Advanced panel request complete attention-signal
snapshots for the selected fixed source keys five seconds after the previous
request completes. Rust validates the selection before capture; disabled
sources are not traversed, and an empty selection returns **Monitoring paused**
without initializing UI Automation. A shared frontend in-flight
guard also prevents a manual refresh from overlapping the automatic request.
The last successful snapshot remains visible when IPC refresh fails: the first
failure is presented as retrying, while two consecutive failures or data older
than three nominal polling intervals is stale. This five-second cadence is a
dogfood variable, not a production architecture decision. UI Automation events,
adaptive refresh, and refresh-on-resume remain deferred until daily-use evidence
demonstrates which reliability work matters.

The overall panel derives attention separately from health. A positive observed
signal remains visible even if another source is unhealthy. `All clear` is
reserved for fresh, observed, clear state from every selected fixed source;
partial selected coverage is described as no attention detected rather than
false reassurance. Disabled sources are excluded deliberately and never counted
as clear.

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
manual example and product adapter now share one native tracker. ADR 0009
retains it as an opt-in Windows visual companion, while the Tauri boundary
exposes only start, stop, and lifecycle/status commands. The companion uses its
own Attention Hub-owned top-level window because a DWM thumbnail attached to
Tauri's outer window would render behind the webview child. It is owned by the
main panel, initially opens beside it, and remains movable by its native caption.
Start is asynchronous: IPC returns `starting` immediately and the existing
status poll observes the native thread's transition. A process-wide UI
Automation gate prevents the mirror tracker and the existing attention-signal
snapshot from traversing providers concurrently. Initial mirror discovery is a
priority waiter; cached 100 ms checks skip while another traversal holds the
gate rather than blocking the native window message loop.
The mirror still does not enter the normalized signal model; the semantic Teams
behavior remains the proven `activityStatus` boolean.

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

ADR 0011 adds a separate manual New Outlook My Day structure gate. The user
opens My Day Calendar; Attention Hub never controls Outlook. A Tauri command
runs a fresh Windows UI Automation walk behind the process-wide priority gate
and returns only fixed control roles, bounds, state booleans, property lengths,
pattern presence, counts, timing, and traversal limits. Raw labels and calendar
content do not cross IPC. The gate is bounded to 750 ms of UIA-lock wait, 2.5
seconds of scanning, 512 desktop roots, eight Outlook windows, 4,000 elements,
depth 32, and 64 returned candidates. Semantic extraction remains hard-disabled
and source identity explicitly unverified. The visible and fully covered probes
observed structure, but a minimized Outlook window exposed only 12 elements and
no My Day or Calendar markers. This activates the ADR 0011 stop condition. The
provider will not proceed to semantic extraction or widget integration.

ADR 0012 adds a separate one-shot Published ICS structure gate. The frontend
accepts one masked secret and clears it on submit. The Rust backend accepts only
Microsoft 365 Outlook work-calendar publication hosts and the bounded
`/owa/calendar/.../calendar.ics` path shape, normalizes webcal to HTTPS, rejects
credentials/query/fragment/non-default ports, disables redirects and Referrer,
and applies fixed connect/request/body/parser limits. It scans property and
component names in memory, zeroes the body, and returns only sanitized status,
header-presence booleans, counts, limits, and timing. The URL, response/header
values, and event values never cross IPC or enter logs. No background polling
or provider cache exists. The Microsoft 365 Calendar companion is a manual
freshness oracle only. Live Phase A evidence observed one balanced calendar and
approximately 30-second to two-minute propagation across a harmless
create/update/delete cycle. Published ICS is therefore retained for a bounded
semantic phase, while secret persistence, polling, and widget integration stay
unapproved.

ADR 0013 implements that bounded semantic phase as another manual one-shot
command. It requires confirmation of the user-approved title-capable
publication, keeps the ADR 0012 network and body bounds, and returns one
application-owned selection containing only subject, start, end,
active/upcoming classification, and nullable meeting-link presence. The parser
uses RFC 5545 recurrence precedence, bounded recurrence expansion, IANA or
CLDR-mapped Windows timezones, cancellation filtering, deterministic overlap
ordering, and private/confidential redaction. Ambiguous time or recurrence
behavior produces unavailable. Date-only all-day boundaries follow the
viewer's current Windows calendar date; timezone-less timed values remain
rejected. Selection values are not logged. Durable secret
storage, polling, and widget integration remain outside the boundary.

ADR 0014 separately approves the smallest widget integration. Advanced first
requires a fresh successful title-capable selection, then stores exactly one
publication link as a generic Windows credential for the current user with
local-machine persistence. The link never crosses response IPC or browser
storage. A process-wide async gate serializes saved-source work; the widget
polls at most every two minutes and at event start/end boundaries. Any timeout,
ambiguity, storage/read failure, busy result, or missing configuration replaces
the prior state with no selection. Save and removal emit only a payload-free
invalidation event. The widget renders subject and local time plus
active/upcoming and meeting-link presence. ADR 0029 permits only allowlisted
Teams, Zoom, Google Meet, and Webex HTTPS URLs. Rust keeps those URLs in a
process-memory cache and sends the WebView only an ephemeral token. Explicit
Join activation returns the token to a narrow Rust command, which resolves and
opens the current cached URL; raw meeting URLs remain absent from IPC, logs,
fixtures, and evidence.

ADR 0015 refines the single-selection policy after a live multi-day all-day
entry masked the next scheduled appointment. Candidate expansion now preserves
the internal all-day flag. Active timed events rank first, then upcoming timed
events; active and upcoming all-day entries remain fallbacks. The widget
derives a relative `In …` or `Ends in …` label from the approved start/end
fields and continues to display the exact local time range.

ADR 0016 adds a bounded active-event acknowledgement flow. When the primary is
active, the semantic DTO may also contain exactly one earliest future
companion. Both events retain the existing private-content fields plus a
non-sensitive `allDay` boolean so contextual fallbacks never trigger call
alerts. The widget uses a fixed five-minute amber warning, a red pulse from
timed-event start until **I'm in**, and normal current-plus-next presentation
after acknowledgement. Acknowledgement is keyed only by start/end in React
process memory; it never crosses IPC, persists, or writes to a provider. Event
timestamps render with a forced 24-hour clock, and reduced-motion preferences
disable animation without removing the alert color.

## Later Inbox local data

ADR 0026 adds a separate application-owned boundary for user-authored personal
queue content:

```text
Widget count / Later window / Advanced data controls
                    |
                    v
      narrow typed Tauri commands + invalidation event
                    |
                    v
       Rust validation + serialized write gate
                    |
                    v
 per-user later-inbox.json + one previous-valid backup
```

The schema-v3 document contains at most 1,000 items and 1 MiB. Earlier records
were test-only and are reset rather than migrated. An item contains an opaque
ID, Work or Private scope, required bounded title,
optional structured notes/context bounded to 4,000 visible characters, 256
segments, and 25 linked segments, optional validated HTTP(S) URL without
embedded credentials, optional UTC follow-up timestamp, the exact follow-up
value last notified, and created/updated/completed timestamps. Every loaded
record is revalidated. A missing file is an empty inbox, a corrupt primary can
fall back to the previous valid backup, and an unknown future schema is reported
without being overwritten. Explicit destructive cleanup removes a backup that
contains deleted content before atomically replacing the primary file. Ordinary
mutations use a write-through Windows replacement and retain one previous-valid
backup.

Notes store text plus optional validated HTTP(S) link marks, never arbitrary
HTML. Paste parsing discards images, media, embeds, formatting, scripts, and
unsupported URLs. A clicked inline link is opened only after Rust confirms that
the normalized URL is present in the saved item.

Complete snapshots are authoritative. The payload-free `later-inbox-changed`
event only invalidates other WebViews. Later counts are user-owned queue state,
not source observations or `AttentionSignal` values, and never affect coverage
or **All clear**.

Follow-up changes due sorting and labels. When the user explicitly enables due
notifications, the running installed application checks every 30 seconds and
sends at most one native notification for each exact follow-up value. Private
notifications omit the item title, simultaneous due items are aggregated, and
changing the follow-up resets notification state. This adds no background task,
autostart, tray lifecycle, scheduled closed-app delivery, or delivery promise.

Saved URLs open only after explicit user activation by item ID. Rust rereads and
revalidates the stored HTTP(S) address before invoking the Windows default URL
handler. The WebViews receive no generic shell, opener, or filesystem grant.

## Tauri IPC and security

Commands are used for request/response operations because they return typed serialized data and errors. A Tauri event is used only as a low-volume invalidation signal. The frontend must unsubscribe during React cleanup.

Only bounded application commands are registered. WebViews receive no generic
filesystem, shell, opener, or remote-content capability. Calendar networking
remains confined to the approved Rust provider; Later Inbox remains local and
opens a validated saved HTTP(S) URL only after explicit user action through its
narrow native command.

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
