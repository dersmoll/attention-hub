# Teams exact unread count — independent technical investigation (Kimi)

- Date: 2026-08-10
- Basis: `docs/vision.md`, `docs/architecture.md`, `docs/milestones/milestone-0-notification-spike.md`, ADR 0003, `docs/milestones/evidence/m0/2026-08-10-source-transition-validation.md`, `src-tauri/src/attention_signals/windows_adapter.rs`, all `docs/plans/*.md`, plus fresh research against primary Microsoft sources (links at the end).
- This document is analysis only. No implementation or other documentation was modified.

## Executive recommendation

**Continue with a supported local approach — one deeper, still-bounded UI Automation experiment targeting Teams' chat-list item accessible names (candidate A below).** The current probe inspected the taskbar tree and Teams' *navigation* controls, but not the *chat list items*, which are the elements a screen reader must announce as unread (Microsoft's own screen-reader documentation confirms Teams is designed to expose per-conversation unread state to assistive technology). This is a pure extension of the already-authorized ADR 0003 probe: read-only, same pattern, no new dependencies, no packaging.

If that experiment fails, **accept boolean-only Teams state as the product default.** `needsAttention` is already accurate and honest; an exact count is a refinement, not a prerequisite. OCR is a separately approvable last resort, not a fallback to adopt by momentum. Microsoft Graph and local IndexedDB parsing are both poor fits for this product's constraints and are recommended against (reasons below). A negative result here is a legitimate and useful outcome.

## The semantic question: what the badge number actually is (CONFIRMED)

Microsoft's official support documentation settles this: the taskbar number is **not** an unread-message count.

> "The badge count number displayed on the Teams taskbar icon is a sum of counts from the Chat, Teams, and Activity apps."
>
> - Chat/Teams: +1 for every unmuted one-on-one, group, or meeting chat with unread content; +1 per channel with an unread personal/tag @mention; +1 per unread followed thread. Muted chats do not contribute. Clears when the item is opened or marked read.
> - Activity: number of new activity items since the last visit.

So the number is a **count of unread/attention conversations and activity items**, computed by Teams client-side from chat state, mute state, mention state, and activity-feed visits. Two consequences:

1. Any approach that counts *messages* (Graph message listing, IndexedDB messages) will systematically disagree with the badge, because the badge counts *conversations/items* and excludes muted chats.
2. Attention Hub must never label this signal "unread messages." The honest kind name is something like `badgeItems` / `unreadConversations`. This matches the architecture doc's existing practice of keeping `kind`/`meaning` explicit.

## Confirmed vs. hypothetical

### Confirmed (official Microsoft documentation)

| Claim | Status |
| --- | --- |
| Taskbar/badge APIs (`ITaskbarList3/4`, WinAppSDK `BadgeNotificationManager`, WinRT `BadgeUpdateManager`) are **setter-only** for the caller's own app; no cross-process getter exists. | Confirmed |
| `BadgeUpdateManager.CreateBadgeUpdaterForApplication(id)` is restricted to apps **in the same package**. | Confirmed |
| `UserNotificationListener.GetNotificationsAsync` supports only `NotificationKinds.Toast`; the enum has **no badge kind**. The existing listener cannot enumerate badges, period. | Confirmed |
| Badge count semantics (Chat + Teams + Activity sum, muted chats excluded) per Microsoft Support. | Confirmed |
| New Teams is WebView2-based, MSIX-packaged (`MSTeams_8wekyb3d8bbwe`, `ms-teams.exe`). | Confirmed |
| Graph has a `chat.viewpoint.lastMessageReadDateTime` (v1.0), but **no unread-count endpoint**; per-message "seen" status is not exposed. | Confirmed |
| Graph chat APIs (delegated) require OAuth sign-in with a **work/school account only** — personal Microsoft accounts are unsupported. | Confirmed |
| Graph `chat.lastUpdatedDateTime` is documented-by-users unreliable (known bug; Microsoft Q&A), so `viewpoint` vs `lastUpdatedDateTime` comparison is not a dependable unread-chats signal. | Confirmed (community + Q&A) |
| Tenant consent for `Chat.Read`/`Chat.ReadWrite` is tightening (MC1163922: admin consent required under Microsoft-managed default policy, rolling out Oct–Nov 2025). | Confirmed |
| Teams screen-reader experience includes an Unread filter (Ctrl+Alt+U) and per-conversation unread navigation — unread state is part of Teams' accessibility surface. | Confirmed |

### Observed (this project's own evidence)

| Claim | Status |
| --- | --- |
| Taskbar UIA exposes Teams button identity and `Microsoft Teams | New activity` but no number in Name/HelpText/ItemStatus/descendants. | Observed 2026-08-10 |
| Teams nav controls (Activity, Chat) expose labels and shortcuts, no numeric unread. | Observed 2026-08-10 |
| `needsAttention: true → false` transitions track reality. | Observed 2026-08-10 |

### Hypotheses (untested — the point of the experiments below)

- Teams **chat list items** carry per-conversation unread state (and possibly counts) in accessible names. *Unverified on this machine; inferred from screen-reader documentation. This is the single most valuable untested hypothesis.*
- The chat list's UIA subtree is populated (a) when the Chat view has never been opened since launch, and (b) when the window is minimized. Virtualized lists typically materialize only rendered rows; unread conversations may not be visible in the viewport.
- Teams' IndexedDB in LocalCache is readable by a same-user process when copied to a temp location. *Community/forensic evidence, not official.*

### Unsupported assumptions to avoid

- "The badge number is unread messages" — disproven above.
- "The tray/taskbar label format is stable across Teams versions and locales" — no evidence; the current `New activity` matcher is English-only.
- "Graph can reproduce the badge count" — it cannot (no mute state, no unread-count endpoint, unreliable `lastUpdatedDateTime`).

## Candidate approaches, ranked

### A. Deeper Teams-window UIA probe: chat list items (most promising)

Read the full UIA descendant tree of the `ms-teams.exe` main window and look for per-conversation unread markers in accessible names (e.g., patterns like "…, unread" or "N unread"). Screen-reader support is a first-class Teams feature, so unread state must be programmatically determinable somewhere in the tree; the nav controls were the wrong place to look, and the evidence doc only covers those.

- Exact count: plausible for **unread conversations**; summing per-chat unread flags approximates the badge but may diverge by mentions/followed-threads/activity contributions.
- Sender identity: accessible names likely include chat/contact names — available in principle, but the probe should aggregate in-adapter and never let names cross IPC (same privacy precedent as the Outlook adapter, which excludes account names).
- Risk: virtualized list (only visible rows materialized), tree may be absent until Chat view is opened once, combined-vs-separate view layouts differ, English-only matching, version drift.

### B. Teams toast snapshot via the existing `UserNotificationListener` path (supporting signal, not a count)

The listener is already built and works under sparse identity. Teams toasts (when enabled) carry the sender/chat in the title and preview in the body. This gives **sender identity and an incremental activity signal**, never a count, and it requires the user to enable Teams toasts — which conflicts with the "quiet product, no Notification Center noise" principle. Useful later for the secondary "who sent it" goal, with bodies discarded at the adapter boundary.

### C. Microsoft Graph (recommended against)

No endpoint returns unread counts. The closest primitive (`viewpoint.lastMessageReadDateTime` + message listing per chat) cannot reproduce badge semantics (mute state not exposed; `lastUpdatedDateTime` unreliable; mentions/followed threads/activity items not covered). Costs: OAuth sign-in, work/school accounts only, admin-consent tightening, token-cache custody, network dependency. This squarely violates the no-credentials/no-account-aggregation principles **and still fails to answer the exact question**. Do not adopt; if the owner ever reopens this, it must be an explicit principle change recorded as an ADR.

### D. Taskbar badge pixel capture + template matching (last resort, separately approved)

Capture the taskbar region (GDI `PrintWindow`/`BitBlt` on `Shell_TrayWnd`, or `Windows.Graphics.Capture` on the display) and classify the badge: detect the red disc, then template-match digits. A full OCR engine is unnecessary — the glyph set is `0–9` plus the `99+` cap — so a hand-rolled template matcher avoids a heavy dependency. Fragility axes are real: per-monitor DPI scaling, taskbar position/orientation, auto-hide, centered icons, light/dark/high-contrast themes, badge entry/exit animation, maximized windows occluding an auto-hidden taskbar, multi-monitor ordering. Note that OCR here reads only a shell-rendered number — no message content — so its privacy profile is actually better than candidate E. ADR 0003 already requires separate review for OCR; keep that gate.

### E. Teams local IndexedDB parsing (recommended against; document and shelve)

Community/forensic evidence says new Teams stores chat state in plaintext IndexedDB (LevelDB) under `%LocalAppData%\Packages\MSTeams_8wekyb3d8bbwe\LocalCache\...\EBWebView\...`, readable by the same user if the files are copied out (LevelDB lock). Open-source parsers exist. Rejected because: the schema is undocumented and changes with Teams releases; message bodies live in the same stores, so the adapter would be one bug away from retaining private content (the project's constraint explicitly forbids this); the badge logic would have to be reverse-engineered client-side and still wouldn't match muted-chat semantics reliably; and bulk-reading another app's cache is EDR/forensic-tooling territory with bad optics for a product whose selling point is trust. **Explicitly excluded regardless: any decryption of cookies/tokens from the WebView2 profile (DPAPI/app-bound keys) — that is credential extraction and is out of bounds for this project, full stop.**

### F. WebView2 CDP attachment to Teams (excluded)

Possible only by setting `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`/registry policy *before* Teams launches and restarting Teams; WebView2 runtime ≥150 ignores these for elevated hosts, and Teams may strip unknown arguments. More fundamentally, modifying how another application starts is instrumentation, not observation — it crosses the project's own observer boundary. Excluded.

### G. Undocumented Explorer internals (`ITaskItem::GetOverlayIcon`, TB_* messages) (excluded)

Reading these requires injecting into `explorer.exe`; interfaces are undocumented and version-fragile (`TB_BUTTONCOUNT` already broke on Win11 22H2). The Old New Thing is explicit: there is no supported object model for taskbar/notification-area contents. Also note these target overlay *icons*, not the notification-platform badge that renders the number. Excluded; also explicitly out of scope per the task constraints.

## Comparison table

| Approach | Exact count | Future sender identity | Credentials/account access | Supported vs undocumented | Packaging/identity needs | Localization sensitivity | Privacy risk | Expected reliability | Maintenance cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A. Chat-list UIA probe | Likely (unread conversations, badge-approximate) | Possible (chat names in tree; keep out of IPC) | None | Supported API, app-specific semantics | None (unpackaged works) | High (English labels; per-locale tables) | Low (aggregate in-adapter) | Medium (virtualization/view state) | Medium (per-version parser drift) |
| B. Toast snapshot (existing listener) | No (incremental only) | Yes (sender in toast title; discard body) | None | Supported | Sparse identity (already built) | Low (structure, not labels) | Medium (body text transits adapter; discard immediately) | High technically; low product-fit (requires toasts ON) | Low (already built) |
| C. Microsoft Graph | No endpoint; poor reconstruction | Yes (full) | OAuth, work/school only, tenant consent, token custody | Supported API | None for app; tenant app registration required | None | High (cloud access to all chats) | Medium (missing mute state; buggy `lastUpdatedDateTime`) | Medium-High (auth lifecycle, consent policy churn) |
| D. Taskbar OCR/templates | Yes (renders the actual badge) | No | None | Supported capture APIs; unofficial interpretation | None | None (pixels; theme/DPI instead) | Low-Medium (screen ROI capture) | Medium (visual fragility) | Medium-High (OS/theme churn) |
| E. IndexedDB parsing | Computable, approximate | Yes (co-resident with content — the problem) | None (but same folder holds tokens — must never touch) | Undocumented, reverse-engineered | None | None | **High** (message content in same DB) | Medium (cache completeness, schema churn) | High |
| F. WebView2 CDP | Possible via DOM | Possible | None | Documented for own apps; misuse for third-party | Requires altering Teams launch env | None | Medium (full DOM access) | Low (restart required, arg stripping, runtime hardening) | High |
| G. Explorer internals | No (icon, not badge number) | No | None | Undocumented, injection required | None | None | Medium | Very low (version-fragile) | Very high |

## Bounded experiments

### Experiment A1 (primary, do first): chat-list accessible names

- Setup: one known unread private chat (badge shows `1`); Teams on Chat view.
- Action: extend the existing probe in a throwaway branch (or a debug command) to dump `Name`/`AutomationId` of **all** descendants of the `ms-teams.exe` main window to a local scratch file; search for `unread`, bare numerals, and the known contact name's item.
- Variants: window foreground vs minimized; Chat view opened vs never opened since launch; combined vs separate chat/channel list view; scroll so the unread chat is off-screen (tests virtualization).
- Effort: one session; zero new dependencies; reuses `CUIAutomation` plumbing already in `windows_adapter.rs`.
- Pass criterion: a deterministic per-conversation unread indicator exists in accessible names and transitions `1 → 0` when the chat is read. Then, and only then, implement aggregation with in-adapter name discarding.
- Privacy rule for the experiment itself: inspect locally, do not commit names; commit only structural findings (AutomationIds, pattern shapes).

### Experiment A2 (companion): badge-semantics correlation

- With a second account, create mixed states (1 unread chat + 1 mention + 1 activity item; badge = 3) and record which UIA-exposed elements correspond to each contribution. This determines whether the accessible surface can reproduce the badge number or only the chat subset — decide in advance that a chat-subset count is still useful if labeled honestly (`unreadConversations`, not `badgeItems`).

### Experiment B1 (secondary, later-milestone candidate): toast sender metadata

- Enable Teams toasts temporarily; receive messages from two senders; record toast title/group/replacement metadata from the existing listener snapshot. Bodies discarded in the adapter.
- Pass criterion: sender identity and per-chat grouping are stable across messages.
- Note: only viable if the owner accepts Teams toasts staying enabled, which is a product trade-off, not a technical one.

### Experiment D1 (only if A fails and owner approves OCR): badge template matcher

- Capture taskbar ROI across a matrix: DPI 100/150/200%, light/dark, taskbar bottom/left, auto-hide on/off, badge values 1, 9, 10, 99, 100+.
- Hand-rolled digit templates; target ≥99% classification accuracy across the matrix before any integration.
- Hard constraint: capture only the badge ROI; no full-screen capture, no persistence of pixels.

### Experiment E1 (only if owner explicitly overrides the recommendation): offline IndexedDB feasibility

- Copy (never open in place) the IndexedDB directory while Teams runs; attempt unread-state computation with an existing open-source parser **without extracting message bodies**.
- Stop immediately if any step requires decryption, elevation, or content access. Even on success, the recommendation remains against adoption for privacy/maintenance reasons; this experiment exists only to keep the negative result evidence-based.

## Stop conditions

- **Global:** if A1+A2 show no per-conversation unread surface after the listed variants, stop pursuing local count extraction for Teams and ship boolean-only. Do not escalate to C/E/F/G by momentum.
- **A:** if counts require scrolling/virtualization control to materialize (ScrollItem/Scroll patterns) — that is UI control of the source app, explicitly forbidden. Stop that branch.
- **B:** if Teams toasts must stay enabled permanently, and the owner does not accept that trade-off, drop it.
- **D:** if the accuracy matrix cannot reach the target, or capture requires consent dialogs the product can't explain, stop.
- **E:** any requirement for decryption, elevation, closing Teams, or message-content access — stop immediately.
- **C:** unless the owner formally changes the no-credentials principle via ADR, do not prototype.

## Architectural implications for Tauri/Rust

- **A** extends the existing `attention_signals` module with a third Teams probe alongside the tray label; same `CUIAutomation` usage, same DTO/IPC boundary, same test boundary (synthetic label-parser unit tests + manual integration evidence). No new crates, no packaging change. Add `kind: "unreadConversations"` (or similar) with an explicit `meaning` string; never "unreadMessages".
- **B** reuses the `notifications` module and the opt-in sparse-identity build; orthogonal to A.
- **D** would add GDI capture via the existing `windows` crate plus a small template matcher; keep it behind the OCR-approval gate and a feature flag. Resist adding an OCR crate — the digit set is closed.
- **Polling cadence:** a chat-list probe inherits the open Milestone 1 question about the 2-second full-traversal refresh; chat-list trees are larger than the tray, so this strengthens the case for UIA property-change/window events or adaptive refresh before productionizing.
- **Process matching:** `ms-teams.exe` should be matched by executable name like `olk.exe`/`telegram.exe` today; confirm the process name on the dev machine during A1 (new Teams) — classic Teams (`Teams.exe`, Electron) is end-of-availability since July 2025 and should not be targeted.

## Questions for the product owner

1. **Is the semantic match acceptable?** The best supported local outcome is "unread conversations" (badge-approximate), not "unread messages." Is that the number you actually want on the panel, given the badge itself counts conversations/items?
2. **Toasts for sender identity:** would you permanently enable Teams toast notifications to gain sender identity later (B1)? This conflicts with the quiet-product principle and needs your explicit trade-off.
3. **OCR gate:** if A fails, do you want to authorize the D1 experiment, or is boolean-only the final answer?
4. **IndexedDB:** confirm categorical exclusion of local-database parsing (recommended), so it doesn't resurface.
5. **Account type:** is your Teams a work/school account or personal? Graph is impossible for personal accounts regardless of the credentials question — this closes C for many setups.
6. **Localization:** is English-only matching acceptable for the dogfood phase (as with Outlook's Inbox labels), with a per-locale table as later work?

## Final recommendation

**Continue with a supported local approach** — run experiment A1/A2 (chat-list UIA). It is the only candidate that can plausibly deliver an exact-ish count while honoring every stated constraint, and it is cheap to test. If it fails: **accept boolean-only Teams state** as the designed behavior (`New activity` is already accurate and honest), keep the toast listener in reserve for future sender identity if the owner accepts toasts, and treat OCR (D) as a separately approved experiment rather than a default. Do not adopt Graph (C) or IndexedDB parsing (E): both fail the project's constraints, and Graph additionally fails the exact question itself.

## Official sources

Badge semantics and Teams behavior:

- Microsoft Support: [Catch up with and manage badge count activity in Microsoft Teams](https://support.microsoft.com/en-us/teams/notifications-settings/catch-up-with-and-manage-badge-count-activity-in-microsoft-teams)
- Microsoft Support: [Use a screen reader to navigate and explore the new chats and channels experience in Microsoft Teams](https://support.microsoft.com/en-us/accessibility/teams/use-a-screen-reader-to-navigate-and-explore-the-new-chats-and-channels-experience-in-microsoft-teams)
- Microsoft Support: [Keyboard shortcuts for Microsoft Teams](https://support.microsoft.com/en-us/accessibility/teams/keyboard-shortcuts-for-microsoft-teams)

Windows APIs:

- [`ITaskbarList3`](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nn-shobjidl_core-itaskbarlist3) (setter-only surface)
- [Windows App SDK `BadgeNotificationManager`](https://learn.microsoft.com/en-us/windows/windows-app-sdk/api/winrt/microsoft.windows.badgenotifications.badgenotificationmanager) (own-app badge setters)
- [`BadgeUpdateManager.CreateBadgeUpdaterForApplication`](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.badgeupdatemanager.createbadgeupdaterforapplication) (same-package restriction)
- [`NotificationKinds` enum](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.notificationkinds) (Unknown/Toast only — no badge enumeration)
- [Notification area guidance](https://learn.microsoft.com/en-us/windows/win32/shell/notification-area) ("no supported object model for notification icons")
- [The Old New Thing: enumerating notification-area icons](https://devblogs.microsoft.com/oldnewthing/20250929-00/?p=111637)
- [`PrintWindow`](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-printwindow), [`GraphicsCaptureItem.TryCreateFromDisplayId`](https://learn.microsoft.com/en-us/uwp/api/windows.graphics.capture.graphicscaptureitem.trycreatefromdisplayid)

Graph:

- [`chatViewpoint` resource](https://learn.microsoft.com/en-us/graph/api/resources/chatviewpoint), [List chats](https://learn.microsoft.com/en-us/graph/api/chat-list), [List chat messages](https://learn.microsoft.com/en-us/graph/api/chat-list-messages) (personal accounts: Not supported)
- [Microsoft Graph permissions overview](https://learn.microsoft.com/en-us/graph/permissions-overview)
- [Desktop app token acquisition (device code / WAM)](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-acquire-token-device-code-flow)

Teams architecture / local data (community & forensic — non-official, cited for feasibility assessment only):

- [Microsoft Teams: Advantages of the new architecture](https://techcommunity.microsoft.com/blog/microsoftteamsblog/microsoft-teams-advantages-of-the-new-architecture/3775704)
- [Classic Teams end of availability](https://learn.microsoft.com/en-us/microsoftteams/teams-classic-client-end-of-availability)
- [forensics.im: Parsing Microsoft Teams IndexedDB](https://forensics.im/blog/parsing-microsoft-teams-indexeddb/)
- [WebView2 remote debugging](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/remote-debugging-desktop) and [runtime v150 hardening discussion](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5645)
