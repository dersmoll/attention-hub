# Milestone 3A — Attention-first daily-use panel (review, claude)

- Date: 2026-08-11
- Scope: discussion-only review of the proposed Milestone 3A. No code or files
  touched outside this document.
- Checkpoint reviewed: branch `agent/m0-notification-feasibility`, current
  `src/App.tsx` (876 lines) and `src-tauri/src/attention_signals/`.
- Sibling review consulted for cross-check:
  `docs/council/milestone-3/2026-08-11-milestone-3a-attention-first-daily-panel-gemini.md`.
  Two of its claims are corrected below with file/line evidence (§2, §6).

---

## 1. Verdict — is this the most valuable next milestone?

**Yes, with one scope correction.** Ranked against the alternatives:

- **Calendar** is blocked by decisions already made, not by unexplored
  options. ADR 0006 paused Graph on organizational-approval grounds, ADR 0007
  found the M365 Calendar companion foreground-only and stopped normalized
  extraction, and `AppointmentStore` (ADR 0005/0006) is proven stale against
  the real work calendar. There is no unblocking action available to
  engineering right now — only waiting on tenant approval, which is a policy
  event, not a milestone.
- **Reliability hardening** (the 2-second unconditional full UI Automation
  traversal flagged as "not a production recommendation" in
  `docs/architecture.md:147`, adaptive refresh, event-driven UIA) is real
  debt, but it hardens a screen nobody uses daily today. Optimizing an unused
  debug harness is lower leverage than making the harness usable.
- **Platform/lifecycle** work (tray, autostart, installer, persistence) is
  explicitly a non-goal until "real daily use demonstrates value"
  (`docs/vision.md:23`). There is no daily use to demonstrate value from yet —
  `src/App.tsx` opens on a paused Graph diagnostic and a Milestone 1 calendar
  table (`src/App.tsx:353-354`) before a user ever sees Telegram, Outlook, or
  Teams state.

Milestone 3A is the only candidate that converts already-proven signals into
something the vision's own success test (`docs/vision.md:41-43`, "useful at a
glance... quiet when nothing needs attention") can actually be evaluated
against. It is correctly sequenced.

**The one correction to the value case**: this is not a pure UI reorganization
with zero backend risk. §2 and §6 show that the current Rust/Tauri contract
cannot honestly support the milestone's own headline promise ("distinguish
known zero, unavailable, failed, and stale") without a small, targeted
backend fix. That fix is in scope for 3A precisely because it's what makes the
milestone's core deliverable true rather than cosmetic.

---

## 2. What I'd adopt, modify, reject

### Adopt

- Elevating Telegram (`applicationCounter` + `unreadChats`), Outlook
  (`inboxUnread`), and Teams (`activityStatus` boolean) to the primary
  experience — these are exactly the signals ADR 0003/0004 proved reliable.
- Keeping source semantics separate. `docs/architecture.md:132` already states
  the design intent explicitly: the contract "distinguishes signal kind and
  meaning instead of forcing... into a misleading universal unread count."
  Any single combined "N items need attention" number across sources would
  regress a decision already made.
- Collapsing Graph/Calendar/toast/raw diagnostics rather than deleting them.
  `docs/vision.md:25` — "treat inconvenient platform behavior as evidence, not
  something to conceal" — is a hard requirement, and the user's own hard
  constraint repeats it.
- Placing the Teams mirror control on the Teams row, off by default,
  session-only.

### Modify

1. **The milestone's own state promise requires a minimal Rust change, which
   should be named explicitly rather than left implicit.** See §6 for the
   exact defect. Gemini's sibling review lists "no Rust backend changes" as
   an explicit out-of-scope item — that's the one place I disagree with it,
   and the disagreement is load-bearing: without the fix, "failed" and
   "unavailable" cannot be told apart per-source, which is the milestone's
   headline deliverable.

2. **The DWM mirror cannot be drawn inside the React/WebView2 layout.**
   Gemini's proposed mockup nests a `[ Live DWM Thumbnail: 64x64 Teams Crop ]`
   box directly inside the Teams card in the same panel. ADR 0008's own
   consequences section and the prior council swe review
   (`docs/council/2026-08-10-teams-taskbar-badge-dwm-mirror-audit-swe.md:224-226`)
   already settled this: *"Rendering the DWM thumbnail into a Tauri /
   WebView2 window. The WebView2 `Chrome_RenderWidgetHostHWND` /
   DirectComposition child visual will paint over the DWM thumbnail layer."*
   The mirror must stay a separate, Attention Hub-owned native top-level
   window (exactly as the ADR 0008 diagnostic already is). The panel's Teams
   row may only host a *toggle* that launches/closes that external window —
   never an inline crop element.

3. **Define "stale" as a rule, not a number pulled from nowhere.** Gemini's
   6-second (3× poll interval) threshold is a reasonable default; adopt it,
   but state it as a rule tied to the existing non-overlapping poll loop
   (`src/App.tsx:280-299`) rather than a fixed constant, since the loop
   already re-queues from completion time, not a fixed cadence.

4. **Don't derive per-source state from diagnostic string text.** Both this
   review and the milestone depend on telling "app not running" apart from
   "app running, label not found" apart from "query threw." Today only the
   third is structurally distinguishable (see §6); the first two exist only
   as free-text English sentences (e.g. `windows_adapter.rs:100` vs
   `windows_adapter.rs:126-128`). Pattern-matching English diagnostic text in
   the frontend to reconstruct state is exactly the kind of coupling this
   project has repeatedly avoided elsewhere (typed contracts, not string
   sniffing) and should not be introduced here either.

### Reject

- Any numeric aggregation across sources into one badge/score — already
  covered above, and both this review and Gemini's agree.
- Adding a design system, CSS framework, or component library to build the
  compact cards — not requested, forbidden by the hard constraints, and
  unnecessary for three rows and a disclosure widget.
- Persisting collapse state, mirror-toggle state, or window geometry to disk
  or `localStorage` — forbidden by the hard constraints ("no persisted
  settings"); re-stating it because it's an easy thing to reach for once a
  disclosure widget exists ("just remember if they had it open").
- Treating "Unavailable" (source app not running) as equivalent to "All
  clear." It must be visually distinct even though neither implies action —
  a user who quit Telegram shouldn't be told the same thing as a user whose
  Telegram has zero unread chats. Collapsing the two loses information the
  signal already carries.

---

## 3. Minimum useful primary-panel information architecture

```text
Attention Hub                                    [state pill] [age]
────────────────────────────────────────────────────────────────
💬 Telegram         3 unread chats · counter 9        [needs attention]
✉️ Outlook          0 unread (Inbox)                  [all clear]
👥 Teams            No new activity      [ Show taskbar mirror ]
────────────────────────────────────────────────────────────────
▶ Technical diagnostics (Graph · Calendar · Toast · raw UIA)  [N]
```

Rules for this layout:

- **Fixed three rows, keyed by `sourceKey`**, not a rendered `.map()` over
  `signals[]`. Today's contract only puts an entry in `signals` when a source
  was *successfully* read; a naive `.map()` over the array (as
  `src/App.tsx:671-693` does today) silently drops a row instead of showing
  it as unavailable/failed. The primary panel must always render Telegram,
  Outlook, and Teams, filling each from `signals` when present and falling
  back to an explicit not-available state when absent.
- **Telegram shows both numbers**, not one collapsed into the other — they
  have different, documented semantics (`windows_adapter.rs:203-204`,
  `:251-252`) and can disagree.
- **Teams never shows a number.** ADR 0004 is explicit that no exact count is
  authorized; the row is a boolean pill plus the (off-by-default) mirror
  toggle.
- **One state pill per row** (all-clear / needs-attention / unavailable /
  failed / stale), rendered with an icon or text label, not color alone
  (accessibility — see §5).
- **One overall pill** at the top summarizing across rows (rules in §4).
- **One disclosure** at the bottom holding everything currently in
  `src/App.tsx` above/below the attention-signal section verbatim: the Graph
  helper environment section (`:356-424`), the Windows calendar section
  (`:428-623`), and the notification-listener/snapshot sections
  (`:719-871`). Collapsed by default; a small live badge on the disclosure
  header itself (e.g. "3 diagnostics need review") so collapsing doesn't hide
  a real problem — see the mitigation in §5, risk 6.
- No fixed pixel budget should be committed in the milestone doc itself (the
  Gemini review's 380×540 box is a specific enough implementation choice that
  it belongs in an implementation PR, not a discussion-only milestone).

---

## 4. State rules

### Per-source (Telegram, Outlook, Teams independently)

| State | Meaning | Source of truth today |
|---|---|---|
| **All clear** | Source observed this cycle; its `needsAttention` is `false` | Present in `signals[]`, `needsAttention === false` |
| **Needs attention** | Source observed this cycle; its `needsAttention` is `true` | Present in `signals[]`, `needsAttention === true` |
| **Unavailable** | Source application is not running / not observable this cycle, but that is an expected, benign condition | Currently only a free-text diagnostic string (e.g. `windows_adapter.rs:100`, `:215`, `:321-322`) — **needs a structured field, see §6** |
| **Failed** | Source *should* be observable but the read threw or produced no usable result while the app appears to be running (e.g. unparsed English-only label, UI Automation exception) | Partially distinguishable today (`windows_adapter.rs:126-128` is a distinct message from `:100`), but not structurally — **needs §6 fix** |
| **Stale** | Row is displaying data from a previous successful cycle because the most recent refresh attempt failed or has not completed within the stale threshold | Derivable today: `attentionError` set while `attentionSnapshot` is non-null (`src/App.tsx:220-234`) |

Distinguishing "unavailable" from "failed" matters because they call for
different user reactions: unavailable is "nothing to see, the app isn't
open"; failed is "the panel couldn't tell, don't trust the silence." Folding
them together would make the milestone's own state-distinction promise false
in the one case (a genuinely broken read) where accuracy matters most.

### Overall panel state (priority order, evaluate top to bottom)

1. **Needs attention** — any source is `Needs attention`. This should never
   be masked by another source being `Failed`; a real signal must always
   surface.
2. **Stale** — the snapshot itself is stale (see threshold below), regardless
   of what the last-known per-source states were. Show the last-known state
   dimmed plus an explicit "as of HH:MM:SS" marker; do not silently keep
   showing it as if fresh.
3. **Degraded** — no source is `Needs attention`, but at least one is
   `Failed`. This must render differently from "All clear" — a failed read is
   not evidence of nothing needing attention, it's an absence of evidence.
4. **All clear** — every source is either `All clear` or `Unavailable`, and
   at least one source is actually `All clear` (i.e., at least one
   application is running and confirmed quiet). This is the one place I'd
   add a rule Gemini's review also reached independently: don't call it "all
   clear" if literally every app is closed — that's "nothing observed,"
   not "checked and quiet."
5. **Nothing observed** — every source is `Unavailable` (no monitored
   application is currently running). Distinct from `All clear` for the
   reason above.

### Stale threshold

Tie it to the loop's own cadence rather than a bare constant: the loop
(`src/App.tsx:280-299`) re-queues 2 seconds after the *previous request
completes*, not on a fixed wall-clock tick, so a slow UI Automation call
already pushes the next attempt out. Define stale as: the currently displayed
snapshot's `capturedAt` is older than 3× the nominal poll interval (6s) **or**
the most recent refresh attempt threw (`attentionError !== null`) while an
older snapshot is still being displayed. Either condition alone is
sufficient; this catches both "the timer is somehow stuck" and "the timer is
running but every attempt is failing."

---

## 5. Missing acceptance criteria, risks, manual tests

### Acceptance criteria not in the baseline

1. **Per-source capture isolation in Rust** (see §6 for the defect) — a
   failure reading one source must not blank the other two in the same
   cycle. Without this, "failed" state is sometimes accurate and sometimes
   wrong depending on which source failed and in what order, which is worse
   than not distinguishing the state at all.
2. **A structured per-source presence signal**, so the frontend does not
   infer unavailable/failed from matching English diagnostic sentences. This
   can be additive to the existing `AttentionSignal` shape (e.g. always
   emitting one entry per known `sourceKey` with `count`/`needsAttention` as
   `null` and a `state` discriminant) rather than a redesign — it is a
   contract clarification, not a new source, provider framework, or
   persisted setting, and does not conflict with any hard constraint.
3. **Mirror window lifecycle**: closing or minimizing the Attention Hub main
   window must also close the native mirror window — no orphaned
   always-on-top window left running after the panel that spawned it is
   gone.
4. **Mirror failure is a visible control state, not a silent no-op.** If
   `DwmRegisterThumbnail` fails against the current taskbar (per the
   documented reflow/Explorer-restart edge cases in ADR 0008), the toggle
   must show a disabled/error state with a reason, not just do nothing when
   clicked.
5. **Zero data loss in the collapsed section**: every field and table
   currently rendered in `src/App.tsx:356-871` must still be reachable,
   unchanged, after being moved under the disclosure.
6. **Disclosure accessibility**: the collapse control needs `aria-expanded`
   (or a native `<details>`/`<summary>`) and keyboard operability — today's
   UI (`src/App.tsx`) has no disclosure pattern anywhere, so this is new
   interaction surface with its own a11y bar to clear.
7. **State is never color-only.** Each state pill needs a text label or icon
   distinguishable without color, both for accessibility and because "all
   clear" vs "nothing observed" vs "degraded" are three states that are easy
   to visually confuse if color is the only cue.

### Risks

1. **The `?`-chaining defect (confirmed, see §6) undermines the milestone's
   central claim before any frontend work happens.** Highest-priority risk;
   fixing it is small (change three sequential `?` calls into independently
   handled `Result`s) but it is real code change, and the milestone should
   say so rather than imply a pure reskin.
2. **Locale fragility is a pre-existing, silent risk this milestone will make
   more visible.** Outlook's `is_outlook_inbox_label` (`windows_adapter.rs:
   378-390`) and Telegram's `"All chats ("` match (`:365`) are literal
   English strings. If the OS or app display language changes, these
   silently stop matching and today surface only as a generic "no label
   found" diagnostic — which, per §4, must map to `Failed` (app running,
   read broke) rather than `Unavailable` (app not running). Getting this
   wrong in the new UI would present a real breakage as a benign "app is
   closed" state.
3. **Mirror scope creep.** The mirror is the only place in this milestone
   that is genuinely new implementation (native window spawn/lifecycle,
   DWM re-registration on reflow) rather than reorganizing existing,
   already-shipped UI. ADR 0008's Phase 2 evidence includes a crash
   (`STATUS_HEAP_CORRUPTION`) on one rejected approach and a "user-accepted"
   visual flash on the surviving one. Treat it as the highest-variance line
   item in the milestone and consider shipping it one iteration behind the
   compact panel if it threatens the timeline (see §6 revised proposal).
4. **Collapsing hides ambient errors that are visible today.** The Graph
   helper error (`src/App.tsx:374-378`) and calendar diagnostic error
   (`:451-453`) currently render inline, unconditionally. If they move behind
   a collapsed-by-default disclosure with no summary, a real problem (e.g.
   the Graph helper binary went missing) becomes invisible until someone
   thinks to expand it. Mitigated by the diagnostic-count badge in §3.
5. **Continuous-run cost is now a product property, not a debug-session
   property.** The 2-second full UI Automation traversal was written for a
   developer occasionally opening a debug screen; once this is the always-on
   daily panel, its CPU/latency profile matters continuously. Not a reason to
   redesign the loop in 3A, but it should be measured (see manual tests
   below) so the follow-up reliability milestone has real numbers instead of
   a guess.

### Open question (not resolved by static reading — flag for whoever implements)

`capture_notification_area` calls `FindWindowW(w!("Shell_TrayWnd"), ...)?`
(`windows_adapter.rs:274`). Whether a "window not found" result from this
binding surfaces as `Err` (propagating and, per §6, wiping already-captured
Telegram/Outlook signals since notification area runs last... which would
actually be safe) or as `Ok` with a null handle that then fails later some
other way is not verified here. Worth a five-minute check (e.g., temporarily
restart `explorer.exe` while the snapshot loop is running) before relying on
this path's error behavior in the state model.

### Manual tests

1. Quit Telegram entirely; confirm its row reads `Unavailable`/"not running,"
   not zero, not failed, and does not flip the overall pill to "degraded."
2. With Outlook open, switch Windows display language (or otherwise force
   the Inbox label off the exact English match) and confirm the row reads
   `Failed`, not `Unavailable` — this is the regression test for risk 2.
3. Force a transient error in the first capture step (e.g., attach a
   debugger and throw from `capture_telegram`, or temporarily rename the
   Telegram executable mid-run) and confirm Outlook and Teams rows still
   update that cycle instead of also going blank — this is the regression
   test for the §6 defect fix.
4. Suspend/resume the machine (or otherwise stall the refresh loop) long
   enough to cross the stale threshold; confirm the panel shows the
   last-known state dimmed with an "as of" marker, then recovers cleanly on
   the next successful poll.
5. Toggle the Teams mirror on, produce a Teams badge change, confirm the
   mirror is a separate native window (not inline in the WebView2 panel),
   then close the main Attention Hub window and confirm no orphaned mirror
   window remains.
6. Trigger a Graph helper error and a calendar diagnostic error while the
   technical section is collapsed; confirm the disclosure header shows a
   nonzero diagnostic count rather than looking clean.
7. Expand/collapse the technical section and diff its contents against the
   current `src/App.tsx` output to confirm nothing was summarized away.
8. Keyboard-only pass: reach and operate the disclosure and the mirror
   toggle without a mouse; confirm state pills are announced meaningfully by
   a screen reader (not just a color swatch).
9. Leave the panel running 30–60 minutes and note CPU/memory, per risk 5 —
   record the numbers even though no fix is scheduled this milestone.

---

## 6. The correction to "zero backend changes" — verified code evidence

`src-tauri/src/attention_signals/windows_adapter.rs:62-64`:

```rust
capture_telegram(&automation, signals, diagnostics)?;
capture_outlook(&automation, signals, diagnostics)?;
capture_notification_area(&automation, signals, diagnostics)?;
```

Each call is chained with `?` inside `capture_signals`. If `capture_telegram`
returns `Err` (a plausible outcome — it makes multiple live UI Automation
`FindAll`/`Length` calls against Telegram's window tree, and UI Automation
against a hung or slow-to-respond window is a documented source of COM
failures), `capture_outlook` and `capture_notification_area` **never run**
for that cycle. The only visible effect in the current contract is one
generic top-level diagnostic string
(`"Could not capture persistent attention signals: HRESULT..."`,
`windows_adapter.rs:41-44`) and an empty `signals` array — Outlook and Teams
would appear identically "unavailable" even though neither was actually
checked. Because the three calls run in a fixed order, the blast radius is
asymmetric: a Teams-area failure (last in the chain) only drops Teams, but a
Telegram failure (first) drops all three.

Separately, `AttentionSignal` (`src-tauri/src/attention_signals/mod.rs:16-27`)
and every "not found" branch in `windows_adapter.rs` (lines 99-102, 125-129,
214-216/219-224, 321-322) express "this source wasn't read" only by omitting
it from `signals` and appending a free-text English sentence to a flat,
un-keyed `diagnostics: Vec<String>`. There is no `sourceKey`-scoped
`available`/`state` field to read structurally.

Both are small, additive fixes — not a redesign, not a new source, not a
provider framework. But they are required for the milestone's own acceptance
bar ("distinguish known zero, unavailable, failed, and stale") to be true
rather than approximately true. I'd rather name this now than discover it
mid-implementation when the frontend team reaches for diagnostic-string
matching as a workaround.

---

## 7. Scope to defer

- Adaptive/event-driven refresh, replacing the 2-second full UI Automation
  traversal — already flagged as future work in `docs/architecture.md:147`;
  belongs in a reliability milestone informed by the CPU/latency numbers
  from manual test 9 above.
- Any contract change beyond the minimal per-source isolation + presence
  field in §6. If that turns out insufficient once implementation starts,
  a fuller state-machine contract redesign is a separate decision.
- Calendar and Graph/Entra work — already excluded by the hard constraints
  and by ADR 0006/0007, restated here only for completeness.
- Any persistence (collapse state, mirror-toggle state, window geometry) —
  excluded by the hard constraints; flagged again in §2 because it's the kind
  of thing that creeps in once a disclosure widget exists.
- Design system/theming — excluded by the hard constraints.
- **Optionally, the Teams mirror control itself.** Everything else in this
  milestone is a reorganization of already-shipped, already-proven UI and
  data. The mirror is the one item that is new native-process lifecycle work
  built on a diagnostic that has already crashed once during its own spike
  (ADR 0008 Phase 2). If schedule risk needs to be cut, this is the line item
  to cut first — the compact panel delivers its full value with just the
  Teams boolean pill and no mirror toggle at all. The revised proposal below
  keeps it in, but flagged as the first thing to descope under pressure.

---

## 8. Revised bounded milestone proposal

### Milestone 3A — Attention-first daily-use panel (revised)

**Goal**: Replace the debug-harness-first React screen with a compact panel
that shows Telegram, Outlook, and Teams state honestly and immediately, while
preserving every existing diagnostic behind one collapsed, evidence-complete
section.

**In scope**

1. Fixed-row primary panel (Telegram / Outlook / Teams), each row keyed by
   `sourceKey`, always rendered regardless of whether that source produced a
   signal this cycle.
2. Frontend state classification per row and overall, per the rules in §4,
   backed by the structural fix in item 4 below.
3. One collapsed technical disclosure holding the existing Graph, Calendar,
   and notification-listener sections verbatim, with a live diagnostic-count
   badge on its (collapsed) header.
4. **Minimal Rust contract fix**: make `capture_telegram`, `capture_outlook`,
   and `capture_notification_area` independent — a failure in one is
   recorded and the others still run — and add a structured per-`sourceKey`
   presence/state signal so the frontend does not parse diagnostic text.
   This is the only backend change in scope; no new sources, no new APIs, no
   provider abstraction.
5. Teams mirror toggle on the Teams row: off by default, session-only (no
   persistence, no autostart), spawns/closes the existing ADR 0008 native
   top-level diagnostic window — never rendered inside the Tauri/WebView2
   layout — and is torn down when the main window closes.

**Explicitly out of scope** (repeating the given hard constraints for the
implementer's convenience): no Graph/Entra work, no new calendar experiment,
no exact Teams count/OCR/image recognition/pixel interpretation, no secondary
taskbar, no new sources, no provider framework, no tray/autostart/persisted
settings/installer/design system, no deletion of existing technical evidence.

**Descope-under-pressure order**: (1) mirror toggle first — ship the Teams
boolean pill with no mirror control and land it later as 3A.1; (2) the
diagnostic-count badge on the collapsed header — a "0 known issues" state is
an acceptable fallback if the badge itself proves fiddly; the Rust isolation
fix in item 4 is not descopable, since without it the milestone's acceptance
bar cannot be honestly met.

**Success criteria**: a user can leave Attention Hub open all day and,
without expanding anything, correctly answer "does anything need my
attention right now, and can I trust what I'm seeing" for Telegram, Outlook,
and Teams — including correctly recognizing when the answer is "I don't
know" (stale/failed) rather than a false "all clear."
