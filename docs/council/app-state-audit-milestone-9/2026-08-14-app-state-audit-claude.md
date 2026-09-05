# Attention Hub app-state audit — Milestone 9 Later Inbox (claude)

- Date: 2026-08-14
- Repository audited: `C:\Users\dersm\.codex\worktrees\a27b\attention-hub`
- Branch: `codex/m9-later-inbox`
- Commit: `a493cd44e6598b6de3b372d54acdb867d6dea396` (verified via `git rev-parse HEAD`)
- Draft PR: https://github.com/dersmoll/attention-hub/pull/6
- Diff base audited: `main...HEAD` (10 commits, 64 files, +7,539/−337), with the M9
  "Later Inbox" feature isolated to commit `df687a3` (21 files, +2,196/−26) for
  scope-bleed checking.
- Mode: strictly read-only throughout. No build, install, test execution,
  launch, or file mutation was performed against the audited worktree. All
  file/line citations below were read directly by me in this session (via
  `Read`/`Grep`/`git diff`/`git show`) unless explicitly marked "inferred."

**Method.** This audit fanned out five parallel read-only investigations
(docs/ADRs/milestones; Rust persistence & security; frontend UX/accessibility;
source-semantics regression risk; tests & evidence quality), then I directly
re-read the source for every finding rated P0/P1/P2 before including it here —
none of the findings below rest solely on a sub-agent's unverified claim. A
second independent review already exists in this directory
(`2026-08-14-app-state-audit-fable.md`); I treated its conclusions as a
proposal to check, not an authority. It reaches the same top-line verdict, but
I diverge from it on two points, called out explicitly where relevant:
severity of the native-close draft-loss bug, and the completeness of the
"delete-all removes the backup" guarantee (see P2-4).

## Verdict

**Ready for bounded dogfooding.**

No P0 was found, and nothing here is fundamentally unsafe or incoherent: the
established source semantics (Teams qualitative, Telegram numeric, Outlook
aggregate+fallback, Slack/Viber/WhatsApp presence-only, DWM pixels
visual-only) are untouched by the Later Inbox commit itself, persistence is
recoverable in essentially every realistic failure mode, URL opening is
narrowly validated, and no frozen-scope item (Graph, OCR, tray, updater,
notifications, etc.) has crept back in. One P1 is worth fixing before or on
day one of dogfooding — a native window-close path that silently discards
unsaved capture text, contradicting the milestone's own "no silent discard"
acceptance criterion — but it is a ~15-20 line fix that touches no persisted
data and no established behavior, so it does not gate starting a bounded,
single-user dogfood window. The P2s are real and worth landing early in that
window; none of them corrupts already-saved data or exposes the app beyond
its own local user.

---

## 1. Findings by severity

### P0 — none found

Checked and clear: product coherence (Later Inbox stays a bounded personal
task list, never merges into source-owned attention state), core security
boundary (CSP is `default-src 'self'` on every window, no shell/opener plugin,
URL scheme allowlisted at both save and open time), and source-semantics
integrity (the M9 commit touches zero lines in `attention_signals` or
`teams_mirror`).

### P1

#### P1-1. Native title-bar close silently discards an unsaved capture/edit draft, bypassing the only unsaved-draft guard that exists

- **Where:** `src/later-inbox-window.ts:13-21` (the `"later"` `WebviewWindow`
  is created with no `decorations: false`, so it gets Tauri's default native
  OS title bar and close button); `src/LaterInboxView.tsx:70-75`
  (`closeWindow` only `hide()`s the window), `:105-122` (Escape key handler
  checks `dirty` and shows a "Draft kept... Discard draft and close" prompt
  before closing), `:230-242` (in-app "Close" button applies the same guard).
  I grepped the full `src/` tree for `onCloseRequested`/`close-requested` and
  found zero matches — no handler intercepts the native close event anywhere.
- **Evidence:** Escape and the in-app Close button both route through
  `dirty` (line 46: `Object.values(form).some(Boolean)`) before calling
  `closeWindow()`. The native OS "X" has no equivalent interception; Tauri's
  default behavior for a window with no `onCloseRequested` listener is to
  destroy the webview immediately on that event.
- **Impact:** A user who opens Later Inbox, starts typing a title/context/URL/
  follow-up, and clicks the native X (the single most common way anyone
  closes a Windows dialog, more likely than Escape or the small in-app Close
  button) loses that draft with **no** warning — the exact "silent discard"
  scenario Milestone 9's acceptance gate explicitly says cannot happen
  (`docs/milestones/milestone-9-later-inbox.md`, "no silent Escape discard").
  No already-saved item is at risk — persistence happens synchronously per
  command, independent of window lifetime — this is purely in-progress,
  unsubmitted text.
- **Smallest correction:** Register `getCurrentWindow().onCloseRequested(event
  => { if (dirty) { event.preventDefault(); /* show the existing discard
  prompt */ } else { void closeWindow(); } })` in `LaterInboxView.tsx`, or set
  `decorations: false` on the window and rely solely on the in-app Close
  control (consistent with how the "main" window already has no native
  chrome). Either is a small, self-contained change.
- **Verification status:** Directly verified (absence of any handler
  confirmed by full-tree grep; window creation options read in full). The
  "Tauri destroys on unhandled native close" default is a well-documented
  framework behavior, not independently reproduced by launching the app in
  this read-only audit.
- **Note on divergence:** the other review in this directory rates this
  finding P2. I rate it P1 because it is a verified, reproducible violation of
  an explicit written acceptance criterion, triggered by the single most
  likely user action for closing any window — not because it risks persisted
  data. The fix is trivial either way.

### P2

#### P2-1. Closing Later Inbox opened from the Advanced window sends focus to the main widget, not back to Advanced

- **Where:** `src/LaterInboxView.tsx:70-75`:
  ```ts
  const closeWindow = useCallback(async () => {
    const main = await WebviewWindow.getByLabel("main");
    await getCurrentWindow().hide();
    await main?.setFocus();
    await emitTo("main", LATER_INBOX_FOCUS_EVENT);
  }, []);
  ```
  This unconditionally targets `"main"`. `LATER_INBOX_FOCUS_EVENT` is listened
  for in exactly one place, `src/WidgetView.tsx:615-633` (a full-tree grep
  confirms this). `src/LaterInboxDataPanel.tsx:95-99` renders its own "Open
  Later Inbox" button (`onClick={() => void openLaterInboxWindow(...)}`) with
  no ref and no focus-restoration wiring — `AdvancedView` in `src/App.tsx` has
  no listener for the focus event at all.
- **Evidence:** the M9 evidence doc's own claim about this behavior
  (`docs/milestones/evidence/m9/2026-08-14-later-inbox.md:31`, "Close now
  hides the least-privilege reusable Later window, focuses the main widget,
  and explicitly returns DOM focus to the Later launch button") is accurate
  only for the main-widget launch path. It does not mention, and evidently was
  not exercised against, the Advanced-window launch path this same evidence
  row lists as passing ("Advanced data controls... Open Later Inbox").
- **Impact:** a keyboard or screen-reader user who opens Later Inbox from
  Advanced and then closes it lands on the main compact widget window instead
  of back where they were — disorienting, and if the main widget is behind
  other windows or minimized, effectively a lost focus target.
- **Smallest correction:** have `openLaterInboxWindow`/`closeWindow` track the
  invoking window's label (main vs. advanced) and target that label for
  `setFocus()`/the focus event, with a corresponding listener + button ref
  added in `AdvancedView`/`LaterInboxDataPanel`.
- **Verification status:** Directly verified (read `closeWindow`, grepped for
  the single focus-event listener, confirmed the Advanced "Open Later Inbox"
  button exists at `LaterInboxDataPanel.tsx:95-99`).

#### P2-2. Editing a second item while a save is still in flight silently discards the newly-opened draft

- **Where:** `src/LaterInboxView.tsx:39` (single shared `pending` state for
  submit/complete/restore), `:132-161` (`submit`, unconditionally calls
  `resetForm()` on success at line 154, which wipes `editingId` and all form
  fields), `:397` (`<button onClick={() => editItem(item)}
  type="button">Edit</button>` — **no `disabled={pending}`**), contrast with
  `:398-404` (Complete: `disabled={pending}`) and `:423-429` (Restore:
  `disabled={pending}`).
- **Evidence:** I read all three buttons side by side — Edit is the only one
  of the three missing the disabled-while-pending guard that its siblings
  already have.
- **Impact:** user clicks Save on item A (request in flight, `pending=true`),
  then immediately clicks Edit on item B — `editItem` populates the form with
  B's data. When A's request resolves, `resetForm()` fires unconditionally and
  wipes the in-progress edit of B with no warning. No backend data
  corruption, but a real, reproducible loss of unsaved input during normal
  fast use (e.g., triaging several items in a row).
- **Smallest correction:** add `disabled={pending}` to the Edit button,
  matching the adjacent Complete/Restore buttons. One attribute.
- **Verification status:** Directly verified (read all three button
  definitions and the `submit`/`resetForm` bodies).

#### P2-3. Deleting all/completed items briefly leaves the "permanently deleted" content recoverable in the backup file if the process is killed at the wrong instant

- **Where:** `src-tauri/src/later_inbox.rs:269-297` (`mutate_with_backup`):
  ```rust
  action(&mut loaded.store)?;                 // e.g. store.items.clear()
  write_store(&path, &loaded.store)?;         // see below — backs up OLD content first
  if !preserve_backup {
      let backup = backup_path(&path);
      if backup.exists() {
          fs::remove_file(backup)...;          // backup purged HERE, after write_store returns
      }
  }
  ```
  and `:431-461` (`write_store`), specifically:
  ```rust
  if path.exists() && read_store(path).is_ok() {
      fs::copy(path, backup_path(path))...;    // copies the PRE-mutation primary
  }
  if path.exists() { fs::remove_file(path)...; }
  fs::rename(&pending, path)...;               // commits the POST-mutation (post-deletion) content
  ```
- **Evidence:** I read both functions in full myself. `write_store`'s internal
  backup step always copies whatever was in the primary file *before* this
  call, into `later-inbox.backup.json` — including, on a delete-all/
  delete-completed call, the very items about to be deleted — before the
  post-deletion content replaces the primary. Only *after* `write_store`
  returns does `mutate_with_backup` separately delete that backup file. Both
  files therefore genuinely coexist on disk between those two steps: a new
  primary with the items gone, and a backup that still has them.
- **Impact:** if the process is killed (crash, forced reboot, "End task",
  power loss) in that narrow window, `later-inbox.backup.json` survives on
  disk containing the just-deleted content in full, directly contradicting
  ADR 0026's stated guarantee: *"Explicit deletion removes the previous
  backup containing the deleted content"*
  (`docs/decisions/0026-add-local-first-later-inbox.md:45-46`). This is a
  narrow-timing scenario (a handful of sequential filesystem calls), not a
  routine failure mode, but it directly undercuts a feature framed as a
  privacy/deletion guarantee.
- **Smallest correction:** for the `preserve_backup == false` path, skip the
  backup-copy step inside `write_store` entirely (e.g., a `write_store`
  variant/parameter that never touches `backup_path` when the caller already
  intends to discard history) rather than writing the backup and racing to
  remove it.
- **Verification status:** Directly verified by reading both functions.
- **Note on divergence:** the other review in this directory lists this exact
  code path as "untested" (a missing-test finding) but separately states in
  its positive confirmations that "delete-completed and delete-all also
  remove the backup that would otherwise retain deleted content" without the
  crash-timing caveat. Having read the same lines, I don't think that
  claim holds in the crash case — the guarantee only holds in the
  no-crash steady state. I'm flagging this explicitly since it's a case where
  two independent reads of identical code reached different conclusions about
  severity, not about the underlying facts.

#### P2-4. The "later" window is granted capabilities its own code never uses; the M9 evidence doc's "least-privilege" description of it is not accurate as written

- **Where:** `src-tauri/capabilities/default.json:5-16` applies one shared
  permission set to `"windows": ["main", "advanced", "later"]`, including
  `core:webview:allow-create-webview-window`, `allow-set-always-on-top`,
  `allow-set-position`, `allow-set-size`, and `allow-start-dragging`. I
  grepped `src/later-inbox-window.ts` and `src/LaterInboxView.tsx` for
  `setSize|setAlwaysOnTop|startDragging|setPosition|new WebviewWindow` —  the
  only match in either file is the `new WebviewWindow("later", ...)`
  constructor call itself; the "later" window's own code only ever calls
  `.show()`, `.hide()`, `.setFocus()`.
- **Evidence:** the evidence doc explicitly describes the result as "the
  least-privilege reusable Later window"
  (`docs/milestones/evidence/m9/2026-08-14-later-inbox.md:31`, confirmed by
  direct grep). The capability file grants it the identical, broader set
  used by "main" (which does call `setSize`/`setPosition`/`setAlwaysOnTop`/
  drag at `WidgetView.tsx:725,748,773,786,808`).
- **Impact:** a least-privilege gap, not an active exploit today — the CSP is
  `default-src 'self'` with no remote content and no `dangerouslySetInnerHTML`
  anywhere in the Later Inbox surface, so there's no obvious injection path
  into the "later" webview that would leverage the extra grants. It is,
  however, unnecessary attack surface, and the documentation claim describing
  it as "least-privilege" overstates what was actually done.
- **Smallest correction:** split `capabilities/default.json` so "later" gets
  only `core:window:allow-hide`, `allow-show`, `allow-set-focus`; keep the
  drag/position/size/always-on-top/create-window grants scoped to
  `["main"]` (and `create-webview-window` also for `["advanced"]`, which
  legitimately opens both "advanced" and "later"). Also soften or correct the
  evidence doc's wording.
- **Verification status:** Directly verified (read the capability file,
  grepped both frontend files for the relevant API calls, grepped the
  evidence doc for the exact quoted phrase).

#### P2-5. README.md is stale relative to Milestone 8 — still describes three fixed sources and two visual toggles

- **Where:** `README.md:30-32`: "Advanced can monitor any selected subset of
  the three fixed sources and can independently disable the visual-only
  Teams or Telegram taskbar surface; existing preferences migrate to all
  sources and both visuals enabled." Compare `docs/architecture.md:60-63`,
  which correctly documents six monitored sources and "the independent
  five-source live-visual preferences," matching Milestone 8's addition of
  Slack, Viber, and WhatsApp as opt-in DWM-visual sources.
- **Evidence:** I read both paragraphs directly; README was not updated when
  Milestone 8 (ADR 0024/0025) shipped, while architecture.md was.
- **Impact:** no functional impact — this is the project's most-read
  onboarding document undercounting a shipped feature (three sources instead
  of six, two visual toggles instead of five). A contributor or reviewer
  relying on README alone would materially misjudge the app's current scope.
- **Smallest correction:** update `README.md:30-32` to match
  `architecture.md:60-63`'s six-source/five-visual description.
- **Verification status:** Directly verified.

#### P2-6. The Later Inbox mutation API has no automated test coverage beyond its private storage primitives

- **Where:** `src-tauri/src/later_inbox.rs:553-643` (`#[cfg(test)] mod
  tests`, 4 tests). I grepped the identifiers of the public functions Tauri
  commands actually call — `create_item`, `update_item`, `complete_item`,
  `restore_item`, `delete_completed`, `delete_all`, `item_url`,
  `open_external_url`, `MAX_ITEMS`, `MAX_FILE_BYTES` — against the test
  module and found none of them referenced there. The existing 4 tests call
  only the private helpers (`normalize_input`, `write_store`, `read_store`,
  `load_store`) directly, bypassing the `Mutex` gate and the
  `mutate`/`mutate_with_backup` wrapper entirely.
- **Evidence:** confirmed by direct grep/read of the test module against the
  full symbol list in the file.
- **Impact:** the file-I/O primitives (atomic-ish write, backup, corruption
  recovery, future-schema refusal) are genuinely tested and match what the
  milestone doc claims. But the orchestration layer that wraps them — locking,
  the 1,000-item/1 MiB guards at the command boundary, the delete-all-vs-
  delete-completed distinction, and specifically the pending-file
  crash-recovery path and the P2-3 backup-purge race above — has zero
  automated regression coverage. Confidence in these paths currently rests on
  one live/manual evidence pass, not a repeatable test.
- **Smallest correction:** two focused Rust tests are the highest-value
  additions: (1) construct a `later-inbox.pending.json` with no primary file
  present and assert `load_store` recovers it; (2) call the real
  `delete_all`/`delete_completed` functions (not the private helpers) against
  a temp app-data path and assert the backup file is actually gone afterward.
  Both call already-exported functions; no new test infrastructure is needed.
- **Verification status:** Directly verified.

#### P2-7. No forced-colors reinforcement for any new Later Inbox visual state

- **Where:** `src/App.css:1516-1527` is the project's existing
  `@media (forced-colors: active)` block, which explicitly reinforces
  `.widget-app-slot[data-health="retrying"|"stale"]` and
  `.widget-app-surface`. I grepped the full stylesheet for `.later-*` and
  `.widget-later` entries inside any forced-colors block and found none. The
  new due-state classes this diff adds — `.widget-later[data-due]`
  (amber border, `App.css:1098-1101`), `.later-list > li[data-due]` (amber
  left border, `:705-709`), and the discard/recovery warning banners
  (`:653-660`) — are not covered.
- **Evidence:** direct grep of `App.css` for `forced-colors` (one block,
  cited above) and for the new Later Inbox selectors (present elsewhere in
  the file, absent from that block).
- **Impact:** mitigated but not eliminated — due state also carries a text
  label ("Due" in the list, `LaterInboxView.tsx:382`, and a "!" prefix in the
  widget badge, `WidgetView.tsx:1101`), so this is not a sole-reliance-on-color
  violation. But the project's own established convention of reinforcing
  state distinctions under forced-colors/high-contrast mode was not extended
  to this feature, so the amber-vs-neutral border distinction specifically
  may be flattened by the browser's forced-colors override in that mode.
- **Smallest correction:** add the three new selectors to the existing
  forced-colors block, mirroring the `outline` treatment already used for
  `data-health`.
- **Verification status:** Directly verified (grep-confirmed absence);
  rendering behavior under an actual forced-colors browser session was not
  reproduced in this read-only audit.

### P3

#### P3-1. `write_store` replaces the primary file via manual delete-then-rename instead of an atomic replace

- **Where:** `src-tauri/src/later_inbox.rs:455-459`:
  ```rust
  if path.exists() { fs::remove_file(path)?; }
  fs::rename(&pending, path)?;
  ```
  On Windows, `fs::rename` can replace an existing destination directly
  (`MOVEFILE_REPLACE_EXISTING` semantics) without a separate `remove_file`
  first.
- **Impact:** none observed today — `load_store` (`:324-334`) explicitly
  checks for `later-inbox.pending.json` when the primary is missing and
  recovers from it, so the brief window where neither file exists at its
  final path is covered. This is unnecessary complexity around the exact
  guarantee it's meant to provide, not a live data-loss bug.
- **Smallest correction:** delete the manual `remove_file` and let
  `fs::rename(&pending, path)` replace the destination directly.
- **Verification status:** Directly verified (code read); Windows `rename`
  replace-semantics are well-documented stdlib behavior, not independently
  executed here.

#### P3-2. Per-item action buttons share identical accessible names across every row

- **Where:** `src/LaterInboxView.tsx:392-404` (Open link / Edit / Complete)
  and `:423-429` (Restore) — every list item repeats the same button text
  with no item-specific `aria-label`.
- **Impact:** a screen-reader user navigating via a buttons list hears
  "Complete, button" repeated once per open item with no way to distinguish
  them without linear reading.
- **Smallest correction:** add `aria-label={\`Complete ${item.title}\`}` (and
  equivalents for Edit/Restore/Open link).
- **Verification status:** Directly verified (read the JSX).

#### P3-3. The Later Inbox entry-point badge is visually close to source-notification badges

- **Where:** `src/App.css:1062-1080` (`.widget-app-badge`, used for
  Teams/Telegram/Outlook counts) and `:1113-1136` (`.widget-later__badge`) —
  identical geometry (`top:-4px; right:-4px; min-width:18px; height:18px;
  border-radius:999px`), differing only in hue (red vs. blue/amber) and the
  dynamically-appearing "!" prefix, on visually adjacent 48×48 tiles in one
  row (`WidgetView.tsx:1084-1105`).
- **Impact:** low but real — a colorblind user or a quick glance could
  momentarily conflate "someone is messaging you" with "you have a personal
  reminder," which cuts against the deliberate source-owned/user-owned
  separation this feature is designed around (that separation is real and
  code-enforced elsewhere — see positive confirmations — this is purely a
  glance-level visual-differentiation gap).
- **Smallest correction:** give the Later Inbox badge a distinct shape (e.g.
  rounded-square instead of a circular pill) rather than relying on hue alone.
- **Verification status:** Directly verified (CSS read side by side).

#### P3-4. Milestone 6's own closeout gate was never formally closed; later milestones shipped past it without a top-level note

- **Where:** `docs/milestones/milestone-6-beta-hardening.md:159-174` requires
  "four additional distinct calendar days" of dogfood evidence and disposable
  clean-machine execution before an "Exit decision" is recorded.
  `docs/milestones/evidence/m6/closeout-ledger.md:83-96` confirms both remain
  unmet, and issue `M6-003` is still status `new`
  (`docs/milestones/evidence/m6/issue-log.md`). Milestones 7, 8, and 9 (each
  with its own ADR) shipped on top of this within roughly two calendar days.
- **Impact:** none functionally — each subsequent milestone has its own
  separate ADR and acceptance gate, which is the documented escape clause
  ("new semantics, providers, lifecycle modes, settings families" require
  separate approval, not full M6 gate closure). But no document states this
  connection at a top level, so a reader of `milestone-6` alone would not
  know M7-M9 already shipped past its open gate.
- **Smallest correction:** one sentence at the top of `milestone-6-...md` or
  in `closeout-ledger.md` noting that M7-M9 proceeded under their own
  separately-approved ADRs while the original M6 dogfood/clean-machine gate
  remains open.
- **Verification status:** Directly verified (read the cited files).

#### P3-5. Reopening the (hidden, not destroyed) Later Inbox window does not refocus the title field

- **Where:** `src/LaterInboxView.tsx:77-80` — `titleRef.current?.focus()` and
  the initial `refresh()` run inside a `useEffect` with `[refresh]` deps,
  i.e., only on first mount; `src/later-inbox-window.ts:6-11` — the reuse path
  (`existing.show()` / `existing.setFocus()`) does not remount the React tree
  or emit any signal the component listens for.
- **Impact:** first open correctly focuses the title field (supporting the
  "capture in one click" flow the placeholder text implies); every
  subsequent reopen after a hide leaves focus wherever it last was, requiring
  extra keyboard navigation.
- **Smallest correction:** on the reuse path, emit a small event to the
  "later" window (mirroring the existing `LATER_INBOX_FOCUS_EVENT` pattern in
  reverse) and refocus the title field there when the form is not dirty.
- **Verification status:** Directly verified.

#### P3-6. Five legacy per-source Tauri mirror commands remain registered but unused

- **Where:** `src-tauri/src/lib.rs` still registers `start_teams_mirror`,
  `stop_teams_mirror`, `get_telegram_mirror_status`, `start_telegram_mirror`,
  `stop_telegram_mirror`, and `set_taskbar_mirror_layout` alongside the newer
  generic `start_taskbar_mirror`/`stop_taskbar_mirror`/
  `set_fixed_taskbar_mirror_layout` introduced by the M7/M8 generalization. A
  grep of `src/` shows only `get_teams_mirror_status` is still invoked from
  the frontend (`App.tsx:327`).
- **Impact:** none functional — dead command surface left over from the
  M7→M8 generalization, unreachable from any UI, but unnecessary API surface.
- **Smallest correction:** remove the five unused commands and their
  `invoke_handler!` registrations in a follow-up cleanup; not part of this PR.
- **Verification status:** Reported by the regression-focused sub-agent via
  `git show --stat` per commit and a grep for call sites; I did not
  independently re-run the grep, so this one is carried forward as reported
  rather than re-verified line-by-line by me.

#### P3-7. All eight Later Inbox Tauri commands are synchronous and perform blocking file I/O (with `fsync`) and, for link-opening, `ShellExecuteW`, on the main thread

- **Where:** `src-tauri/src/lib.rs:311-392` — every one of
  `get_later_inbox_snapshot`, `create_later_inbox_item`,
  `update_later_inbox_item`, `complete_later_inbox_item`,
  `restore_later_inbox_item`, `delete_completed_later_inbox_items`,
  `delete_all_later_inbox_items`, and `open_later_inbox_item_url` is declared
  as a plain `fn`, not `async fn` (confirmed by reading all eight signatures).
  Tauri v2 runs synchronous commands on the main thread rather than the async
  runtime.
- **Impact:** low — bounded by the 1 MiB file cap, so each write is small;
  worst case is a brief UI hitch on a slow disk or while the default browser
  handler resolves for link-opening, not a freeze. Not observed live in this
  read-only audit.
- **Smallest correction:** mark the commands `async fn` (Tauri then schedules
  them off the main thread). Reasonable to defer past initial dogfooding.
- **Verification status:** Directly verified (read all eight command
  signatures in `lib.rs`).

---

## 2. Positive confirmations

1. **Source semantics are fully intact and the M9 commit never touches
   them.** `git show df687a3 --stat` (verified directly) lists 21 files —
   none under `src-tauri/src/attention_signals/` or
   `src-tauri/src/teams_mirror/`. The large diffs in those directories
   (77+147 and 54+277 lines respectively) all trace to the already-shipped
   M7 commit (`da431d3`, released as `0.4.0-beta.1`) and M8 commits
   (`d02899a`, `a397658`, `7666b73`), not to anything hidden inside the
   "Later Inbox" work.
2. **Teams stays qualitative, Telegram stays numeric, Outlook stays aggregate
   with last-observed fallback, and Slack/Viber/WhatsApp stay presence-only**
   — each source's `capture_*` function in
   `attention_signals/windows_adapter.rs` still emits the semantics
   documented in the product baseline, and `src/attention-model.ts` still
   excludes the three presence-only sources from `semanticSources` before
   computing `allClear`/`needsAttention`.
3. **DWM pixels are never treated as semantic counts.**
   `TaskbarMirrorStatus.visual_only` is hard-coded `true` for every source,
   and the mirror's own `taskbar_count` (a monitor/surface count for
   re-crop bookkeeping) never feeds into any `AttentionSignal`.
4. **User-owned vs. source-owned attention is a real, code-enforced
   boundary, not just copy.** `LaterInboxDataPanel.tsx:73-76` states the
   items "are separate from source attention coverage and never affect All
   clear," and `summarizeAttention` (`attention-model.ts`) computes
   `allClear`/`needsAttention` purely from `AttentionSignalSnapshot.sources`
   — Later Inbox data never enters that computation.
5. **Schema-version handling is strict and safe.** `read_store` requires an
   exact version match; anything greater is a hard `FutureVersion` error that
   propagates before any write is attempted — verified by reading the full
   `?`-propagation chain from `load_store` through every mutating command.
   Confirmed by the existing test `recovers_from_backup_but_refuses_future_schema`.
6. **Corrupt-primary recovery and whole-store revalidation work as
   documented.** A corrupt or invalid primary falls back to the backup
   (never silently produces an empty store when a valid backup exists), and
   every loaded record is revalidated (ID uniqueness/length, title/context
   length, URL format via the same normalizer used on input, RFC3339
   timestamps) before being trusted.
7. **Storage is genuinely bounded**, both on read and write:
   `MAX_ITEMS = 1_000` and `MAX_FILE_BYTES = 1_048_576` are enforced at the
   command boundary and re-checked on load.
8. **URL handling is narrow and defense-in-depth.** Scheme is allowlisted to
   `http`/`https` and embedded credentials are rejected, at both save time
   (`normalize_input`) and again immediately before opening
   (`item_url`→`normalize_url`); no `tauri-plugin-shell`/`opener` dependency
   exists anywhere in `Cargo.toml` — opening goes through one narrow,
   validated native command, not a general-purpose shell capability exposed
   to any WebView.
9. **CSP is uniformly restrictive.** `default-src 'self'; connect-src ipc:
   http://ipc.localhost` applies to all three windows with no per-window
   relaxation for `"later"`.
10. **Cross-window state sync works correctly.** Every mutating command emits
    a shared `later-inbox-changed` event; the widget badge, the review
    window, and the Advanced data panel all subscribe and stay in sync.
11. **Core accessibility fundamentals are solid.** Every interactive control
    is a native `<button>`/`<input>` (no click-only `div`s found); the
    follow-up field is a genuine `<input type="datetime-local">`; target
    sizes are 48×48 (entry point) and ≥32px (in-list actions); due state
    carries a text label ("Due"/"!") in addition to color/border changes;
    focus-visible outlines apply uniformly via existing global CSS rules.
12. **No scope creep found anywhere.** Every ADR (0021-0026) and milestone
    doc (6-9) repeats an explicit closed-scope list (Graph, OCR, generalized
    providers, tray, autostart, updater, signing, telemetry, notifications,
    attachments/tags/recurrence), and no code path in the diff touches any of
    that surface.
13. **Geometry is internally consistent everywhere** — README, architecture.md,
    ADR 0026, milestone-9, the M9 live-evidence measurement, and
    `widget-layout.ts`'s own test all agree on the 744-1208×1112px range and
    the two fixed 48px slots reserved for Later/Advanced.
14. **M6-M9 evidence artifacts read as genuine, not fabricated.** PowerShell
    script output schemas were cross-checked field-for-field against the
    corresponding JSON/CSV evidence files (e.g.
    `test-attention-hub-outlook-fallback.ps1` vs.
    `evidence/m6/2026-08-13-installed-outlook-fallback.json`); non-round
    timing values are internally consistent across independently-authored
    narrative logs and raw data files, which is a strong (if indirect) signal
    against hand-fabrication.

---

## 3. Documentation/evidence claims that are overstated, stale, or unsupported

1. **README.md's messenger-controls paragraph is stale** (see P2-5) — still
   describes three fixed sources and two visual toggles; `architecture.md`
   has the correct six-source/five-visual description.
2. **The M9 evidence doc's "least-privilege reusable Later window" phrase
   overstates the capability grant** (see P2-4) — it is identical to
   `main`/`advanced`'s broader set, not narrowed to what the window actually
   uses.
3. **The same evidence row's focus-return claim is accurate only for the
   main-widget launch path**, and doesn't disclose that the Advanced-window
   launch path (which the very next evidence row confirms exists and was
   exercised) returns focus differently (see P2-1).
4. **Milestone 6's closeout gate is stated as unmet in its own ledger**, yet
   no document connects the dots that M7-M9 already shipped past that open
   gate under separate ADR approval (see P3-4) — technically covered by the
   documented escape clause, but easy to miss from any single document.
5. **The M6 "Day 2" dogfood log entry is honestly self-described as doing
   essentially nothing** ("no installed Attention Hub process was running,"
   "not exercised" for nearly every field) yet still counts toward the
   "at most one entry per calendar day" cadence — a process weakness, not a
   misrepresentation, since it discloses its own emptiness rather than
   inflating it.
6. **Correctly honest, checked and NOT found overstated:** the M9
   acceptance gate's own unchecked box ("native mirror pixel alignment...
   remains unclaimed") is deliberate and accurate; the Rust unit-test claims
   ("validation, unsafe URL rejection, previous-valid backup, corrupt-primary
   recovery, future-schema refusal") map one-to-one onto the four tests that
   actually exist; the frozen-scope lists in every ADR/milestone doc are
   accurate and consistently repeated.

---

## 4. Minimal recommended next-step plan

1. Fix P1-1 (native close discards drafts) — add an `onCloseRequested`
   handler on the "later" window routed through the existing dirty-guard/
   `closeWindow` path, or set `decorations: false` and drop native chrome
   entirely to match "main."
2. Fix the two cheap P2 correctness bugs together: add `disabled={pending}`
   to the Edit button (P2-2), and make `closeWindow`/`openLaterInboxWindow`
   track and target whichever window actually invoked Later Inbox instead of
   hardcoding `"main"` (P2-1).
3. Close the backup-purge crash window (P2-3): make the `preserve_backup ==
   false` path skip writing pre-mutation content into the backup file at all,
   rather than writing it and racing to delete it.
4. Add the two highest-value Rust tests (P2-6): pending-file crash recovery,
   and a real `delete_all`/`delete_completed` call confirming the backup is
   actually gone afterward — both call already-exported functions against a
   temp path, no new test infrastructure required.
5. Narrow the "later" window's capability grant to `allow-hide`/`allow-show`/
   `allow-set-focus` only (P2-4), and correct the "least-privilege" wording in
   the M9 evidence doc.
6. Refresh `README.md`'s messenger-controls paragraph to match
   `architecture.md` (P2-5).
7. Add the forced-colors rules for the three new Later Inbox selectors
   (P2-7).
8. Then proceed with bounded, single-user dogfooding as planned — continue
   the M6-style daily log, and keep treating the still-open native-mirror-
   pixel-alignment and 200%-scaling/forced-colors sign-off as unverified until
   observed live with a real messenger mirror running.

The P3s (dead command surface, badge shape, refocus-on-reopen, sync IPC
commands, manual remove+rename) are all safe to defer past the start of
dogfooding; none of them touches persisted data or established semantics.

---

## 5. Do not change (rejected scope stays rejected)

- No Microsoft Graph, OCR, generalized providers, or arbitrary integrations.
- No cloud sync, collaboration, imports, or export pickers.
- No attachments, tags, recurrence, priorities, or long-form notes on Later
  items.
- No Windows reminders, toasts, or background timers for follow-up in M9 —
  follow-up must remain passive sort/style data only; a real reminder needs
  its own ADR per ADR 0026's own stated rationale.
- No installer, signing, updater, telemetry, autostart, or tray work.
- No new calendar or provider work; the single securely-stored Published ICS
  source stays as-is.
- No semantic interpretation of DWM pixels — mirrors remain visual-only,
  confirmed untouched by this diff.
- Do not widen the capability file or add a generic shell/opener plugin to
  "simplify" URL opening when fixing P2-4 — narrow the "later" grant, and keep
  the existing narrow native `ShellExecuteW` command as the correct boundary.
- Do not reopen Milestone 6's original beta-hardening scope (resource/
  lifecycle measurement) as part of any M9 cleanup — it is its own track with
  its own gate; document the relationship (P3-4), don't re-litigate it here.
- Do not build cross-process file-locking/single-instance machinery
  speculatively — no double-launch incident has been observed; if one is,
  address it then, or record the one-instance operating assumption in the
  dogfood checklist in the meantime.
