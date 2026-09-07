# M17 — Projects and To-dos

Canonical plan for M17. Replaces the single-field "project stash" and the
3-step "Later Inbox" wizard with one Projects/To-dos model, one manager window,
and one local store.

## Decisions locked

| Question | Decision |
| --- | --- |
| Window topology | One Project Hub with top-level Projects and All To-dos tabs. Projects is two-column; the overview is full-width. Compact project and purpose-built Notes/To-dos quick views stay. |
| Naming | **Projects** and **To-dos**. "Stash", "Later Inbox", and "Tasks" are retired as user-facing words. |
| Internal entity | `ActionItem` — deliberately distinct from the UI word, so a future UI rename costs nothing. |
| Window labels | `manager`, `project-panel`. Manager's visible title follows intent (§4a). |
| Storage | One `workspace.json`, schema version 1, created lazily on first mutation. |
| Migration | None. No production data exists. Legacy store files, if present, are ignored and left on disk untouched. |
| Scheduling | `dueOn` (calendar day) and `remindAt` (instant) are separate optional fields, with five separately derived predicates. |
| Navigation | Top-level `Projects | All To-dos` tabs. Projects uses two columns; All To-dos is a full-width chronological cross-owner list. |
| Project removal | Archive (`archivedAt`) is the default action. Delete is permanent, preflighted, revision-guarded, and cascades. |
| Destructive confirmations | Preflight returns cascade counts and a revision; the delete rejects a stale confirmation. Applies to delete-all as well. |
| Notes saves | Optimistically concurrent on `expectedNotesRevision`, held as a separate hydration baseline (§2.6). |
| Tombstones | Not in M17. Deferred until merge-import semantics are specified. |
| Today quick-add | Not in M17. |

## Naming map

| Old | New (user-facing) | New (internal) |
| --- | --- | --- |
| Project stash | Project | `Project` |
| Project stash window | Project panel (compact) | label `project-panel` |
| — | Projects / To-dos (manager window) | label `manager` |
| Later Inbox | To-dos | — |
| Later Inbox item / reminder | To-do | `ActionItem` |
| `scope: work \| private` | *removed* | replaced by owner |
| `followUpAt` | Due / Remind | `dueOn` + `remindAt` |

Spell it **To-dos** (hyphenated, lowercase `d`) everywhere in UI copy, docs, and
release notes. Store key is `actionItems`; commands use `action_item`. The
window label is `manager`, never `projects`.

---

## 1. Data model

Single file: `%APPDATA%/<bundle>/workspace.json`, plus
`workspace.backup.json` and `workspace.pending.json` using the existing
atomic-write pattern.

```jsonc
{
  "schemaVersion": 1,
  "revision": 0,                    // monotonic; +1 per successful mutation

  "categories": [
    { "id", "name", "sortIndex",
      "createdAt", "updatedAt" }
  ],

  "projects": [
    { "id", "name", "notes": [NoteSegment], "notesRevision", "archivedAt": null,
      "sortIndex", "createdAt", "updatedAt" }
  ],

  "lists": [
    { "id", "categoryId": null, "name", "sortIndex", "createdAt", "updatedAt" }
  ],

  "links": [
    { "id", "projectId", "label", "url",
      "kind": "staging" | "production" | "design" | "docs" | "board" | "repo" | "other",
      "sortIndex", "createdAt", "updatedAt" }
  ],

  "actionItems": [
    { "id", "ownerKind": "project" | "list", "ownerId",
      "title", "notes": [NoteSegment],
      "dueOn", "remindAt", "notifiedRemindAt", "completedAt",
      "createdAt", "updatedAt" }
  ],

  "bindings": [
    { "eventKey", "projectId", "projectLinkId", "linkUrl", "createdAt", "updatedAt" }
  ]
}
```

`NoteSegment` is the existing `{ text, href }` shape. Shared parsing and
linkification live in `rich-notes.ts`.

An action item has **no `url` field**. Note segments already carry links, so a
separate URL was a second way to express the same thing. Consequently there is
no `open_action_item_url` command; `open_action_item_note_url` covers it.

`revision` is a top-level monotonic counter, incremented on every successful
mutation and returned in every snapshot. It exists for §1e.

### 1a. `dueOn` vs `remindAt`

This split is the most consequential model change, and it is what makes the
date editing tractable.

| Field | Type | Meaning | Control |
| --- | --- | --- | --- |
| `dueOn` | `"YYYY-MM-DD"`, local calendar day, **no timezone**, optional | "this belongs to that day" | `<input type="date">` |
| `remindAt` | RFC3339 UTC instant, optional | "notify me at this moment" | `<input type="date">` + `<input type="time">` |

- The two are independent. A to-do may have neither, either, or both.
- `dueOn` is a bare date string on purpose. Storing it as an instant is what
  makes to-dos jump a day across DST and timezone changes.
- `remindAt` drives notifications only. One-shot per value, guarded by
  `notifiedRemindAt`, and only while Attention Hub is running.
- Neither field is required. A to-do with no dates is valid and first-class.

### 1b. Derived predicates

Computed in `workspace-model.ts`, never stored. Each is independent and **none
subsumes another** — in particular, an elapsed reminder is *not* overdue.
Overdue is a statement about the due day only.

```
overdue         = !completed && dueOn != null && dueOn <  todayLocal
dueToday        = !completed && dueOn == todayLocal
reminderToday   = !completed && remindAt != null && remindAt falls on todayLocal
reminderReached = !completed && remindAt != null && remindAt <= now
unscheduled     = !completed && dueOn == null && remindAt == null

actionable      = overdue || dueToday || reminderToday || reminderReached
attention       = overdue || reminderReached
```

Consumers:

| Consumer | Uses |
| --- | --- |
| Today popup list | `actionable` |
| Widget numeric badge | count of `actionable` |
| Widget `!` marker | any `attention` |
| Column 2 open count | all incomplete — neutral, no state colour (§4a) |
| Column 2 dot | one dot: accent when `dueToday \|\| reminderToday`, warning when `attention` (warning wins) |
| Manager Unscheduled filter | `unscheduled` |
| Notification | `remindAt <= now && notifiedRemindAt != remindAt` |

`reminderToday` and `reminderReached` overlap for a reminder earlier today, and
diverge either side of it: a reminder set for tonight is `reminderToday` but not
yet `reminderReached`; one from last week is `reminderReached` but not
`reminderToday`. Both belong in Today's union; only the second raises `!`.

Sort order for any to-do list: incomplete first, then `effectiveAt` ascending
(no dates last), then `createdAt` ascending, where

```
effectiveAt = min( dueOn ? endOfLocalDay(dueOn) : ∞ , remindAt ?? ∞ )
```

There is no manual reordering of to-dos.

### 1c. Projects, personal lists, and optional categories

Projects and personal lists are direct peers in one navigation sidebar, with
Projects visually dominant. `Inbox` is the only seeded personal list. Optional
personal categories merely group personal lists in that sidebar; they never
create another navigation level and projects do not belong to a category.

### 1d. Archive vs delete

*Archive* sets `archivedAt`; *unarchive* clears it. It is the default,
reversible action offered inline on the project row. Archived projects are
hidden from column 2 behind a `Show archived` toggle, keep all their notes,
links and to-dos, and keep their calendar bindings intact and functional.

*Delete* is permanent. It is preflighted, revision-guarded, requires a distinct
second action rather than a generic yes/no, uses the destructive write path so
removed content is not retained in the backup, and cascades.

Completed to-dos remain restorable until deleted.

### 1e. Delete-impact preflight and revision guard

Confirmations must state what will be destroyed, and must not act on numbers
that have gone stale while the dialog was open — another window, or the user's
own earlier action, can change the cascade between preflight and confirm.

```
get_delete_impact { entity: "workspace" | "category" | "list" | "project", id? }
  -> { entity, id, name,
       counts: { categories?, projects?, lists?, links?, actionItems?, bindings? },
       workspaceRevision }
```

`id` is omitted for `entity: "workspace"`, which reports the **complete**
cascade — every category, project, list, link, to-do and binding in the store.

The confirmation renders `counts` verbatim — the UI never recomputes a cascade
it might get wrong — and holds `workspaceRevision`.

```
delete_personal_category  { categoryId, expectedRevision }
delete_list               { listId,    expectedRevision }
delete_project            { projectId, expectedRevision }
delete_all_workspace_data {            expectedRevision }
```

If `expectedRevision != store.revision` the command **rejects without
deleting**: *"The workspace changed since this confirmation was shown. Review
the impact and confirm again."* The UI re-runs the preflight and re-renders the
dialog with fresh counts.

Counts include completed to-dos. Which counts are present depends on the
entity:

| Entity | Counts returned |
| --- | --- |
| Workspace | `categories`, `projects`, `lists`, `links`, `actionItems`, `bindings` |
| Project | `links`, `actionItems`, `bindings` |
| Personal category | `lists`, `actionItems` |
| List | `actionItems` |

`delete_all_workspace_data` is not exempt from any of this: it is the widest
cascade in the app, so it takes the same preflight, renders the same verbatim
counts, and rejects the same stale confirmation. Nothing may call it without a
preflighted `expectedRevision`.

Single-entity deletes — links and to-dos — cascade to nothing, so they need no
preflight and no revision guard.

### 1f. Referential integrity

Validated on read; failure takes the backup path, matching today's
`valid_loaded_store`:

- every optional `list.categoryId`, `link.projectId`, `actionItem.ownerId`, and
  `binding.projectId` resolves
- `actionItem.ownerKind` matches the resolved owner's table
- ids unique per table; `dueOn` parses as a calendar date; `remindAt`,
  `notifiedRemindAt`, `completedAt`, `archivedAt`, `createdAt`, `updatedAt`
  parse as RFC3339 where present

### 1g. Ids

Ids are 128-bit random hex rather than the current timestamp-plus-counter
scheme. The reason is identity semantics, not collision odds: a
timestamp-plus-counter id is only guaranteed unique **within the process and
store that minted it**. Two independent installs mint ids from the same
counter space with no coordination, so their id sets carry no cross-store
meaning — you cannot tell whether two ids from different stores denote the same
thing or different things. A 128-bit random id is a globally meaningful
identifier without coordination, which is what any future import needs in order
to match, merge, or keep entities apart.

Every entity also carries `updatedAt`, the precondition for a future
last-write-wins merge.

### 1h. Lazy creation and deterministic seeding

**Nothing is written to disk at startup.** `workspace.json` appears only when
the user first mutates something.

- `get_workspace_snapshot` on a missing file returns the seeded default
  **in memory** and writes nothing.
- The first mutating command materialises the file, seed included.

This only works if seeding is fully deterministic — an in-memory seed followed
by a written seed must be byte-identical, or a UI holding a value from the
first would disagree with the second. So the seeded Inbox uses a reserved
literal id **and fixed literal timestamps**; a `now()` in the seed
path would reintroduce exactly the divergence the reserved ids prevent.

```
SEED_TIMESTAMP = "1970-01-01T00:00:00Z"

list "Inbox"  id "list-inbox"  categoryId null  sortIndex 0

createdAt = updatedAt = SEED_TIMESTAMP
```

Every other id is random hex and every other timestamp is real. Seeding is
idempotent, and seeding in memory then materialising produces an identical
record.

### 1i. Limits

| Entity | Cap |
| --- | --- |
| File | 4 MiB (raised from 1 MiB) |
| Personal categories | 18 |
| Projects | 200 |
| Lists | 200 |
| Links per project | 50 |
| Action items | 2 000 |
| Category / list / project name | 80 chars |
| Link label | 80 chars |
| To-do title | 160 chars |
| Notes | 4 000 chars, 256 segments, 25 links |
| URL | 2 048 chars, HTTPS/HTTP only, no embedded credentials |

---

## 2. Cross-window synchronization — build it, do not assume it

An earlier draft claimed this was already solved and only needed reusing. That
was wrong. The actual state:

| Event | Emitted by | Listened to by |
| --- | --- | --- |
| `later-inbox-changed` | 8 commands ([lib.rs:374](../../src-tauri/src/lib.rs)) | `WidgetView`, `LaterInboxView`, `LaterInboxDataPanel` — **works** |
| `meeting-workspace-changed` | 4 commands ([lib.rs:115](../../src-tauri/src/lib.rs)) | **nobody.** `EVENT_WORKSPACE_CHANGED_EVENT` is exported from [event-workspace-model.ts:1](../../src/event-workspace-model.ts) and never consumed. |
| `work-calendar-changed` | piggybacked from the same emitter ([lib.rs:116](../../src-tauri/src/lib.rs)) | `WidgetView` only ([WidgetView.tsx:1000](../../src/WidgetView.tsx)) |

Project-side sync is not merely incomplete — the dedicated event is dead code,
and the only reason anything refreshes is the `work-calendar-changed` piggyback
reaching the widget's calendar band. `ProjectStashView` and `EventSettingsView`
listen to nothing but their own open-event.

Requirements for M17:

1. Every mutating command emits exactly one `workspace-changed`.
2. Binding mutations additionally emit `work-calendar-changed`, as today.
3. The Notes editor's 850 ms autosave must not fight an inbound refresh — a
   refresh arriving while the local editor is dirty updates everything except
   the focused editor's own content. This rule is precisely what makes two
   dirty editors possible, so it is paired with the guard in §2.6.
4. Subscriptions land with the surface that cuts over, never earlier:

   | Surface | Subscribes in |
   | --- | --- |
   | Manager and the shared views it mounts | PR 2 |
   | Project panel, widget, event settings, advanced data panel | PR 3 |
   | Today popup | PR 4 |

5. **Live cross-window sync is verified in PR 3, as Manager ↔ Project panel.**
   Tauri window labels are unique, so two Manager windows cannot coexist and
   "open the Manager twice" is not a testable scenario. PR 2 verifies only the
   weaker property that two *mounted views* within the Manager converge on a
   `workspace-changed` tick.
6. Notes saves are optimistically concurrent — §2.6 below.

### 2.6 Notes optimistic concurrency

Notes are the one field that is free-text, debounce-autosaved, and routinely
left dirty for minutes at a time, in a component mounted in two windows at
once. Rule 3 deliberately shields a dirty editor from inbound refreshes, which
means two editors can hold divergent text for the same project. Without a
guard, whichever autosave fires second silently destroys the other's work.

```
save_project_notes { projectId, notes, expectedNotesRevision }
```

The command compares `expectedNotesRevision` against the stored
`project.notesRevision` and **rejects a mismatch without writing**. This
notes-specific token avoids false conflicts when a project is renamed,
reordered, or archived while notes are open elsewhere.

**The editor keeps its hydration revision separately from the live record.**
When `<NotesEditor>` hydrates, it captures that project's `notesRevision` and
sends that value with every subsequent autosave — not whatever the newest
snapshot happens to carry. This is the whole mechanism: an inbound
`workspace-changed` refresh must not advance the expectation, or the editor
would silently adopt the other window's write as its own baseline and the
guard would never fire. The hydration revision advances on exactly two events:
a successful save (to the returned `project.notesRevision`), and a deliberate
re-hydration after conflict resolution.

On rejection the editor **never discards the user's text**. It stops
autosaving, enters a conflict state, and offers two explicit resolutions:

| Resolution | Effect |
| --- | --- |
| *Keep mine* | resend with the current stored `notesRevision` as the expectation, overwriting theirs |
| *Load theirs* | re-hydrate from the store, discarding local text, and reset the hydration revision |

Autosave stays suspended until one is chosen, so a stale save can never
retry-loop against the guard.

Scope: notes only. Names, titles, dates and link fields are short, deliberate,
single-shot edits with no dirty-for-minutes window, and last-write-wins is the
right behaviour for them.

---

## 3. Rust surface

### Modules

| Module | Role |
| --- | --- |
| `external_url.rs` **(new)** | `open_external_url` + `normalize_url`. Extracted **and adopted** in PR 1 — see §7. |
| `local_store.rs` **(new)** | Size-capped read, versioned parse, pending-file write, bounded backup, `MoveFileExW` atomic replace, destructive-write variant. Consumed by `workspace.rs` only. |
| `workspace.rs` **(new)** | Owns `workspace.json`: entity CRUD, validation, revision counter, cascade + preflight, lazy seeding, `remindAt` notification, and its own copy of the event-token cache / `enrich_calendar_snapshot` behaviour. |
| `later_inbox.rs`, `meeting_workspace.rs` | Keep serving the legacy surfaces through PR 2; deleted in PR 3. |

### Commands

All mutations return the full `WorkspaceSnapshot` (including `revision`) and
emit `workspace-changed`.

```
get_workspace_snapshot             // never writes; seeds in memory if absent
get_delete_impact                  // { entity, id? } -> counts + workspaceRevision
                                   //   entity: workspace | space | list | project

create_personal_category / rename_personal_category
create_list / rename_list
move_personal_category / move_list // sortIndex

create_project / rename_project / move_project
set_project_archived               // { projectId, archived } -> sets/clears archivedAt
save_project_notes                 // { projectId, notes, expectedNotesRevision }
                                   //   rejects a stale expectation (§2.6)
open_project_note_url

create_project_link / update_project_link / delete_project_link
move_project_link                  // sortIndex
open_project_link

create_action_item / update_action_item
complete_action_item / restore_action_item / delete_action_item
move_action_item                   // reassign ownerKind + ownerId (not ordering)
open_action_item_note_url
delete_completed_action_items      // optional owner filter

// revision-guarded, cascading
delete_personal_category { categoryId, expectedRevision }
delete_list    { listId,    expectedRevision }
delete_project { projectId, expectedRevision }
delete_all_workspace_data { expectedRevision }

notify_due_action_items            // remindAt, guarded by notifiedRemindAt

get_event_workspace / save_event_workspace / unlink_event_workspace
open_event_workspace_link
```

Link, note, and event URLs stay revalidated against the saved store before
Windows opens them.

---

## 4. Windows

### 4a. Manager — label `manager`

940×640, min 820×520, resizable, decorated, geometry persisted via the existing
`readStoredFloatingGeometry` / `writeStoredFloatingGeometry` helpers.

The visible title is **Attention Hub - Project Hub** and the stable window label
is `manager`. Reopening focuses the requested project or To-dos context without
creating another window.

The top level is `Projects | All To-dos`. Projects uses the two-column layout
below. All To-dos replaces both columns with one compact chronological list
across project and personal-list owners. Each row names its owner and supports
completion, note links, inline edit, delete, and navigation to that owner's
detail. Open items precede completed items; within each group the earliest due
date or reminder comes first, and unscheduled items remain visible at the end.
Across all collection views, existing rows appear before their add controls.

```
┌──────────────────────┬────────────────────────────────────────┐
│ PROJECTS             │ DETAIL                                 │
│ Atlas           12 ● │ Atlas                              ⋯    │
│ Orion            4 ● │ [ Notes ][ Links ][ To-dos ]           │
│ Helios            7  │ ────────────────────────────────────   │
│ + New project        │ All 12 · Unscheduled 5                  │
│                      │ …selected tab…                          │
│ PERSONAL             │                                        │
│ Inbox             3  │                                        │
│ Home              2  │                                        │
│ + New list           │                                        │
└──────────────────────┴────────────────────────────────────────┘
```

- **Column 1 — Projects and personal lists.** Projects are the dominant first
  section. Personal lists are a compact secondary section below them. Optional
  personal categories render as group headings, not another navigation level.
  Each row carries a **neutral open count** — every
  incomplete to-do in that project or list, with no state colouring — and **one
  semantic dot**:

  | Dot | Meaning |
  | --- | --- |
  | none | nothing scheduled for today and nothing needing attention |
  | accent | `dueToday \|\| reminderToday` present |
  | warning (amber/red) | `attention` present — takes precedence over accent |

  One dot, two states, never both. Archived projects are collapsed behind
  `Show archived`.
- **Column 2 — Detail.** Project → tabs `Notes | Links | To-dos`, plus a `⋯`
  menu holding Rename, Archive/Unarchive, and Delete…. List → `To-dos` only,
  no tab strip. The To-dos pane header carries an **`Unscheduled (N)` filter**
  alongside the total, so to-dos with neither date stay findable rather than
  sinking to the bottom of the derived order.

Landing state comes from `?focus=projects` or `?focus=todos`; opening from an
event with a project id selects that project directly.

### 4b. Project panel (compact) — label `project-panel`

Renamed from `project-stash`. The full 420×480 project view is anchored beside
the invoking meeting and always on top. It exposes Notes, Links, and To-dos plus
an "Open in Project Hub" action; lifecycle actions remain in Project Hub. The
same singleton window also has purpose-built 360×240 Notes-only and 380×360
pending-To-dos views. Quick views persist separate positions; the full project
view intentionally remains anchor-relative.

### 4c. Widget destinations and utility rail

The original three-control utility rail remains Close, Pin, and Settings. A
separate narrow destination panel immediately after the calendar contains a
Today segment and a vertically split Projects/All To-dos segment. Today shows
`N meetings left` and `N to-dos left`; the latter uses the same actionable
union as the Today popup. All To-dos always shows the active incomplete count,
including unscheduled items, and uses attention colour without replacing that
count. Recommended mode shows labels; Compact single-line shows icons and
compact numeric badges. Today and Projects/To-dos can be hidden independently
from both Advanced settings and the widget context menu; hiding them preserves
their data and shrinks the fixed destination width.

### 4d. Today popup

Calendar rows unchanged. Below them, a read-mostly
`To-dos · needs attention` section listing the `actionable` union (§1b):
inline complete checkbox and the owner name as a subtle tag.

**No quick-add in M17.** `TodayPopupPayload.height` is computed in the widget
and must account for the new section.

---

## 5. Shared components

| Component | Used by |
| --- | --- |
| Project detail — tab strip + panes | Project Hub detail column, compact project panel |
| `<NotesEditor>` — ported from `ProjectStashView`, owns the hydration timestamp and conflict state (§2.6) | Notes tab |
| `<LinkList>` | Links tab |
| `<ActionItemList>` | To-dos tab, personal lists, Today popup (filtered, read-mostly) |
| `<ActionItemEditorRow>` | create **and** edit — one code path, so they cannot drift |

---

## 6. The date-editing defect

### Status: structurally retired; original hypothesis not reproduced

[LaterInboxView.tsx:598](../../src/LaterInboxView.tsx) is a *controlled*
`<input type="datetime-local">`. The suspected mechanism is that Chromium
reports `value === ""` for a partially-entered value, so React writes `""` into
state and re-renders the field empty, discarding the keystrokes; submit then
stays disabled because `fromLocalDateTimeInput("") === null`. That would
explain the intermittency, since clicking through the native picker sets a
complete value in one shot.

The hypothesis was not reproduced before the legacy wizard was removed, so it
is not presented as a confirmed diagnosis. M17 structurally retired the entire
defect class by deleting `datetime-local`, the transformed wizard, and its
separate edit path. Current controls use independent native date and time
inputs and have been exercised on create and inline edit.

### The redesign is worth doing either way

Independent of root cause, the new editor removes the whole class of problem:

- `dueOn` is a plain `<input type="date">`; `remindAt` is `date` + `time`.
  No `datetime-local` anywhere.
- Optional presets — *Today · Tomorrow · Next week · Clear* — and blur-committed
  drafts remain possible future polish, not correctness requirements for the
  split controls.
- No animated or transformed ancestor around any date control.

### Also fixed

- The 3-step wizard becomes one inline row: `Title` → `due` → `⌄ remind, notes`.
  Enter saves, Escape cancels.
- The "Discard draft and close" interrogation on any non-empty field is gone.
- Edit stops being a separate code path from create.

---

## 7. Phases

Each phase is one PR and must leave `pnpm test`, `pnpm build`, and `cargo test`
green.

### PR 1 — Data foundation

No user-visible behaviour change, no deletion of any legacy surface, and no
workspace file on disk.

- Add `external_url.rs` and **switch the existing call sites onto it**:
  `open_work_calendar_join_url` ([lib.rs:102](../../src-tauri/src/lib.rs)),
  `open_project_stash_note_url` ([lib.rs:173](../../src-tauri/src/lib.rs)), and
  the Later Inbox URL commands. `later_inbox::open_external_url` is removed,
  not shadowed. `normalize_url` also moves here; `later_inbox.rs` and
  `meeting_workspace.rs` call it through thin wrappers that supply their own
  label so every user-visible error string is byte-identical
  (`later_inbox`'s takes no label today, `meeting_workspace`'s does).
  The Windows-only `open_external_url` fallback string loses its "Later Inbox"
  wording; that arm is unreachable in shipped builds.
- Add `local_store.rs`, consumed by `workspace.rs` only. The legacy stores are
  **not** rewired onto it: they are deleted in PR 3, so refactoring their write
  paths now would be pure risk for code with a three-week lifespan. This is the
  opposite call from `external_url.rs` because that one has live *shared* call
  sites and this one does not.
- Add `workspace.rs`, the full command surface, the revision counter, the
  delete-impact preflight (including the `workspace` entity), the notes
  staleness guard, and the `workspace-changed` event.
- Add `src/workspace-model.ts` — types, the five predicates, `actionable`,
  `attention`, `effectiveAt`, sort, date helpers.
- **No UI consumes the new commands.**

*Accepts when:* installing and running a PR 1 build creates or modifies **no
`workspace.json`, `workspace.pending.json`, or `workspace.backup.json`** — the
legacy stores may change as normal use dictates; every existing surface behaves
as before, including all URL-opening paths and their error strings; Rust tests
cover in-memory seeding without a write, first-mutation materialisation,
reserved id **and timestamp** stability, revision increment, preflight counts
for all four entity kinds, stale-revision rejection, stale-notes rejection,
cascade delete, orphan rejection, size cap, atomic write and backup; model
tests pass.

### PR 2 — Manager window, unlinked

The Manager is built and fully functional but **has no entry point**. No widget
icon, no menu item, no link from any shipped surface; it is reachable only via
a dev-only path. Legacy surfaces and legacy assets stay exactly as they are.

This is what keeps users from ever seeing two writable sources of truth: the
Manager writes `workspace.json` while Later Inbox and the stash panel still
write the legacy stores, and for the duration of PR 2 nobody can reach both.

- `manager` window, 2-column shell, personal categories/lists/projects CRUD, archive via
  `archivedAt`, and preflight + revision-guarded confirmations for every
  cascading delete
- Sidebar neutral counts and the single semantic dot; the `Unscheduled` filter
- `<ProjectDetail>` with Notes (ported), Links (new), To-dos (new)
- `<ActionItemEditorRow>` with split date/time and presets
- The date-editing repro task (§6)
- `workspace-changed` subscriptions **for the Manager and the shared views it
  mounts only** (§2.4)
- Add `src/styles/_workspace.scss` and register it in the `App.scss` cascade.
  **`_later-inbox.scss` and every other legacy UI asset stay** — they are still
  serving live surfaces. `src/styles/AGENTS.md` gains the new row; nothing is
  removed from it.

*Accepts when:*

- personal categories, projects, lists, and links can each be created, renamed, **explicitly
  reordered**, and deleted; projects additionally archive and unarchive
- to-dos can be created, edited, completed, restored, moved between owners, and
  deleted — **their order is derived (§1b) and is not user-adjustable**, so
  "reorder" is not a criterion for them
- every cascading delete reachable here — personal category, list, project — shows preflight
  counts, and a confirmation left open across an intervening mutation is
  rejected rather than acted on. Delete-all is not reachable from the Manager;
  its preflight is verified in PR 3 with the advanced data panel.
- the `Unscheduled` filter surfaces to-dos with neither date
- two mounted views within the Manager converge on a `workspace-changed` tick
- a to-do's due date can be set both by typing and by picking, on create and
  on edit
- no shipped surface offers a route to the Manager

### PR 3 — Link up, cut over, remove legacy

The switchover. The Manager becomes reachable in the same PR that removes the
legacy surfaces, so the two-sources-of-truth window never opens.

- `project-stash` → `project-panel`, retrofitted to `<ProjectDetail>`
- Separate Today/Projects destination panel with the single strongest-state
  actionable/attention badge; original utility rail remains three controls
- Meeting entry points moved onto the new binding commands
- `workspace-changed` subscriptions for project panel, widget, event settings,
  and the advanced data panel (§2.4)
- Delete `later_inbox.rs`, `meeting_workspace.rs`, `LaterInboxView.tsx`,
  `later-inbox-model.ts`, `later-inbox-window.ts`, `ProjectStashView.tsx`, and
  `_later-inbox.scss`; remove its row from `src/styles/AGENTS.md` and its entry
  from the `App.scss` cascade
- Rename `later-inbox-rich-notes.ts` → `rich-notes.ts`,
  `later-inbox-preferences.ts` → `todo-preferences.ts`,
  `LaterInboxDataPanel.tsx` → `WorkspaceDataPanel.tsx`
- `capabilities/default.json` window list becomes
  `["main", "advanced", "manager", "project-panel", "update", "event-settings", "today"]`

*Accepts when:*

- **an edit in the Manager appears in an open Project panel without reopening
  it, and the reverse** (§2.5)
- **notes conflict, Manager ↔ Project panel** (§2.6): with the same project
  open and dirty in both, saving in one causes the other's autosave to be
  rejected rather than to overwrite. The conflict state keeps the rejected
  text, *Keep mine* wins with the fresh expectation, *Load theirs* discards
  local text and re-hydrates, and neither path leaves autosave retry-looping.
- **delete-all preflight** in the advanced data panel reports complete
  store-wide counts and rejects a confirmation left open across an intervening
  mutation
- opening a project from a meeting shows the same tabs as the Manager
- **archived projects keep working calendar bindings** — verifiable only here,
  since bindings cut over in this PR
- the Manager's visible title is *Attention Hub - Project Hub*
- **destination and utility geometry holds**:

  | Mode | Layout | Width |
  | --- | --- | --- |
  | `recommended` | destination labels + three-control utility rail | destinations 88, utility 20 |
  | `slim` | destination icons + three controls in a row | destinations 48, utility 64 |

  The calendar zone stays flexible and absorbs the delta; resize and grip
  behaviour is unchanged. Both the constants in
  [widget-layout.ts:6](../../src/widget-layout.ts) and the width-mode overrides
  in `_widget-standard.scss` / `_widget-slim.scss` change together, and
  `scripts/test-widget-layout.mjs` is updated.

  The calendar remains the flexible zone and absorbs horizontal resizing.
- no reference to the legacy modules remains; the calendar join-URL path still
  works through `external_url.rs`

### PR 4 — Today and docs

- Today popup to-do section using the `actionable` union, no quick-add, plus
  the height calculation and its `workspace-changed` subscription (§2.4)
- `docs/architecture.md`, `docs/vision.md`, `README.md`, release notes
- Write the §6 repro finding back into this document

---

## 8. Tests

- `scripts/test-workspace-model.mjs` **(new)** — each of `overdue`, `dueToday`,
  `reminderToday`, `reminderReached`, `unscheduled` independently, including the
  cases that distinguish them (elapsed reminder with no `dueOn` is not overdue;
  reminder later today is `reminderToday` but not `reminderReached`); the
  `actionable` and `attention` unions and the badge count; dot state precedence;
  `effectiveAt` sort order; `dueOn` staying a bare calendar date across
  local-timezone and DST boundaries; owner resolution; link kind validation; and
  the partial-value date input case from §6. Wired into the `test` chain.
- `scripts/test-widget-layout.mjs` — updated in PR 3 for the separate
  Today/Projects destination panel and original three-control utility rail.
- `scripts/test-later-inbox-model.mjs` and `scripts/test-meeting-workspace.mjs`
  stay until PR 3, then are deleted.
- Rust `workspace.rs` tests: in-memory seed without a write, first-mutation
  materialisation, reserved id and timestamp stability, system-space
  protection, revision increment, preflight counts per entity kind including
  `workspace`, stale-revision rejection on all four cascading deletes,
  `save_project_notes` accepting a current `expectedNotesRevision` and
  rejecting a stale one **without writing**, cascade delete, archive round-trip
  via `archivedAt`, orphan rejection, id uniqueness, size cap, backup
  preservation vs. destructive write.

---

## 9. Non-goals

Subtasks, tags, recurring to-dos, kanban, manual to-do ordering, to-do ↔
calendar-event linkage, Today quick-add, favicon fetching for links (it would
ping third-party servers on every project open, contradicting the local-first
principle in [vision.md](../vision.md)), and any cloud sync.

## 10. Deferred, with a required order of operations

**Import/export.** Must specify merge semantics before any delete-tracking
schema is added. Sequence: define replace-vs-merge → define conflict resolution
on `updatedAt` → decide whether merge needs delete records → if so, add them as
`schemaVersion 2`. Reversing that order is what §1g/§10 exists to prevent.
