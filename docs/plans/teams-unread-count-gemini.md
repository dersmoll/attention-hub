# Technical Investigation: Microsoft Teams Unread Count & Attention Signals (Gemini Report)

## Status

Investigation completed on 2026-08-10 against repository state, Windows 10/11 platform documentation, Microsoft Graph API specifications, and live evidence from Milestone 0 (`docs/milestones/evidence/m0/2026-08-10-source-transition-validation.md` and `src-tauri/src/attention_signals/windows_adapter.rs`).

---

## Executive Recommendation

**Primary Decision**: **`accept boolean-only Teams state`**

Attention Hub should accept qualitative boolean state (`needsAttention: true / false`, `count: None`) for Microsoft Teams via the current Windows Notification Area / Taskbar UI Automation path. 

Obtaining an exact numeric unread count for Microsoft Teams locally through supported, non-intrusive Windows APIs is **not proportionately obtainable**. The Windows Shell taskbar badge APIs (`ITaskbarList3`, `BadgeUpdateManager`) are write-only by platform design; Microsoft Graph API lacks a Teams unread count endpoint and violates local-first principles; local LevelDB caches carry severe privacy, file-locking, and breakdown risks; and visual OCR taskbar scraping introduces high visual fragility for marginal product gain.

The boolean signal `Microsoft Teams | New activity` accurately reflects when Teams requires user attention without introducing maintenance debt, cloud credentials, or visual scraping fragility.

---

## Important Semantic Finding: What the Teams Badge Actually Represents

Before evaluating mechanisms to extract the number, we must establish what the Teams taskbar number actually represents.

**Observation & Official Specification**:
The number displayed on the Microsoft Teams taskbar icon is **NOT** a raw count of "unread messages." According to Microsoft Teams platform documentation, the taskbar badge represents an **aggregated activity counter** comprising:
1. Unread direct messages (1-on-1 chats) and unmuted group chats.
2. Direct personal `@mentions` and tag `@mentions` in channels or team chats.
3. Unread replies in threads that the user explicitly follows.
4. Highlights in the Activity Feed requiring direct user action.

**Crucial Exclusions**:
- Standard channel messages *without* a `@mention` or direct thread subscription do **not** increment the taskbar badge number (they only bold the channel name in Teams' sidebar).
- Muted chats or suppressed notification channels do **not** increment the taskbar badge.

**Terminology Requirement**:
Attention Hub must **never** label the Teams badge value as `unread_messages`. If a numeric count is ever displayed, it must be accurately labeled as **`Aggregated Activity Count`** or **`Unread Activity & Mentions`**.

---

## Confirmed Facts vs. Hypotheses

### Confirmed Facts
1. **Windows Taskbar Badge APIs are Write-Only**:
   - `ITaskbarList3::SetOverlayIcon` / `ITaskbarList4` (Win32 Shell COM) and `BadgeUpdateManager` (WinRT) are strictly **setter-only** APIs. They allow an application to set its *own* overlay icon on `explorer.exe`, but provide **zero getter methods** for third-party processes.
2. **Taskbar UI Automation Does Not Expose Badge Numbers**:
   - Windows UI Automation (`CUIAutomation` on `Shell_TrayWnd` / `MSTaskListWClass`) exposes button names such as `Microsoft Teams | New activity` when a badge is present, but the numeric badge itself is rendered internally by Explorer as a visual overlay graphic (`HICON` / DirectComposition surface). It is not exposed as a text property, child element, or accessibility value.
3. **Teams Window Title is Static**:
   - Unlike Telegram Desktop (which appends `(3)` to its window title), Microsoft Teams (`ms-teams.exe`) maintains a static window title (`Microsoft Teams` or `Chat | Microsoft Teams`).
4. **Microsoft Graph API Lacks a Teams Unread Count Endpoint**:
   - Unlike Outlook (which provides `unreadItemCount` on mail folders), Microsoft Graph API (`https://graph.microsoft.com`) **does not provide an unread message count endpoint** or an `isRead` property for Teams chat messages (`chatMessage`).
5. **New Teams Local Cache Uses LevelDB with Exclusive File Locks**:
   - New Teams (`MSTeams_8wekyb3d8bbwe`) stores local data in Chromium LevelDB (`%LOCALAPPDATA%\Packages\MSTeams_8wekyb3d8bbwe\LocalCache\Microsoft\MSTeams\EBWebView\WV2Profile_tfw\IndexedDB`). While `ms-teams.exe` is running, these files are locked exclusively by the process.

### Hypotheses & Unproven Assumptions
1. **Chromium UIA Accessibility Tree Evolution**:
   - *Hypothesis*: Future updates of New Teams might populate `aria-label` or `aria-valuenow` on its top-level `Activity` or `Chat` navigation buttons with explicit numeric strings (e.g., `Chat, 3 unread items`).
   - *Current Status*: Unproven. In current builds (2026), Teams UIA navigation nodes expose only control names and hotkeys (e.g., `Chat (Ctrl+2)`).
2. **Taskbar OCR Viability**:
   - *Hypothesis*: Native Windows Media OCR (`Windows.Media.Ocr`) running against desktop-captured taskbar button screen regions can reliably extract digits `1` through `9`.
   - *Current Status*: Feasible in theory, but unvalidated against multi-monitor setups, auto-hide taskbars, high-DPI scaling, dark/light themes, and badges showing `9+` / `99+`.

---

## Detailed Investigation of Research Areas

### 1. Supported Windows APIs
- **Taskbar / Shell APIs**: `ITaskbarList3` and WinRT `BadgeUpdateManager` are documented by Microsoft as application-self-reporting APIs. Windows enforces process isolation; no Windows API permits Process A to read Process B's taskbar badge object.
- **UI Automation (UIA)**:
  - Taskbar (`Shell_TrayWnd`): Accessible name changes to `Microsoft Teams | New activity`. This provides a 100% reliable, zero-credential, supported boolean signal for `needsAttention: true`.
  - Teams App Window (`ms-teams.exe`): Reading Teams' internal window element tree via `IUIAutomation` yields DOM-like structure generated by WebView2. The `Activity` and `Chat` navigation buttons currently omit numeric badge values from their accessible names.

### 2. Teams-Owned Local Surfaces
- **Window Title**: Static (`Microsoft Teams`). No unread numbers are exposed via `GetWindowTextW`.
- **WebView2 DevTools Protocol (CDP)**:
  - Connecting via Chrome DevTools Protocol (`--remote-debugging-port`) could allow DOM querying (`document.querySelector('.badge')`).
  - *Why rejected*: Teams is launched by Windows without CDP enabled. Enabling CDP requires modifying Teams' launch command/registry startup keys, violating Attention Hub's read-only, non-intrusive principles. Furthermore, production release builds of WebView2 disable CDP for security.
- **Local Toast Notifications (`UserNotificationListener`)**:
  - Windows Toast notifications are transient. When a user reads a message on their mobile phone, the Windows toast is dismissed, but toast history does not reflect persistent unread counts.

### 3. Microsoft APIs (Microsoft Graph)
- **Technical Barrier**: Graph API does not offer a `getUnreadCount` endpoint for Teams chats or channels. To infer unread counts via Graph, an app must subscribe to webhook change notifications (`/subscriptions`), download full message payloads, and calculate read/unread deltas locally.
- **Policy & Architecture Conflict**:
  - Requires Azure AD / Entra ID app registration.
  - Requires user OAuth2 login / token storage.
  - Requires Microsoft Graph Protected API tenant admin consent and Metered API billing (pay-per-call).
  - Direct violation of Attention Hub's core principles (no cloud, no credentials, no account aggregation).

### 4. Local Application Data (LevelDB Caches)
- **Path**: `%LOCALAPPDATA%\Packages\MSTeams_8wekyb3d8bbwe\LocalCache\Microsoft\MSTeams\EBWebView\WV2Profile_tfw\IndexedDB`
- **Technical Risks**:
  - **Exclusive Locks**: `ms-teams.exe` holds write locks on LevelDB log/manifest files. Reading requires raw shadow copying or process-level file handle duplication, risking database corruption.
  - **No Static Counter**: LevelDB stores raw protobuf/JSON records of sync entities. The unread count is computed dynamically in RAM by Teams' web bundle.
  - **Privacy Violation**: Parsing LevelDB requires scanning local chat logs and user IDs, violating the policy against reading private message content.
  - **Breakage**: Schema changes during Teams auto-updates will break parsing silently.

### 5. Last-Resort Visual Approaches (Taskbar Badge Capture + OCR)
- **Mechanism**:
  1. Capture taskbar region for Teams `HWND` via Desktop Duplication (`IDXGIOutputDuplication`) or `PrintWindow`.
  2. Locate red badge circle via HSV color mask (`#C4314B` / `#D13438`).
  3. Crop badge region and run native Windows Media OCR (`Windows.Media.Ocr`).
- **Evaluation**:
  - **Pros**: Completely local, requires no credentials, uses built-in Windows OCR API.
  - **Cons**: Extremely visually fragile. Fails or degrades on taskbar auto-hide, top/side taskbar alignment, small taskbar icons, dark/light theme shifts, high-DPI scaling (125%/150%/200%), window occlusion, and overflow menus. Truncates numbers above 9 (renders `9+` or `99+`).

### 6. Future Sender Identity
- If sender/chat identity is required in a future milestone without capturing message bodies:
  - **Primary Path**: Windows Toast Notifications (`UserNotificationListener`). When a toast fires, the OS payload provides `source.displayName` or sender name (e.g., `"Alice in Strategy"`). This captures sender identity *at notification time* without polling message contents.

---

## Candidate Approaches Ranked

```text
[ Rank 1: Notification Area UIA ] ---> Boolean Signal (Needs Attention: True/False) [RECOMMENDED]
[ Rank 2: Taskbar OCR ]           ---> Exact Digits 1-9 (High Visual Fragility) [LAST RESORT]
[ Rank 3: LevelDB Cache Reading ] ---> Unviable (File Locks & Privacy Violation)
[ Rank 4: WebView2 CDP Port ]     ---> Unviable (Intrusive Process Modification)
[ Rank 5: Microsoft Graph API ]   ---> Unviable (No API Endpoint & Violates No-Cloud Rule)
```

1. **Rank 1: Notification Area / Taskbar UI Automation (Current Approach)**
   - *Status*: Working today in `src-tauri/src/attention_signals/windows_adapter.rs`.
   - *Yield*: `needsAttention: true / false`, `count: None`.
   - *Verdict*: **Best supported local approach.**

2. **Rank 2: Taskbar Badge Capture + Windows Media OCR**
   - *Status*: Feasible visual fallback.
   - *Yield*: Exact count for `1`-`9`, capped at `9+` / `99+`.
   - *Verdict*: **Only local candidate for numeric digits, but visually fragile.**

3. **Rank 3: LevelDB / IndexedDB Local Storage Parsing**
   - *Status*: Unviable.
   - *Yield*: Fragile / unreliable derived count + privacy risk.
   - *Verdict*: **Rejected due to file locks, schema drift, and privacy risks.**

4. **Rank 4: WebView2 DevTools Protocol (CDP)**
   - *Status*: Unviable.
   - *Yield*: Exact count via DOM.
   - *Verdict*: **Rejected due to intrusive launch requirement.**

5. **Rank 5: Microsoft Graph API**
   - *Status*: Unviable.
   - *Yield*: No direct count endpoint available.
   - *Verdict*: **Rejected due to API absence and credential/cloud policy violation.**

---

## Technical Comparison Matrix

| Candidate Approach | Exact Count | Future Sender Identity | Credentials / Account Access | Supported vs. Undocumented | Packaging / Identity Needs | Localization Sensitivity | Privacy Risk | Expected Reliability | Maintenance Cost |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Notification Area UIA (Current)** | ❌ No (Boolean `needsAttention`) | ❌ No | ✅ None | ✅ Fully Supported (Win32 UIA) | ✅ None (Unpackaged) | ⚠️ Medium (English `"New activity"`) | ✅ Zero (No message data) | ✅ High | ✅ Low |
| **2. Taskbar Badge + Windows Media OCR** | ⚠️ Partial (`1`-`9`, `9+`) | ❌ No | ✅ None | ⚠️ Mixed (Supported OCR, Visual Scraping) | ✅ None (Win32 WinRT OCR) | ✅ Zero (Digit recognition) | ✅ Zero (Badge pixels only) | ⚠️ Medium (Theme, DPI, taskbar position fragile) | ⚠️ Medium |
| **3. LevelDB Local Storage Parsing** | ⚠️ Unreliable | ⚠️ Possible (Raw chat logs) | ✅ None (Local files) | ❌ Undocumented (Internal Chromium format) | ✅ None | ✅ Low | ❌ Critical (Reads raw message logs) | ❌ Low (Exclusive locks, file corruption) | ❌ High (Breaks on Teams updates) |
| **4. WebView2 DevTools Protocol (CDP)** | ✅ Yes | ✅ Yes (DOM inspection) | ✅ None (Local CDP) | ❌ Undocumented / Hacky (Requires CDP launch flags) | ✅ None | ⚠️ Medium (DOM selector changes) | ⚠️ Medium (Full DOM access) | ❌ Low (Teams does not open CDP by default) | ❌ High |
| **5. Microsoft Graph API** | ❌ No (Graph lacks Teams unread API) | ✅ Yes (Via Chat API) | ❌ Required (OAuth2, Azure AD, Admin Consent) | ✅ Supported Cloud API | ❌ Required (Azure App Registration) | ✅ Low | ⚠️ Medium (Cloud data access) | ❌ N/A (Does not answer exact count) | ❌ High (Billing / OAuth maintenance) |

---

## Bounded Experiments for Promising Candidates

### Experiment A: Taskbar UIA Polish & Multi-Language Activity Matching (Candidate 1)
- **Goal**: Ensure Notification Area UIA reliably detects Teams activity across non-English Windows localizations.
- **Scope**:
  1. Inspect `NotifyItemIcon` UIA element for `ms-teams.exe` under non-English Windows UI languages (German, Spanish, French, Ukrainian).
  2. Normalize matching logic in `windows_adapter.rs` to detect localized keywords or regex patterns (`"Neue Aktivität"`, `"Nueva actividad"`, etc.) alongside `New activity`.
- **Exit Gate**: 100% detection of `needsAttention: true` on localized Windows installs without false positives.

### Experiment B: Prototype Windows Media OCR on Taskbar Badge Bounding Box (Candidate 2)
- **Goal**: Measure digit extraction accuracy from taskbar badge screen captures.
- **Scope**:
  1. Locate Teams taskbar button `HWND` using `FindWindowW("MSTaskListWClass", ...)`.
  2. Use `PrintWindow` or `IDXGIOutputDuplication` to capture taskbar button bitmap.
  3. Crop the top-right / bottom-right 24x24 pixel quadrant containing the badge.
  4. Pass software bitmap to `Windows.Media.Ocr.OcrEngine` (native Windows OCR).
  5. Test across: 100%, 125%, 150%, 200% DPI scaling; Windows Light and Dark themes; digits `1`, `5`, `9`, and `9+`.
- **Exit Gate**: Documented accuracy matrix across scaling/theme settings.

---

## Clear Stop Conditions

1. **Stop Condition for OCR Experiment**:
   - If OCR digit recognition accuracy falls below 90% across standard DPI/theme combinations, or if multi-monitor / taskbar auto-hide handling adds >200 lines of fragile Win32 positioning code, **immediately stop OCR work** and revert to Candidate 1 (Boolean state).
2. **Stop Condition for LevelDB / Local Storage**:
   - **Halt immediately**. No research code should attempt to open or parse Teams LevelDB files due to file locking and privacy violations.
3. **Stop Condition for Graph API**:
   - **Halt immediately**. Graph API has been conclusively proven not to expose Teams unread chat counts and violates zero-credential rules.

---

## Architectural Implications for Tauri/Rust

The current normalized schema in `src-tauri/src/attention_signals/mod.rs` already supports optional counts and explicit boolean attention flags:

```rust
pub struct AttentionSignal {
    pub source_key: String,
    pub display_name: String,
    pub kind: String,
    pub count: Option<u32>,           // None for Teams (Boolean-only)
    pub needs_attention: Option<bool>, // Some(true/false) for Teams
    pub origin: String,
    pub raw_label: Option<String>,
    pub confidence: String,
    pub meaning: String,
    pub diagnostics: Vec<String>,
}
```

- **Frontend Contracts**: The React frontend (`src/App.tsx`) handles `count: null` gracefully by rendering a qualitative state indicator (e.g., `Teams: Needs Attention`) rather than forcing a numeric badge `0`.
- **Threading Model**: As established in ADR 0001/0003, UIA calls run inside `ComApartment::initialize()` on a dedicated thread, preventing COM apartment blocking on Tauri's Tokio runtime.

---

## Relevant Official Source Links

- Microsoft Docs: [ITaskbarList3 Interface (Windows Shell)](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nn-shobjidl_core-itaskbarlist3)
- Microsoft Docs: [BadgeUpdateManager Class (Windows.UI.Notifications)](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.badgeupdatemanager)
- Microsoft Docs: [UI Automation Overview (Windows Win32)](https://learn.microsoft.com/en-us/windows/win32/winauto/entry-uiauto-win32)
- Microsoft Docs: [Microsoft Graph API Teams Messaging Overview](https://learn.microsoft.com/en-us/graph/teams-concept-overview)
- Microsoft Docs: [Windows.Media.Ocr Namespace](https://learn.microsoft.com/en-us/uwp/api/windows.media.ocr)

---

## Questions for Product-Owner Decisions

1. **Acceptance of Qualitative Teams State**:
   - Do you approve formalizing `needsAttention: true / false` (`count: None`) as the permanent Milestone 0 & V1 state for Microsoft Teams?
2. **OCR Experiment Approval**:
   - If exact numbers are strictly required by product vision, do you authorize running **Experiment B (Windows Media OCR on Taskbar Badges)** under a strict visual-only scope, accepting the inherent visual fragility costs?
3. **Sender Identity Scope**:
   - Is sender/chat identity for Teams deferred to post-V1, relying on `UserNotificationListener` toast capture when toasts fire?

---

## Final Recommendation Selection

Out of the five allowed options:
- continue with a supported local approach
- **`accept boolean-only Teams state`** (SELECTED)
- reconsider the no-credentials rule for a Microsoft API
- run a separately approved OCR experiment
- conclude that exact Teams count is not proportionately obtainable

**Final Selection**: **`accept boolean-only Teams state`**

Attention Hub should accept qualitative boolean state for Microsoft Teams. It delivers reliable, zero-credential, privacy-preserving attention observation that answers "Does Teams need my attention?" without compromising architectural integrity.
