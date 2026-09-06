# Attention Hub Application State Audit — Milestone 9

- **Date**: 2026-08-14
- **Branch**: `codex/m9-later-inbox`
- **Commit**: `a493cd44e6598b6de3b372d54acdb867d6dea396`
- **Auditor**: Antigravity (Advanced Agentic Pair Programmer)
- **Scope**: Complete codebase audit through Milestone 9 (Local-First Later Inbox), covering Architecture, ADRs (0021–0026), Milestones (M6–M9), Rust/Tauri backend, Windows adapters, React frontend, CSS/Accessibility, and Test evidence.

---

## Verdict

**Ready for bounded dogfooding**

The Attention Hub application remains a tightly scoped, local-first attention widget. Milestone 9 introduces the Later Inbox personal queue cleanly without compromising the core attention semantics, without expanding external attack surfaces, and without leaking personal queue data into source-owned attention coverage.

---

## 1. Findings Ordered by Severity

### P0 Findings (Blockers)
*None.*

---

### P1 Findings (High Priority)
*None.*

---

### P2 Findings (Medium Priority)

#### Finding P2.1: Non-atomic file replacement pattern on Windows under concurrent file locks
- **Location**: [`src-tauri/src/later_inbox.rs:455-460`](file:///C:/Users/dersm/.codex/worktrees/a27b/attention-hub/src-tauri/src/later_inbox.rs#L455-L460) in function `write_store`
- **Observed Evidence**:
  ```rust
  if path.exists() {
      fs::remove_file(path)
          .map_err(|_| "Later Inbox could not replace its local data file.".to_owned())?;
  }
  fs::rename(&pending, path)
      .map_err(|_| "Later Inbox could not commit its pending local write.".to_owned())
  ```
- **User / Runtime Impact**:
  On Windows NTFS, if an external process (e.g., Windows Search Indexer, antivirus scanner, or backup utility) opens `later-inbox.json` with `FILE_SHARE_DELETE`, `fs::remove_file` marks the file as delete-pending. An immediate call to `fs::rename(&pending, path)` can fail with `ERROR_ACCESS_DENIED` until the external handle is released. While `load_store` has recovery logic to pick up `pending` on restart, the user-visible mutation in the UI may fail with a transient error.
- **Smallest Proportionate Correction**:
  Add a bounded short retry (e.g., 3 attempts with a 15–25ms backoff) or use a standard atomic replace helper for Windows file commits.
- **Verification Status**: Directly verified from source inspection.

---

#### Finding P2.2: Reopening hidden Later window does not refresh clock/due state immediately
- **Location**: [`src/LaterInboxView.tsx:70-75`](file:///C:/Users/dersm/.codex/worktrees/a27b/attention-hub/src/LaterInboxView.tsx#L70-L75), [`src/later-inbox-window.ts:6-10`](file:///C:/Users/dersm/.codex/worktrees/a27b/attention-hub/src/later-inbox-window.ts#L6-L10)
- **Observed Evidence**:
  When `closeWindow()` is invoked, `getCurrentWindow().hide()` hides the window while the WebView remains mounted in memory. When the user later clicks the Later button in `WidgetView.tsx`, `openLaterInboxWindow` calls `existing.show(); existing.setFocus();`. Because the component does not unmount, `now` state only updates on the 30-second interval timer (`setInterval(..., 30_000)`). If an item became due while the window was hidden, its visual "Due" badge might not update for up to 30 seconds unless a mutation event occurs.
- **Smallest Proportionate Correction**:
  Listen to window focus or show events (or set up a focus handler on `window`) in `LaterInboxView.tsx` to call `setNow(new Date())` and `titleRef.current?.focus()` whenever the window regains focus.
- **Verification Status**: Directly verified from source inspection.

---

### P3 Findings (Low Priority / Polish)

#### Finding P3.1: Unchecked acceptance gate checkbox in Milestone 9 documentation
- **Location**: [`docs/milestones/milestone-9-later-inbox.md:48-52`](file:///C:/Users/dersm/.codex/worktrees/a27b/attention-hub/docs/milestones/milestone-9-later-inbox.md#L48-L52)
- **Observed Evidence**:
  The acceptance checklist item for current-machine live evidence remains `- [ ]`, whereas the corresponding evidence is recorded in [`docs/milestones/evidence/m9/2026-08-14-later-inbox.md`](file:///C:/Users/dersm/.codex/worktrees/a27b/attention-hub/docs/milestones/evidence/m9/2026-08-14-later-inbox.md).
- **User / Runtime Impact**:
  Documentation inconsistency only; no runtime impact.
- **Smallest Proportionate Correction**:
  Mark the checkbox as completed `- [x]` to reflect the documented evidence.
- **Verification Status**: Directly verified from markdown inspection.

---

#### Finding P3.2: Full sorting executed solely for length derivation in Data Panel
- **Location**: [`src/LaterInboxDataPanel.tsx:17-24`](file:///C:/Users/dersm/.codex/worktrees/a27b/attention-hub/src/LaterInboxDataPanel.tsx#L17-L24)
- **Observed Evidence**:
  `openCount` and `completedCount` are computed via `sortOpenLaterInboxItems(snapshot?.items ?? [], new Date()).length` and `sortCompletedLaterInboxItems(snapshot?.items ?? []).length`.
- **User / Runtime Impact**:
  Negligible performance impact given the 1,000-item ceiling, but executes full comparator sorting when only a `.filter()` count is required.
- **Smallest Proportionate Correction**:
  Replace with direct filters: `snapshot?.items.filter(item => item.completedAt === null).length`.
- **Verification Status**: Directly verified from source inspection.

---

## 2. Positive Confirmations

1. **Strict Security and IPC Boundaries**:
   - The Tauri capability configuration in [`src-tauri/capabilities/default.json`](file:///C:/Users/dersm/.codex/worktrees/a27b/attention-hub/src-tauri/capabilities/default.json) denies generic shell openers, arbitrary filesystem commands, and external navigation to all WebViews.
   - `open_later_inbox_item_url` accepts only an `itemId: String`. Rust reads the stored item, verifies HTTP/HTTPS via `reqwest::Url`, rejects embedded credentials, and executes `ShellExecuteW`. The frontend cannot pass arbitrary URLs to native invocation.
   - Restrictive Content Security Policy (`default-src 'self'; connect-src ipc: http://ipc.localhost`) is enforced in [`src-tauri/tauri.conf.json`](file:///C:/Users/dersm/.codex/worktrees/a27b/attention-hub/src-tauri/tauri.conf.json).

2. **Strict Attention Semantics Isolation**:
   - Later Inbox queue items and due counts are strictly segregated from `AttentionSignalSnapshot`, `AttentionPanelModel`, and coverage calculations in [`src/attention-model.ts`](file:///C:/Users/dersm/.codex/worktrees/a27b/attention-hub/src/attention-model.ts).
   - Personal tasks never affect **All clear** calculations.
   - Messenger additions (Slack, Viber, WhatsApp) are strictly presence/visual-only and excluded from semantic attention denominators.

3. **Persistence and Corruption Recovery**:
   - `later-inbox.json` is owned by Rust in per-user AppData with schema versioning.
   - Size limits (1 MiB file, 1,000 items, 160-char title, 80-char context, 2048-char URL) are enforced.
   - `load_store` gracefully falls back to `later-inbox.backup.json` when the primary file is corrupted.
   - Future schema versions (> 1) are explicitly refused and protected from overwrite.
   - Two-step destructive cleanup (`delete_all_later_inbox_items`) removes both the primary file and backup.

4. **Responsive Layout and DWM Slot Geometry**:
   - The 48px Later button (+8px gap = 56px) increases the left panel width while keeping app sources in slots 0–5.
   - Native DWM thumbnail calculations in [`src-tauri/src/teams_mirror/windows_adapter.rs`](file:///C:/Users/dersm/.codex/worktrees/a27b/attention-hub/src-tauri/src/teams_mirror/windows_adapter.rs) align precisely with the React app slots across 0 to 6 visible sources and Compact/Auto/Wide calendar widths (744px to 1208px).

5. **Accessibility and UX Best Practices**:
   - Due status is communicated via text badges (`Due`), exclamation mark badges, and explicit aria-labels, avoiding color-only signaling.
   - Dirty capture drafts are protected on `Escape` with an in-app confirmation dialog rather than silent discard.
   - Keyboard shortcuts (`Enter` for title-only, `Ctrl+Enter` for full form) work across fields.
   - Focus is explicitly restored to the Later trigger button in the main widget on window close via `later-inbox-focus-control`.

6. **Preserved Baseline Capabilities**:
   - Teams qualitative activity, Telegram numeric unread/counter, and Outlook aggregate Inbox unread with last-observed fallback are intact.
   - Single Published ICS work calendar with local Windows Credential Manager storage, timed event ranking, 5-minute pre-meeting warning, progress bar, and **I'm in** acknowledgement flow operates cleanly without regression.

---

## 3. Claims in Documentation / Evidence That Are Overstated, Stale, or Unsupported

1. **Release Record Versioning in README**:
   - [`README.md:80`](file:///C:/Users/dersm/.codex/worktrees/a27b/attention-hub/README.md#L80) references `0.4.0-beta.1` as the current daily-use beta. Milestone 9 code is implemented on top of this baseline, but release packaging for Milestone 9 is deferred. This is accurately documented as a milestone boundary.
2. **Live DWM Mirror Alignment Claim**:
   - In [`docs/milestones/evidence/m9/2026-08-14-later-inbox.md:33`](file:///C:/Users/dersm/.codex/worktrees/a27b/attention-hub/docs/milestones/evidence/m9/2026-08-14-later-inbox.md#L33), live DWM mirror alignment is explicitly noted as *Not observed* because no owned native mirror was active in the test environment. The documentation honestly disclaims live visual proof while relying on verified layout mathematics.

---

## 4. Minimal Recommended Next-Step Plan

1. **Documentation Cleanup**: Update the checkbox in `docs/milestones/milestone-9-later-inbox.md:48` to `- [x]`.
2. **Window Show/Focus Listener**: In `src/LaterInboxView.tsx`, add a `window.addEventListener('focus', ...)` handler to update `now` and focus the title input when the hidden window is re-shown.
3. **NTFS Replace Hardening**: Add a small retry loop around `fs::rename(&pending, path)` in `write_store` to absorb transient file-locking latency from external Windows tools.
4. **Proceed to Dogfooding**: Initiate bounded dogfooding of the Milestone 9 Later Inbox on the primary test machine.

---

## 5. Explicit "Do Not Change" Items (Frozen Scope)

The following items are out of scope and must remain untouched:
- **No Microsoft Graph, Entra ID, or organization-facing permissions**.
- **No OCR, pixel reading, or semantic parsing of DWM thumbnail surfaces**.
- **No generalized provider architecture or arbitrary app enrollment**.
- **No cloud synchronization, multi-device sync, or remote accounts**.
- **No complex task management features**: attachments, tags, recurrence, subtasks, priorities, markdown notes, or collaboration.
- **No Windows scheduled toast notifications or background reminder services in M9**.
- **No background tray lifecycle, autostart, updater, or custom installer modifications**.
