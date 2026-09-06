# Milestone 3A — Attention-First Daily-Use Panel (Feasibility Review & Proposal)

- Date: 2026-08-11
- Reviewer: Senior Windows Shell, DWM, UI Automation, Rust, & Tauri Reviewer
- Status: Completed (Discussion-Only Milestone Audit)
- Target File: `docs/council/milestone-3/2026-08-11-milestone-3a-attention-first-daily-panel-gemini.md`

---

## 1. Strategic Assessment: Value of Milestone 3A

### Is Milestone 3A the most valuable next step?

**Yes.** Milestone 3A is unambiguously the highest-value next step for Attention Hub.

1. **Calendar awareness is blocked by external policy**:
   - Milestone 1 (`AppointmentStore`) returned stale legacy Windows Mail/Calendar data.
   - Milestone 2 (`Microsoft Graph`) is paused pending organizational Entra registration and consent.
   - Milestone 2A (`M365 Calendar Companion`) proved that the accessibility surface disappears when the flyout closes.
   - Reopening calendar without new platform APIs or tenant approvals will yield no new progress.

2. **The current React screen impedes daily dogfooding**:
   - The current UI was built as an diagnostic harness. It places paused Graph reports and 13 legacy calendar rows at the top, pushing live Telegram, Outlook, and Teams signals off-screen or into dense debug tables.
   - Per Attention Hub's core vision (`docs/vision.md`), capabilities should only be added after *real daily use demonstrates value*. A developer cannot evaluate whether Attention Hub reduces attention fragmentation if using the app requires navigating a multi-page debug harness.

3. **High leverage, zero backend risk**:
   - Re-architecting the frontend presentation into a compact daily-use panel requires zero changes to the underlying native snapshot model, preserves the 2-second non-overlapping refresh loop, and elevates validated signals into an immediate visual summary.

---

## 2. Critique: Adopt, Modify, Reject

### Adopt
- **Elevate Proven Source-Owned Signals**: Telegram (unread chats + app counter), New Outlook (Inbox count), and Teams (qualitative `activityStatus`) form the primary experience.
- **Strict Semantic Separation**: Source-owned semantics remain unmerged (no artificial "Total Unread: 15" sum).
- **Explicit State Classification**: Distinguish `All Clear (Zero)`, `Needs Attention`, `Unavailable`, `Failed`, and `Stale`.
- **Collapsible Technical Section**: Relegate raw WinRT toasts, Graph Phase 0 reports, AppointmentStore rows, and raw UIA metadata into an expandable `<details>` section at the bottom, ensuring zero diagnostic evidence is lost.
- **Session-Only Teams DWM Mirror Control**: Co-locate the visual DWM crop toggle directly within the Teams card, defaulting to disabled.

### Modify
- **Explicit Stale Detection Rule**: Define stale state deterministically: if `capturedAt` is >6 seconds old relative to local clock, or if an IPC error occurs, immediately dim the primary cards and display a `Stale (as of HH:MM:SS)` warning.
- **Teams DWM Mirror Fallback State**: The Teams mirror control must handle Teams minimization gracefully. If Teams is minimized or off-screen, display a clean `"Mirror Unavailable (Teams Window Hidden)"` placeholder rather than a blank or frozen crop frame.
- **Diagnostic Summary Badge**: Add a non-intrusive status line to the collapsed header (e.g., `▶ Technical Diagnostics (3 sources active, Graph paused, 0 toasts)`), allowing developers to inspect system health at a glance without expanding the panel.

### Reject
- **Reject Count Normalization / Aggregation**: Never combine Telegram chats, Outlook emails, and Teams activity booleans into a single numeric summary score.
- **Reject Adding Theme Engines or UI Libraries**: Avoid Tailwind, Shadcn, or complex CSS-in-JS dependencies. Use plain CSS with system CSS variables for dark/light contrast.
- **Reject Persistent Layout State**: Do not implement local storage or config files for collapse states. The app must remain 100% config-free and local-first.

---

## 3. Minimum Useful Primary-Panel Information Architecture

The primary panel must fit inside a compact window (380px wide × 540px high) without requiring scrollbars for the primary attention view:

```text
+-------------------------------------------------------------+
| 🟢 Attention Hub                              [ Refresh ]   |
| Last snapshot: 11:09:42 (Fresh - 2s loop)                   |
+-------------------------------------------------------------+
| OVERALL STATUS                                              |
| 🟡 2 Observed Sources Need Attention                        |
+-------------------------------------------------------------+
| OBSERVED ATTENTION SIGNALS                                  |
|                                                             |
| 💬 Telegram Desktop                                         |
|    • Unread Chats : 3                                       |
|    • App Counter  : 9                                       |
|    State: 🟡 Needs Attention (High Confidence)              |
|                                                             |
| ✉️ New Outlook                                               |
|    • Inbox Unread : 12                                      |
|    State: 🟡 Needs Attention (High Confidence)              |
|                                                             |
| 👥 Microsoft Teams                                          |
|    • Activity     : Active (New Activity)                   |
|    • DWM Mirror   : [ Toggle Live Crop ] (Session Only)     |
|      +-----------------------------------------+            |
|      | [ Live DWM Thumbnail: 64x64 Teams Crop] |            |
|      +-----------------------------------------+            |
|    State: 🟡 Needs Attention (Medium Confidence)            |
+-------------------------------------------------------------+
| ▶ Technical Diagnostics & Evidence (Collapsed)              |
|   ├── WinRT Notification Listener (0 active toasts)         |
|   ├── Calendar / AppointmentStore (Stale / Paused)          |
|   ├── Graph Phase 0 Environment Report (Paused)             |
|   └── Raw UI Automation Diagnostics                         |
+-------------------------------------------------------------+
```

---

## 4. Deterministic State Evaluation Rules

### Source-Level State Rules

1. **Telegram Desktop**:
   - `NeedsAttention`: `unread_chats > 0` OR `app_counter > 0`
   - `AllClear`: `unread_chats == 0` AND `app_counter == 0`
   - `Unavailable`: Process `Telegram.exe` not running OR main window absent.
   - `Failed`: UIA query returned exception or null root.

2. **New Outlook**:
   - `NeedsAttention`: `inbox_unread > 0`
   - `AllClear`: `inbox_unread == 0`
   - `Unavailable`: Process `olk.exe` / `olc.exe` not running OR Inbox element absent.
   - `Failed`: UIA property extraction error.

3. **Microsoft Teams**:
   - `NeedsAttention`: `activityStatus == true`
   - `AllClear`: `activityStatus == false`
   - `Unavailable`: Process `ms-teams.exe` not running OR notification area element absent.
   - `Failed`: UIA element search failure.

### Overall Hub State Rules

- **Needs Attention** (🟡): `ANY(Source.State == NeedsAttention)`
- **All Clear** (🟢): `ALL(Source.State IN [AllClear, Unavailable])` AND `AT_LEAST_ONE(Source.State == AllClear)`
- **Unavailable** (⚪): `ALL(Source.State == Unavailable)` (No observed applications are currently running).
- **Stale** (⏳): `(CurrentTime - CapturedAt) > 6000ms` OR `Diagnostics` contains an IPC connection warning.
- **Degraded / Error** (⚠️): `ANY(Source.State == Failed)` OR `NotificationAccessStatus == Denied/Error`.

---

## 5. Acceptance Criteria, Risks, & Manual Verification

### Acceptance Criteria
1. **Primary Layout Boundedness**: Primary view renders cleanly within 380px × 540px without vertical scrolling when technical diagnostics are collapsed.
2. **Semantic Accuracy**: Telegram, Outlook, and Teams display their exact native semantics (chats vs counter vs Inbox vs activity boolean) without metric coercion.
3. **State Determinism**: State transitions (`Needs Attention` ↔ `All Clear` ↔ `Unavailable` ↔ `Stale`) update accurately on every snapshot.
4. **Zero Technical Data Loss**: Collapsing technical evidence retains 100% of Graph Phase 0 reports, AppointmentStore evidence, WinRT toasts, and UIA probe logs.
5. **DWM Mirror Fallback**: Toggling Teams DWM thumbnail displays a live 64×64 crop when visible, and cleanly switches to a `"Window Hidden"` state when Teams is minimized.
6. **Non-overlapping Timer Loop**: 2-second snapshot loop continues to run without overlapping requests or memory leaks over a 30-minute test.

### Key Risks
1. **Layout Jank on Diagnostic Expansion**: Expanding large diagnostic logs may overflow the window bounds if scroll containment isn't enforced on `<details>`.
2. **Stale Signal Masking**: If a source process crashes abruptly, UIA must immediately mark the source as `Unavailable` rather than retaining stale count values.

### Manual Verification Protocol
- **Test 1: Zero State Verification**  
  Close Telegram, Outlook, and Teams -> Launch Attention Hub -> Verify Overall State = `Unavailable (No observed apps running)`.
- **Test 2: Single Source Transition**  
  Send a test message to Telegram -> Verify Telegram card shows `Needs Attention (Unread Chats: 1)` and Overall State turns 🟡 `Needs Attention`.
- **Test 3: Multi-Source Coexistence**  
  Receive an email in Outlook and unread activity in Teams -> Verify distinct cards render simultaneously with correct individual states.
- **Test 4: Evidence Integrity Audit**  
  Expand `Technical Diagnostics` -> Verify Graph Phase 0 report JSON and AppointmentStore rows are present and untruncated.
- **Test 5: Stale Recovery Test**  
  Pause the Tauri native timer -> Observe UI transition to ⏳ `Stale` after 6 seconds -> Unpause timer -> Verify instant recovery to 🟢/🟡.

---

## 6. Scope to Defer

The following items are **explicitly excluded** from Milestone 3A:
- No system tray, autostart, or background daemon installation.
- No persisted settings, JSON config files, or local storage usage.
- No design frameworks (Tailwind, Material UI, Shadcn, Fluent UI).
- No new calendar spikes or Entra/Graph registration work.
- No secondary monitor taskbar thumbnail support.
- No provider plugin framework or multi-tenant abstraction layers.

---

## 7. Revised Bounded Milestone 3A Proposal

### Goal
Transform Attention Hub's React interface from a diagnostic test harness into a compact, daily-use attention panel that presents proven source-owned signals first while preserving all technical evidence in a collapsed drawer.

### In Scope
1. **Compact Primary Card Layout**: Implement clean, semantic cards for Telegram, New Outlook, and Teams.
2. **State Machine Engine**: Add deterministic frontend state classification (`All Clear`, `Needs Attention`, `Unavailable`, `Failed`, `Stale`).
3. **Collapsed Diagnostic Drawer**: Wrap Graph Phase 0 reports, AppointmentStore evidence, WinRT toasts, and UIA probe logs in a collapsible `<details>` section.
4. **Teams DWM Mirror Toggle**: Place a session-only toggle on the Teams card to host the native Win32 DWM crop window.

### Out of Scope
- Code changes in Rust backend (existing snapshot IPC contract is fully sufficient).
- Any new platform APIs, calendar experiments, persistent storage, or design systems.

### Success Criteria
Attention Hub can be left open on a developer desktop for a full workday, delivering unambiguous attention signals at a glance without visual noise or layout jank.
