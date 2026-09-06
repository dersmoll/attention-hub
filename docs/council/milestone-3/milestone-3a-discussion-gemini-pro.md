# Milestone 3A — Attention-first daily-use panel: Discussion & Review

## 1. Value Comparison
Compared to calendar, reliability hardening, and platform/lifecycle work, **this is arguably the most valuable next milestone.**
- **Calendar** is currently blocked by organizational approval and API limitations, making it a high-risk time sink right now.
- **Reliability hardening** and **platform/lifecycle work** are important, but stabilizing a "large debug interface" provides little user value at this stage. 
Transitioning the UI from a diagnostic tool to a focused, attention-first product allows you to validate the core user experience using the proven, unblocked signals (Telegram, Outlook, Teams) before scaling the underlying platform.

## 2. Adopt, Modify, Reject
- **Adopt:** Focusing on proven signals (Outlook, Telegram, Teams), separating source semantics, explicitly distinguishing edge-case states (zero, unavailable, failed, stale), and moving the debug/diagnostic UI to a collapsed section. Preserving complete snapshots is also excellent for consistency.
- **Modify:** For the Teams session-only mirror control, explicitly label its qualitative nature (e.g., "Activity Presence") so users don't expect a numerical unread count. Ensure the "stale" state is visually distinct from "all clear" to prevent false confidence.
- **Reject:** Reject any temptation to build a custom design system for this milestone. Use standard/basic UI elements to achieve the layout. Reject removing diagnostic evidence; as you noted, keep it collapsed for easy debugging.

## 3. Minimum Useful Primary-Panel Information Architecture (IA)
The UI should be split into a strict hierarchy:
1. **Global Status Header:** A prominent, single-glance indicator of overall state (Needs Attention, All Clear, Degraded/Stale).
2. **Primary Signals (The Daily Panel):**
   - **Outlook:** Aggregate Inbox unread count.
   - **Telegram:** App counter & Unread-chat count.
   - **Teams:** Qualitative activity indicator (Active/Inactive) & session mirror control.
3. **Collapsed Technical/Diagnostic Section:**
   - Paused Graph/Calendar evidence.
   - Raw toast data.
   - Last snapshot timestamps, raw polling payloads, and error logs.

## 4. State Rules
- **Needs Attention:** At least one primary source reports a non-zero count or active state AND data is fresh.
- **All Clear:** All connected primary sources report zero/inactive AND data is fresh.
- **Stale:** The latest snapshot is older than the acceptable polling threshold (e.g., missed >2 refresh cycles) OR a refresh is currently hanging. The UI must not show "All clear" if the data is stale; it should clearly indicate "Unknown/Stale".
- **Unavailable/Failed:** A source threw an exception, requires authentication, or the local app is closed. This should degrade the Global Status to "Degraded/Error".

## 5. Missing Acceptance Criteria, Risks, and Manual Tests
- **Missing Acceptance Criteria:**
  - The UI must immediately reflect a degraded overall state if a single primary provider fails or goes stale.
  - The technical section must remain collapsed across standard refreshes, preserving its state (expanded/collapsed) during the session.
- **Risks:**
  - Users might misinterpret the Teams "boolean activity" as an "All clear" when they actually have unread messages Teams isn't reporting.
  - If a snapshot fails partially, the UI might flicker between states if not handled atomically.
- **Manual Tests Needed:**
  - *Stale Data Test:* Suspend the backend process or block network access and verify the UI transitions to "Stale".
  - *Partial Failure Test:* Force one provider (e.g., Outlook) to fail while Telegram succeeds, verifying the global state shows Degraded/Attention.
  - *Zero-State Test:* Clear all messages in Outlook/Telegram and verify the global status transitions to a satisfying "All Clear".

## 6. Deferred Scope
- Any work on Calendar, Graph, Entra, or new providers.
- Persistence across sessions (settings, layouts).
- OS integration (autostart, tray, installer, secondary taskbar).
- Visual polishing (building a design system, complex animations).

## 7. Revised Bounded Milestone Proposal
**Milestone 3A: Attention-first Primary Panel**
*Goal:* Shift the application UI from a developer diagnostic tool to a functional, single-glance attention dashboard.
*Deliverables:*
1. Implement a two-tier UI layout: a clean Primary Panel for daily use and a collapsible Technical Section for diagnostics.
2. Integrate Outlook, Telegram, and Teams into the Primary Panel, respecting their distinct data types (counts vs. booleans).
3. Implement atomic snapshot rendering to prevent UI tearing during refreshes.
4. Establish clear visual rules and states for "Needs Attention", "All Clear", "Stale", and "Unavailable".
*Exclusions:* No new data sources, no Graph/Calendar work, no persistence/lifecycle infrastructure, no exact Teams counting via OCR.
