# Milestone 3A: Attention-first daily-use panel

- Status: Proposed — discussion-only review, no implementation.
- Date: 2026-08-11
- Reviewer: SWE feasibility / product-signal review.
- Baseline checkpoint: branch `agent/m0-notification-feasibility`, commit
  `d942187`.
- Evidence consulted:
  - `docs/vision.md`
  - `docs/architecture.md`
  - `docs/decisions/0004-bounded-teams-accessibility-count-experiment.md`
  - `docs/milestones/evidence/m0/2026-08-10-source-transition-validation.md`
  - `docs/milestones/evidence/m0/2026-08-10-teams-taskbar-dwm-thumbnail.md`
  - `docs/milestones/evidence/m0/2026-08-10-teams-taskbar-dwm-static-crop.md`
  - `docs/milestones/evidence/m0/2026-08-10-teams-taskbar-dwm-reflow.md`
  - `src/App.tsx` and `src-tauri/src/attention_signals/windows_adapter.rs`

---

## 1. Executive opinion: Is this the right next milestone?

**Yes — but only if it is reframed as a dogfood/validation milestone, not a
production UI milestone.**

Calendar remains blocked on three independent fronts: `AppointmentStore` is
stale, the Microsoft 365 Calendar companion is foreground-only, and Graph
requires organization-level approval. More calendar work is therefore
speculation until the owner or the organization explicitly accepts the Graph
cost. Platform and lifecycle work (tray, autostart, installer, persisted
settings) is premature because the product still has not proven that the
existing source-owned signals are useful in real daily use — the core principle
in `docs/vision.md` is "add capability only after real daily use demonstrates
value." Reliability hardening is necessary, but it should be folded into 3A as a
constraint that enables daily use rather than becoming a separate milestone
whose success is decoupled from user value.

Milestone 3A is the smallest next step that tests the product hypothesis:
"Does a compact, persistent summary of the already-proven signals help the user
decide what needs attention?" If the answer is no, Attention Hub should stop or
pivot before investing in calendar, Graph, or lifecycle polish.

---

## 2. Adopt

These elements of the proposal are correct and should be retained:

- **Proven source-owned signals become the primary experience.** Telegram's
  application counter and unread-chat count, New Outlook's Inbox unread count,
  and Teams' qualitative `activityStatus` are the only signals with end-to-end
  evidence.
- **Keep source semantics separate.** Do not collapse Telegram's two numeric
  signals into one "unread" number, and do not present Teams' activity boolean
  as a count.
- **Distinguish known zero, unavailable, failed, and stale states.** The current
  React UI already returns `null` counts and `unknown` booleans; the primary
  panel must make these states legible, not hide them.
- **Move Graph, calendar, toast, and raw diagnostics into a collapsed technical
  section.** These are valuable spike evidence but should not lead the daily-use
  panel.
- **Preserve complete snapshots and non-overlapping refreshes.** The normalized
  snapshot contract (`AttentionSignalSnapshot`) is the right source of truth; do
  not move to incremental per-source timers in React.
- **Session-only Teams mirror, grouped with Teams.** The DWM mirror is a visual
  fallback only; it belongs next to the Teams activity indicator and must not be
  shown as a number or authoritative count.
- **No exact Teams count, no OCR, no image recognition.** The existing
  non-negotiable boundaries remain in force.

---

## 3. Modify

1. **Rename the milestone to make its purpose explicit:**
   "Milestone 3A — Daily-use attention panel (dogfood)." It is not a design
   system or production UI milestone.

2. **Derive the overall state with explicit precedence.**
   The panel must not conflate "I checked and found nothing" with "I could not
   check." See Section 5 for the exact rules.

3. **Replace the 2-second attention-signal polling with a visible, bounded
   refresh model.**
   Non-overlapping refreshes are a good invariant, but a 2-second timer in a
   daily-use panel is noisy and unnecessary. For 3A, keep a single `setTimeout`
   loop with a 5-second interval and a clear "last captured" timestamp; measure
   whether that is too slow in dogfood. Do not hide the refresh mechanism — the
   user must know the data is sampled, not live-streamed.

4. **Show the Teams mirror as a small, labeled visual toggle, not a badge
   replacement.**
   If the DWM mirror is included, it must:
   - be disabled by default,
   - require an explicit user toggle each session,
   - be labeled "Teams visual mirror (session only — not a count),"
   - hide immediately on discovery ambiguity or reflow uncertainty, and
   - never appear without the Teams source card.

5. **Make the collapsed technical section always reachable.**
   Do not remove it behind another route or menu. A `<details>`/disclosure at the
   bottom of the panel is sufficient. It must contain the existing Graph
   environment, calendar access, notification comparison, raw signals table, and
   diagnostics.

6. **Add an explicit staleness threshold.**
   The snapshot's `capturedAt` timestamp is already present. The UI should mark
   the panel as stale if the most recent successful snapshot is older than 5
   minutes or if the last refresh failed. This threshold is for UI display only;
   it does not change the Rust adapter.

7. **Require the architecture/product exception for the DWM mirror to be
   recorded before integration.**
   The mirror embeds source-owned rendered pixels in an Attention Hub window.
   Retaining it should require an explicit ADR-level exception to the
   "do not embed" principle, even for the spike. If that exception is not
   recorded, the mirror stays out of 3A.

---

## 4. Reject

- **Deriving a numeric Teams count from the DWM mirror.** The mirror is visual
  only; no OCR, template matching, or pixel classification may be added.
- **A provider framework or new sources.** Telegram, Outlook, and Teams are the
  only sources for 3A.
- **Production UI, design system, themes, tray, autostart, persisted settings,
  or installer work.** These are explicitly out of scope.
- **Reopening calendar or Graph.** No `AppointmentStore` experiments, no M365
  companion automation, no Entra/Graph calls.
- **Removing the raw signal table or diagnostics.** The technical evidence must
  remain, only collapsed.
- **Real-time event-driven taskbar reflow tracking for the mirror.** The Phase
  2 evidence showed that polling at 100 ms produces a brief wrong-icon flash and
  that event subscriptions crashed with `STATUS_HEAP_CORRUPTION`. In 3A, the
  mirror must hide on ambiguity and await an explicit refresh; no new event
  architecture may be introduced.
- **A separate "mirror" screen or control.** The mirror belongs with the Teams
  source card.

---

## 5. Minimum useful primary-panel information architecture

The panel should be readable in a single glance on a small window (roughly
400×300 CSS pixels). No navigation routes, no tabs.

### 5.1 Top banner: overall state

A single line at the top showing the computed overall state, the timestamp of
the last successful snapshot, and a manual refresh button.

```
[Needs attention]  Updated 12:34:02   [Refresh]
```

Possible banner states: `needs attention`, `all clear`, `stale`, `unavailable`,
`failed`.

### 5.2 Source cards

One card per source, in fixed order:

- **Telegram**
  - Application counter: `{n}` or `—` if not exposed.
  - Unread chats: `{n}` or `—` if not exposed.
  - Attention: yes if either > 0, no if both are known zero, unknown otherwise.
  - Meaning line: "Application badge counter and unread-chat label."

- **Microsoft Outlook**
  - Inbox unread: `{n}` or `—` if not exposed.
  - Attention: yes if > 0, no if known zero, unknown otherwise.
  - Meaning line: "Sum of explicit English Inbox unread counts."

- **Microsoft Teams**
  - Activity: `New activity` / `No new activity` / `unknown`.
  - Optional visual mirror toggle (disabled by default).
  - If mirror enabled and valid: a small 44×48 px visual crop rendered by DWM,
    shown next to the activity line.
  - Meaning line: "Activity state from taskbar accessibility; mirror is visual
    fallback only."

Each card must show its own source-level state (`ok`, `zero`, `unavailable`,
`failed`) independently of the overall banner.

### 5.3 Collapsed technical evidence

A disclosure at the bottom labeled "Technical evidence (M0–M2A)" containing the
existing sections in collapsed form:

- Microsoft Graph helper environment.
- Windows calendar access and snapshot.
- Source-owned persistent state (raw signals table).
- Windows Notification Center comparison.
- All diagnostics.

---

## 6. Rules for overall state

Evaluate the most recent complete snapshot in this order:

1. **Failed:** The last refresh threw an error or the snapshot contains a Rust
   diagnostic that prevents any source from being read. Banner = `failed`.
   Per-source cards show their own `failed` state where applicable.

2. **Unavailable:** No source returned a readable signal and the last refresh
   completed without error (e.g., all target apps are closed or access is not
   granted). Banner = `unavailable`. This is distinct from `all clear`.

3. **Stale:** The last successful snapshot is older than the staleness
   threshold (proposed 5 minutes) **or** at least one source card is marked
   stale because its data could not be refreshed. Banner = `stale`. A stale
   panel must not show `all clear` even if the last known values were zero.

4. **Needs attention:** At least one source has `needs_attention = true` and is
   fresh, and neither failed nor unavailable nor stale conditions apply.
   Banner = `needs attention`.

5. **All clear:** All sources returned `needs_attention = false` and are fresh.
   Banner = `all clear`.

Per-source rules:

| source   | `needs_attention` rule                                           | `count` display                         |
|----------|------------------------------------------------------------------|------------------------------------------|
| Telegram | `true` if application counter > 0 or unread chats > 0.           | show both numbers, or `not exposed`.     |
| Outlook  | `true` if Inbox unread count > 0.                                | show the number, or `not exposed`.       |
| Teams    | `true` if `New activity` is present.                             | no count; boolean only.                  |

A source is `unavailable` if the adapter reports it is not running or
inaccessible. A source is `failed` if the adapter reports an error for that
source. A source is `stale` if its last successful read is older than the panel
staleness threshold.

---

## 7. Missing acceptance criteria, risks, and manual tests

### Missing acceptance criteria

1. **Per-source accuracy matrix:** The panel must correctly display each source
   in all four cases: (a) source not running, (b) source running with zero
   attention, (c) source running with nonzero attention, (d) source running but
   the signal is not exposed.
2. **Overall state transitions:** Changing one source from zero to nonzero must
   change the banner from `all clear` to `needs attention` within one refresh
   cycle. Removing all sources must change the banner to `unavailable`, not
   `all clear`.
3. **Staleness display:** Simulating a refresh failure must cause the banner to
   switch to `stale` and remain there until the next successful refresh.
4. **Mirror hide-on-doubt:** With the mirror enabled, a taskbar reflow or an
   ambiguous UIA discovery must cause the mirror to disappear within one
   polling interval and remain hidden until the user explicitly refreshes or
   the ambiguity resolves.
5. **No semantic conflation:** The UI must never display the Teams mirror as a
   number, or the Telegram application counter as "unread messages."
6. **Non-overlapping refreshes:** A manual refresh during an in-flight
   attention-signal poll must not start a second concurrent Rust snapshot.
7. **Resource budget:** Idle CPU must remain below 1% and memory must not grow
   monotonically over 5 minutes with the 5-second refresh loop.
8. **Technical evidence accessibility:** All existing M0/M1/M2A diagnostic
   sections must remain reachable without leaving the main panel.

### Risks

1. **False reassurance from `all clear`.** If a source is `unavailable`, the
   user may misread the panel as "nothing needs attention." The banner must
   clearly distinguish `all clear` from `unavailable`.
2. **Teams mirror mis-crop exposes another application.** The Phase 2 evidence
   already showed a brief wrong-icon flash during reflow. A persistent panel
   increases the chance that the user sees someone else's icon. Hide-on-doubt
   is mandatory.
3. **Polling latency hides real transitions.** A 5-second refresh interval may
   miss attention spikes. This is acceptable for dogfood but must be measured.
4. **Outlook label localization.** The current adapter matches English Inbox
   labels. On a non-English Windows, Outlook will return `unavailable` or zero.
   This limitation must be surfaced in the UI.
5. **Telegram counter semantics drift.** Telegram's two counters may not both be
   enabled by the user. Showing two different numbers may confuse; the meaning
   line must be explicit.
6. **DWM mirror lifecycle leaks.** Each session toggle must register and
   unregister the DWM thumbnail. Leaving a thumbnail registered after the panel
   closes is a resource leak.
7. **DWM mirror ADR exception not recorded.** Without an explicit architecture
   decision, integrating the mirror violates the observer boundary.

### Manual tests

1. **Telegram zero/nonzero:** Open Telegram with 0 and then >0 unread. Verify
   both counter and unread-chat rows update and the banner changes.
2. **Outlook zero/nonzero:** Mark the Inbox read and then receive one unread
   email. Verify the Inbox count and banner.
3. **Teams true/false:** Clear and then create Teams activity. Verify the
   boolean and the mirror (if enabled) reflect the badge visually without
   exposing a number.
4. **All apps closed:** Close Telegram, Outlook, and Teams. Verify the banner
   is `unavailable`, not `all clear`.
5. **Mirror reflow:** With the Teams mirror enabled, open or close another
   application that moves the taskbar icon. Verify the mirror hides and an
   explicit refresh restores it.
6. **Staleness:** Disconnect or fail a refresh and verify the banner switches
   to `stale`.
7. **Technical evidence:** Expand the collapsed section and confirm all
   existing M0/M1/M2A diagnostics are still present.
8. **Dogfood log:** Run the panel as the primary attention view for at least 5
   working days and record false positives, false negatives, and UI friction in
   a plain text log.

---

## 8. Scope that should be deferred

Defer to later milestones or separate decisions:

- **Tray icon, autostart, and installer.** These are lifecycle features for a
  product that has not yet validated daily-use value.
- **Persisted settings, themes, and design system.** Not in scope for a dogfood
  milestone.
- **Secondary taskbar and multi-monitor mirror support.** The existing evidence
  covers only the primary vertical taskbar on one machine.
- **Real-time taskbar reflow events.** The Phase 2 evidence showed this path is
  unstable; revisit only if dogfood proves the 100 ms polling flash is
  unacceptable.
- **New sources beyond Telegram, Outlook, and Teams.** No provider framework.
- **Calendar integration of any kind.** `AppointmentStore`, M365 companion, and
  Graph remain paused pending organizational approval.
- **Adaptive refresh / prediction.** Keep simple polling for 3A; optimize only
  after dogfood evidence.
- **Production polish:** animations, responsive breakpoints, accessibility
  audit, high-contrast themes, etc.

---

## 9. Revised bounded milestone proposal

### Title

Milestone 3A — Daily-use attention panel (dogfood)

### Goal

Replace the debug-first React screen with a compact, at-a-glance attention panel
that surfaces the already-proven source-owned signals. Preserve all existing
M0/M1/M2A technical evidence in a collapsed section. Use daily use to validate
whether the signal set is useful before any calendar, Graph, or lifecycle work.

### In scope

1. A primary panel with an overall state banner and fixed source cards for
   Telegram, New Outlook, and Teams.
2. Semantic separation of Telegram's two signals, Outlook's Inbox count, and
   Teams' activity boolean.
3. Distinct visual treatment for `needs attention`, `all clear`, `stale`,
   `unavailable`, and `failed` states.
4. A 5-second non-overlapping attention-signal refresh loop with a visible
   "last captured" timestamp.
5. Optional, disabled-by-default, session-only Teams DWM mirror toggle, placed
   within the Teams card, with hide-on-doubt semantics.
6. A collapsed technical evidence section containing Graph environment, calendar
   access, Windows notifications, raw signals, and diagnostics.
7. A 5-working-day dogfood log of false positives, false negatives, and UI
   friction.

### Out of scope

- New sources, provider framework, or generalized signal architecture.
- Calendar/Graph/Entra work of any kind.
- Exact Teams count, OCR, or pixel interpretation.
- Tray, autostart, persisted settings, installer, themes, design system.
- Secondary taskbar / multi-monitor mirror.
- Real-time taskbar reflow event architecture.
- Production polish or responsive design beyond a small fixed-size window.

### Success criteria (pass / fail)

1. The panel can be read at a glance in ≤ 3 seconds.
2. The overall state banner correctly reflects `needs attention`, `all clear`,
   `stale`, `unavailable`, and `failed` in manual testing.
3. No source semantics are conflated in the UI.
4. The Teams mirror, if enabled, never shows a wrong crop for more than one
   refresh cycle and hides on ambiguity.
5. All existing M0/M1/M2A technical evidence remains reachable in the collapsed
   section.
6. The 5-second refresh loop does not overlap requests and keeps idle CPU < 1%
   with no monotonic memory growth over 5 minutes.
7. The dogfood log records at least 5 days of use and identifies the most
   common false positive / false negative / friction pattern.

### Stop condition

If the dogfood log shows that the panel does not help the user decide what
needs attention, or if the signal set produces frequent false positives /
negatives that cannot be fixed by UI state clarity, stop. Do not proceed to
Milestone 4 (lifecycle/platform) or reopen calendar/Graph until the attention
signals are trustworthy and useful.

---

## 10. Comparison with alternatives

| Alternative | Verdict |
|-------------|---------|
| **Calendar next** | Reject. All calendar paths are blocked (`AppointmentStore` stale, companion foreground-only, Graph needs org approval). More calendar work is speculation. |
| **Reliability hardening as a standalone milestone** | Partial. Reliability issues that block daily use should be fixed in 3A. A separate reliability milestone without a user-facing dogfood target risks optimizing the wrong things. |
| **Platform/lifecycle next (tray, autostart, installer)** | Reject. These are premature before the core product value is validated. They also expand the security/surface area before the signal semantics are stable. |
| **Attention-first daily-use panel (3A)** | Approve as the next milestone, provided it stays bounded, dogfood-oriented, and does not integrate the DWM mirror without an explicit architecture exception. |
