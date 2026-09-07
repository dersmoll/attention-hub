# Investigation: obtaining Microsoft Teams' exact unread/attention count locally

## Status

Independent research and brainstorming only. No implementation, no live experiment against the running Teams client, and no other project document was modified. This document builds on `docs/architecture.md`, `docs/milestones/milestone-0-notification-spike.md`, ADR 0003, `docs/milestones/evidence/m0/2026-08-10-source-transition-validation.md`, and `src-tauri/src/attention_signals/windows_adapter.rs`, and treats their findings as already-established facts rather than re-deriving them.

## Executive recommendation

Run one more bounded, falsifiable, local, credential-free experiment before concluding anything about Teams' exact count: probe Teams' own chat-list UI Automation tree for a **per-conversation** unread marker (not a rendered digit) and, if found, **sum booleans** rather than search for a number. This is a materially different target than what has already been tried. The existing evidence only inspected the taskbar tray label and Teams' top-level Activity/Chat nav controls — it never inspected the chat list itself, where an individual per-row "this conversation is unread" signal is independently corroborated by Microsoft's own Teams screen-reader documentation (which describes a boolean unread indicator per chat/channel, not a spoken number). That correlation is what makes this worth one more bounded try rather than a shot in the dark.

Every other candidate is worse on the project's own terms: Microsoft Graph could get close to the real number but is explicitly blocked by this task's stated constraints (no Microsoft/Teams credentials or OAuth tokens) and additionally requires a work/school account, which is unconfirmed for this user; OCR's own precondition (finding the badge's exact screen coordinates) is itself undocumented and unreliable per Microsoft's own support engineers, compounding on top of already-hard digit recognition; local WebView2/IndexedDB inspection is undocumented, likely stale, and carries real privacy risk; forcing WebView2 remote debugging onto Teams requires changing how Teams itself launches and opens a local debug port, which functionally crosses the observer boundary and adds a standing security cost.

If the bounded chat-list experiment fails or is rejected on privacy/scope grounds, the honest fallback is to keep the already-shipped boolean `needsAttention` signal for Teams and stop looking for an exact count — not to reach for Graph or OCR by default.

## What is confirmed versus hypothetical

**Confirmed, with primary sources:**

- No Windows API (`ITaskbarList3`/`ITaskbarList4`, Windows App SDK `BadgeNotificationManager`, or any Shell/COM interface) exposes a getter for another process's taskbar overlay icon or badge value. Every relevant interface is documented as set-only, self-only.
- The taskbar's internal UI Automation tree (`Shell_TrayWnd`, `TaskbarFrame`) is not a documented, guaranteed surface; a Microsoft support engineer stated directly that querying taskbar button state this way "is not guaranteed by Windows." This matches this project's own finding that the tray's `NotifyItemIcon` element exposed only `"Microsoft Teams | New activity"`, never a digit.
- Windows App SDK numeric badges are documented as accepting values 1–99, with a distinct visual treatment above 99 — confirming the badge is a rendered glyph/icon, not exposed data, and that OCR would face a hard cap/ambiguity above 99 even if it worked at all.
- Microsoft Graph's `chat` resource has no unread-count field. It exposes `chat.viewpoint.lastMessageReadDateTime`, which a caller can compare against each chat's latest message timestamp to derive "has this chat been read." No equivalent exists for Teams channels.
- Graph chat endpoints require a work/school (Microsoft Entra ID) account and an app registration; personal Microsoft accounts are explicitly unsupported for `/me/chats`.
- Teams' official support documentation states the taskbar badge is a **sum of three different things**: one point per unmuted unread chat/group/meeting conversation, one point per channel with an unread @mention, and one point per unread followed thread. It is not a message count and not even a single homogeneous count — a fact this document treats as binding on every candidate below.
- New Teams is MSIX-packaged (`MSTeams_8wekyb3d8bbwe`), runs as `ms-teams.exe`, and its WebView2 profile data (cookies/IndexedDB/cache) lives under `%LocalAppData%\Packages\MSTeams_8wekyb3d8bbwe\LocalCache\Microsoft\MSTeams\EBWebView\`. Its Chrome DevTools Protocol surface can only be enabled by the app's own host at launch (a flag or a registry policy that forces a relaunch) — an unrelated external process cannot attach to an already-running, unconfigured instance.
- The UI Automation `AriaProperties` property (`CurrentAriaProperties` / `UIA_AriaPropertiesPropertyId`) is a real, documented channel that Chromium-hosted content (which includes Teams via WebView2) uses to expose ARIA attributes that don't map to a standard UIA property, as `name=value;` pairs. The existing Teams probe checked Name, HelpText, ItemStatus, and ItemType, but not AriaProperties.
- No confirmed prior art exists for reading Teams' exact unread count from outside the process. `teams-for-linux` gets an exact number, but only because it is an Electron shell that reads Teams' own in-page `document.title` mutation — a technique unavailable to an external observer of the official native client. `Teams-Auto-Hide` gets only a boolean, via pixel-color matching against a small on-screen unread dot per conversation — which independently confirms that Teams renders a per-conversation visual unread indicator, even though that project didn't try UI Automation.

**Hypothetical / unconfirmed — explicitly not to be treated as fact:**

- Whether Teams' chat-list items expose their unread state through any UI-Automation-queryable property (Name, ItemStatus, or AriaProperties) at all, as opposed to being a purely decorative pixel with no accessible representation. No official doc or community project confirms this either way.
- Whether Teams' IndexedDB store contains a clean, current "unread" field, as opposed to raw message/read-marker records that would need to be reverse-engineered and might not even reflect live state (WebView2 profile storage is a browsing-data cache; the live count may be recomputed from the server and never written back to disk in a directly readable form).
- Whether the per-item approach, even if it works, would match the rendered badge number — it can at best reconstruct the "unread chats" component, not the mention-channel or followed-thread components, unless those are separately probed too.

## Candidate approaches, ranked most to least promising

### 1. Bounded UI Automation probe of Teams' own chat-list (per-item unread marker)

Extend the existing adapter with a Teams-specific probe (mirroring `capture_telegram`/`capture_outlook`, which already match on process name) that locates Teams' chat-list container and inspects each visible conversation row's `Name`, `ItemStatus`, and `AriaProperties` for a boolean unread marker, then reports a **count of marked rows**, not a parsed digit. This is a different target than anything already tried in this project — the existing Teams probe only looked at the taskbar tray and Teams' top-level nav buttons, never the chat list itself.

Why it is the most promising: it stays entirely within the project's existing architecture and principles (local, read-only, no credentials, no notifications, small source-specific extraction, not a generalized framework), and it targets exactly the mechanism that Teams' own accessibility documentation independently describes existing (a boolean per-conversation indicator), rather than searching for a number that no evidence suggests exists anywhere in the accessible tree.

### 2. Microsoft Graph `chat.viewpoint` reconstruction

Technically the most capable and most stable option — a documented, versioned API that could reconstruct "unread chat count" (though not the mention/followed-thread components) without any DOM/UIA fragility. Explicitly excluded by this task's own constraint ("No Microsoft/Teams credentials or OAuth tokens") and by the project's standing principles (no cloud backend, no third-party account aggregation). Also gated on an unconfirmed fact: it requires a work/school account, and this document does not know whether the Teams account in use is personal or work/school. Ranked here only because it is the technically strongest fallback if the product owner ever revisits the credentials principle for this one signal — not because it is currently permitted.

### 3. Taskbar badge OCR (separately-approved last resort)

In principle the badge is a real rendered digit, so OCR is not impossible. In practice it inherits two independent layers of fragility: Microsoft's own support engineers describe the taskbar button's screen geometry as not reliably queryable to begin with (so finding *where* to capture is already unsupported), and even a perfect capture must contend with DPI scaling, theme/accent-color glyph rendering, the documented 99-value cap with an ambiguous ">99" treatment, animation frames during updates, and Windows 11 icon-combining behavior. This is exactly the class of approach the project's own principles already gate behind separate, explicit approval, and this research does not change that gate — if anything, the compounding fragility argues for leaving it deprioritized rather than fast-tracking it.

### 4. Local Teams IndexedDB/LevelDB inspection

Storage technology (IndexedDB/LevelDB under the WebView2 profile) is confirmed to exist; its schema is completely undocumented, Teams' MSIX updates roughly monthly with no stability commitment for internal storage, the files may be locked while Teams is running, and the state on disk may not even reflect live unread status (it is a browsing-data cache, not necessarily the source of truth). Recovering a usable count would mean reverse-engineering an unversioned format for a result no better than option 1, with materially higher privacy risk (raw proximity to actual message records) and maintenance cost. Not recommended.

### 5. Forcing WebView2 remote debugging onto Teams

Blocked by default: CDP can only be enabled by whichever process creates the WebView2 environment, via a flag or a registry policy (`AdditionalBrowserArguments`) that Teams' own host must be launched with — Attention Hub cannot attach to an already-running, unconfigured instance. The only way to enable it is to set a persistent policy that changes how Teams itself launches and forces a Teams restart, which functionally means Attention Hub deciding how a source application runs — in tension with the observer boundary even though it is "just a flag" — and it leaves a local debug port open to any process on the machine, not just Attention Hub, for as long as the policy exists. Not recommended.

### Fallback (not a candidate for "exact," but the safe default): keep boolean-only Teams state

Already implemented and already validated (`needsAttention: true → false` tracked correctly through a real transition). Zero additional risk, zero additional cost, and immediately available regardless of how the experiment above turns out.

## Comparison table

| Candidate | Exact count | Future sender identity | Credentials/account access | Supported vs undocumented | Packaging/identity needs | Localization sensitivity | Privacy risk | Expected reliability | Maintenance cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1. Chat-list per-item UIA probe | Partial at best (chat-unread component only); unconfirmed whether it works at all | Yes (same traversal sees contact/group names; must be deliberately discarded now) | None | Undocumented DOM/UIA structure, on top of the documented UIA + AriaProperties API surface | None (unpackaged, same as existing probes) | Low if boolean-state-only; medium if any text pattern is needed | Low if only counts are kept; medium if Name is read even transiently | Unknown — untested; plausible per accessibility-doc analogue | Medium — SPA/WebView2 DOM structure can shift across ~monthly Teams updates |
| 2. Microsoft Graph `chat.viewpoint` | Partial (chats only; no mention/followed-thread component) | Yes, richer and more stable than scraped labels | Required — Azure AD app registration, delegated OAuth consent, work/school tenant only | Fully documented, versioned API | None Windows-side; needs Graph app registration/consent | None (typed data, no string parsing) | Higher — broad chat-metadata scope, token storage, cloud round-trip | High (stable, versioned, SLA-backed) | Low technically; ongoing token/consent lifecycle overhead |
| 3. Taskbar badge OCR | Yes in principle, capped/ambiguous above 99 | No | None | Undocumented at two layers (button geometry, then glyph) | None | Low (digits aren't localized) but DPI/theme/scaling sensitive | Low-medium (narrow screen region, but screen capture is a broad OS capability) | Low — compounding fragility, explicitly gated as last resort | High |
| 4. Local IndexedDB/LevelDB inspection | Unknown/unlikely as a clean field | Yes, and closer to raw message data than any other option | None | Fully undocumented | None extra, but file-lock contention while Teams runs is likely | N/A | High — direct proximity to raw chat data store | Low — may reflect stale/offline state, not live state | Very high — unversioned schema, silent breakage |
| 5. Forced WebView2 CDP attach | Yes in principle (full DOM) if attained | Yes, full DOM access | None | The registry policy itself is documented; using it this way is not its intended purpose | Requires setting a persistent policy and forcing a Teams relaunch | None | Very high — standing local debug port reachable by any process | Medium once attached; fragile precondition, may be reset by Teams updates | High |
| Fallback: boolean-only (status quo) | No — explicitly not attempted | No | None | Same UIA basis already shipped and proven | None | Medium (current English substring matching on "new activity"/"unread"/"notification") | Minimal | High — already validated | Low |

## Bounded experiments

### Experiment for candidate 1 (chat-list per-item probe) — the one worth running

1. Add an isolated, Teams-specific function alongside `capture_telegram`/`capture_outlook` that matches on `ms-teams.exe`, locates the chat-list container (discovered empirically via one full descendant-tree dump, the same technique already used to find Outlook's Inbox label), and reads `CurrentName`, `CurrentItemStatus`, and `CurrentAriaProperties` for each visible row.
2. Log raw values to local, non-persisted developer console output only — never commit them — while manually cycling through zero, one, and two known unread conversations through ordinary Teams use (no automation of Teams itself).
3. Compare captured values across the three known states. If any of the three properties reliably distinguishes unread from read rows, implement counting that discards `Name` immediately after checking for the pattern and retains only a count.
4. Record findings the same way the existing evidence file does: date, Teams version, exact property and value observed, and pass/fail per transition.

**Stop conditions:**

- Stop if none of Name, ItemStatus, or AriaProperties differ between a confirmed-unread and confirmed-read row across at least 3 real transitions.
- Stop, and require explicit product-owner sign-off before continuing, if the only usable signal requires reading full Name text that could contain contact or message content beyond a boolean marker.
- Stop if the chat-list container cannot be located reliably across two different Teams window states (e.g., resized window, collapsed vs expanded list) — that level of fragility is disproportionate to the value.
- Stop if the list is virtualized such that off-screen unread conversations are invisible to the traversal, unless a scroll-and-recheck approach is explicitly scoped and approved (this would add real complexity and its own failure modes).
- Time-box: two focused sessions, matching the discipline already used for Phase 1 of the milestone.

### Experiment for candidate 2 (Graph) — do not run without a prior product-owner decision

This is a decision-gate, not something to attempt opportunistically. If the product owner explicitly and narrowly reconsiders the no-credentials principle for this one signal: register a single-tenant Azure AD app with only the `Chat.ReadBasic` delegated permission (the least-privileged scope that still returns `viewpoint`), complete one interactive consent, call `GET /me/chats?$expand=lastMessagePreview`, and compare the derived unread-chat count against the real taskbar badge across five observed states, expecting it to consistently under-count relative to the rendered badge by exactly the mention/followed-thread contribution. **Stop immediately, before writing any code, if the Teams account in daily use turns out to be a personal Microsoft account rather than work/school** — Graph chat endpoints do not support personal accounts at all, and no credentials-policy decision changes that.

### Experiment for candidate 3 (OCR) — not recommended, described only because the task asks for it

If a future, separately-approved OCR milestone is ever authorized: the honest first step is not glyph recognition but geometry — proving the taskbar button's screen rectangle can be located at all, given Microsoft's own guidance that this is not a guaranteed operation. If that sub-problem cannot be solved repeatably across DPI settings and taskbar-combining modes, stop before attempting any digit recognition; recognition accuracy is irrelevant if the crop region itself cannot be trusted.

## Architectural implications for Tauri/Rust

- Candidate 1 fits the existing shape in `windows_adapter.rs` directly: one more small, source-specific `capture_teams_*` function returning `AttentionSignal` values with `origin`, `confidence`, and `meaning` set honestly (e.g., `kind: "unreadChats"`, `meaning` stating explicitly that mention/followed-thread contributions are not included), keeping the "no generalized provider framework" constraint intact.
- A chat list is a materially larger and potentially virtualized UI Automation tree than anything probed so far (a single title string for Telegram, a handful of Inbox labels for Outlook). `TreeScope_Descendants` over a chat list may only see currently-rendered rows, silently undercounting if the list is scrolled — this should be an explicit diagnostic ("N rows inspected; list may be scrolled") rather than a silently confident number, consistent with the project's existing "record absence rather than inferring" discipline.
- The current debug UI's two-second full-refresh cadence already carries an open caution in `architecture.md` about production-readiness; adding a heavier chat-list traversal to that same cadence would compound it. This should be an explicit decision (slower cadence, or on-demand only for this one signal) rather than an inherited default.
- If Graph is ever approved, it is not an incremental change to the existing adapter — it introduces network egress, an HTTP client, OAuth token acquisition/storage, and a cloud dependency for the first time, contradicting the current dependency policy's minimalism at its foundation. It would need its own ADR and a explicit revision of the "local-first, no cloud backend" principle in `vision.md`, not a quiet addition to `windows_adapter.rs`.
- If OCR is ever approved, it introduces a screen-capture dependency and an OCR/classification dependency — again a new capability category requiring a milestone-plan update first, per the existing dependency policy.

## Official-source links

- [`ITaskbarList3`](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nn-shobjidl_core-itaskbarlist3) / [`ITaskbarList4`](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nn-shobjidl_core-itaskbarlist4) / [`SetOverlayIcon`](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-itaskbarlist3-setoverlayicon)
- [`BadgeNotificationManager`](https://learn.microsoft.com/en-us/windows/windows-app-sdk/api/winrt/microsoft.windows.badgenotifications.badgenotificationmanager) / [Badge notifications overview](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/badges)
- [UI Automation properties for clients](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-propertiesforclients) / [`AutomationElementIdentifiers`](https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.automationelementidentifiers) / [UI Automation control support](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-controlsupport)
- [`AriaProperties` automation element property identifiers](https://learn.microsoft.com/en-us/previous-versions/dd757479(v=vs.85)) / [`CachedAriaProperties`](https://learn.microsoft.com/en-us/previous-versions/dd375584(v=vs.85))
- [Microsoft Q&A: taskbar button count not guaranteed](https://learn.microsoft.com/en-us/answers/questions/1483214/win11-22h2-(10-0-22621)-cant-support-tb-buttoncoun)
- [WinUI InfoBadge control](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/info-badge)
- [Graph: `chat` resource](https://learn.microsoft.com/en-us/graph/api/resources/chat?view=graph-rest-1.0) / [`chatViewpoint`](https://learn.microsoft.com/en-us/graph/api/resources/chatviewpoint?view=graph-rest-1.0) / [List chats](https://learn.microsoft.com/en-us/graph/api/chat-list?view=graph-rest-1.0) / [`markChatUnreadForUser`](https://learn.microsoft.com/en-us/graph/api/chat-markchatunreadforuser?view=graph-rest-1.0)
- [Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference) / [App registration](https://learn.microsoft.com/en-us/graph/auth-register-app-v2) / [Teams API licensing](https://learn.microsoft.com/en-us/graph/teams-licenses) / [Throttling limits](https://learn.microsoft.com/en-us/graph/throttling-limits)
- [Change notifications for chats](https://learn.microsoft.com/en-us/graph/teams-changenotifications-chat) / [for channel/chat messages](https://learn.microsoft.com/en-us/graph/teams-changenotifications-chatmessage)
- [New Teams bulk-install / architecture](https://learn.microsoft.com/en-us/microsoftteams/new-teams-bulk-install-client) / [Classic Teams retirement](https://learn.microsoft.com/en-us/microsoftteams/teams-client-bulk-install)
- [WebView2 user data folder](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder) / [Evergreen vs fixed version](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/evergreen-vs-fixed-version) / [Remote debugging (VS Code guide)](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/debug-visual-studio-code)
- [WebView2Feedback #4709 (cannot hot-attach CDP)](https://github.com/MicrosoftEdge/WebView2Feedback/issues/4709)
- [Catch up with and manage badge count activity in Microsoft Teams](https://support.microsoft.com/en-us/teams/notifications-settings/catch-up-with-and-manage-badge-count-activity-in-microsoft-teams) (badge semantics)
- [Use a screen reader to chat in Microsoft Teams](https://support.microsoft.com/en-us/office/use-a-screen-reader-to-chat-in-microsoft-teams-c99901c9-00dc-44d4-8921-4aa120bf298b) / [navigate chats/channels](https://support.microsoft.com/en-us/accessibility/teams/use-a-screen-reader-to-navigate-and-explore-the-new-chats-and-channels-experience-in-microsoft-teams) / [check recent activity](https://support.microsoft.com/en-US/accessibility/teams/use-a-screen-reader-to-check-recent-activity-in-microsoft-teams)
- [Microsoft Accessibility Conformance Reports index](https://www.microsoft.com/en-us/accessibility/conformance-reports)
- [`teams-for-linux`](https://github.com/IsmaelMartinez/teams-for-linux) (title-mutation technique, not applicable to the native client) / [`Teams-Auto-Hide`](https://github.com/VoltaicGRiD/Teams-Auto-Hide) (pixel-based per-chat dot detection)
- [`tdesktop` "Total unread count" window-title setting](https://github.com/telegramdesktop/tdesktop/issues/25862) (confirmed contrast with Teams)

## Questions that require product-owner decisions

- Is the Teams account used day to day a work/school (Microsoft 365/Entra ID) account, or a personal Microsoft account? This alone determines whether Graph is even theoretically reachable, independent of the credentials-policy question.
- Is a partial count (the "unread chats" component only, explicitly labeled as such) an acceptable notion of "exact," or must any solution match the literal rendered badge digit for digit, including mention-channel and followed-thread contributions?
- During the candidate-1 experiment, is it acceptable to read a chat row's `Name` transiently in developer-only, non-persisted debug output while searching for a pattern, or must the experiment be designed to never touch `Name` at all, even during development?
- Would the no-credentials/no-OAuth constraint ever be reconsidered specifically and narrowly for this one signal, or should that remain permanently closed regardless of Graph's technical fit?
- Given that OCR's own precondition (locating the badge's screen coordinates) is independently unreliable per Microsoft, is a separately-approved OCR experiment still worth keeping on a future roadmap at all, or should it be dropped rather than merely deprioritized?

## Final recommendation

**Continue with a supported local approach** — specifically, run the single bounded chat-list UI Automation experiment described above, time-boxed to two sessions, with the stop conditions above treated as binding. This is not a claim that Teams' exact count is proportionately obtainable; it is a claim that one concrete, cheap, falsifiable, principle-compliant hypothesis remains untested, and that concluding "not obtainable" or reaching for Graph/OCR before trying it would be premature. If the experiment fails any stop condition, the honest next state is to keep the already-shipped boolean `needsAttention` signal for Teams and stop pursuing an exact count through Windows-local means — not to escalate to Graph or OCR by default.
