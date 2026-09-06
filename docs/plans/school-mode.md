# School mode — draft feature plan

> **Status: saved brainstorming proposal; not approved for implementation.**
> Intended order: **finish M19 → polishing pass → School mode**.
> Milestone number is intentionally unassigned. Revisit and validate this draft
> against the finished M19/polish code before approving a bounded first slice.

- **Discussion date:** 2026-09-05
- **Revised:** 2026-09-06, after a cross-review of this draft against the
  current source. The revision reorders the delivery steps, replaces the
  occurrence-identity risk wording with a named design, adds two hazards the
  first draft missed (published-URL source identity, `RANGE=THISANDFUTURE`),
  and narrows the privacy contract. No code was changed.
- **Planning checkout:** `codex/m19-medicine-tracker`, HEAD `906013d`, with
  substantial uncommitted M19 work. This is not the implementation baseline.
- **Preceding work:** [M19 medicine tracker](m19-medicine-tracker.md) and
  [post-M19 polish audit](../council/2026-09-05-post-m19-polish-audit-devin.md).

Saving this document records the idea and proposed direction. It does not
approve application changes, a new calendar provider, builds, commits, or releases.

## 1. Context confirmed by the product partner

- Two children study remotely, with roughly seven to eight consecutive lessons.
- Long school days make maintaining attention and tracking transitions difficult.
- Each child has their **own laptop**, so each can have an independent Hub setup.
- The lesson calendar comes from **Microsoft Outlook**.
- Zoom links are **mixed**: some reusable, some lesson-specific.
- When joining links change, updates arrive **in messages**, rather than being
  reflected in the calendar event.
- The parent uses the work experience; the children would use the school
  experience. Simultaneous Work/School datasets for one person are not an
  established requirement.

The exact Outlook publication format still needs verification, and that
verification is a **go/no-go gate, not a checklist item** — every step below is
worthless if the real feeds are not usable. See [§8 Step 0](#step-0--feasibility-gate).
A calendar feed must match the currently supported published ICS format; a
shared Outlook web page alone is not sufficient. Do not request or record
private publication URLs in planning documents, public issues, or diagnostics.

## 2. Product goal

**Make it easy to know which lesson is happening, what comes next, and how to
join the correct meeting.**

School mode should reduce the effort of tracking and switching lessons. It
cannot eliminate fatigue from a long day, verify attention, or infer attendance.

Recommended shape: a **School experience on the same Attention Hub core**, not
a separate application, a new learning-management system, or a global string
replacement with unchanged work-oriented interactions.

## 3. Reuse the workspace; separate subjects from lessons

Recommended V1 mapping:

| Work concept | School presentation | Meaning |
| --- | --- | --- |
| Project | Subject | Mathematics, English, History |
| Calendar meeting/event | Lesson | A particular scheduled occurrence |
| Project links | Materials | Textbook, classroom page, useful resources |
| Project notes | Subject notes | Continuing information for that subject |
| Project to-dos | Homework | Tasks associated with a subject |
| Today | Today | Lessons and relevant homework |

**A lesson is not a project or a to-do.** A subject is the long-lived owner of
materials, notes and homework; its lessons are scheduled calendar occurrences.
Several recurring series can refer to the same subject, such as Monday and
Thursday Mathematics.

### Recommended storage decision

Reuse the existing workspace model and local workspace storage for V1. Each
child's laptop has its own setup; no child accounts, per-child profile selector,
separate Work/School databases, or synchronization are needed for the confirmed
use case.

The mode switch is **presentation, not data isolation**. Switching back to Work
would show the same subject records as projects. It does not create a private
second workspace. If shared-account or simultaneous work/school use becomes a
requirement, revisit this explicitly rather than pretending a mode flag supplies
separation.

Keep existing internal names such as `project` where practical. Renaming every
API and persistence field would add migration risk without improving the child's
experience. Additional lesson-override storage is a separate, bounded design
decision; workspace reuse does not mean the existing schema already supports it.

## 4. School-day experience

The distinguishing behavior should reflect the rhythm of a school day.
Illustrative copy, not a final layout specification:

```text
Mathematics · scheduled now
Ends in 12 min                  [Join lesson]

Next: English · 10:15
Lesson 3 of 8
```

Between lessons:

```text
Break · next lesson in 9 min
English at 10:15                [Today's lessons]
```

After the last scheduled lesson:

```text
Today's lessons have ended
Homework: 2 tasks              [Open]
```

### Principles

- Make the next useful action obvious.
- Distinguish scheduled lesson time, breaks and the end of the school day.
- Show progress through the **schedule**, not claimed attendance or completed
  learning. Cancelled lessons and unrelated all-day events must not inflate it.
- Use a quieter default layout without unnecessary work-oriented panels.
- Offer optional gentle reminders near lesson starts, not repeated alarms.
- Do not auto-join meetings, force focus changes, or close a meeting when its
  scheduled end arrives.
- Do not infer that a child attended because Zoom was open or a timer elapsed.
- Missing or stale calendar data must not masquerade as a confirmed break or a
  finished school day.

Homework initially reuses existing to-dos. It should support the daily lesson
experience rather than grow into an assignment-management system.

## 5. Correct joining links, including message-only changes

This is the most important genuinely new behavior in the proposal.

### Proposed resolution order

1. **Explicit override for this lesson occurrence only**.
2. The joining link supplied by that calendar occurrence.
3. An explicitly configured reusable subject/series joining link.
4. Otherwise, show **Join link not set**.

Reusable joining links must be explicit; do not infer them from arbitrary
materials links. If both subject and series defaults are supported, resolve
that precedence during detailed design rather than leaving it ambiguous.

### One-lesson override workflow

Proposed action:

> **Change join link for this lesson…**
> Mathematics — Tuesday, 09:00–09:45
> Other lessons will not change.

A parent or child can paste the replacement link received in a message. The
calendar remains authoritative for lesson timing; the local override changes
only the joining destination.

Two workflow constraints follow from how the link actually arrives:

- The paste action must be reachable in **one click from the current-lesson
  row**, not only through a separate event-settings window. It happens while a
  lesson is starting, on a child's laptop, under time pressure.
- If the parent receives the link but the override must be pasted on each
  child's laptop, no amount of override correctness closes that gap, and §10
  rules out synchronization. That is an acceptable cost, but a **stated** one:
  it also argues for making a subject-level default link equally quick to
  update.

Requirements:

- Ordinary calendar refreshes do not erase the override.
- It never leaks into the next week's occurrence or an unrelated lesson.
- A rescheduled lesson retains the correct association when source identity
  permits; ambiguous changes require an explicit, safe resolution.
- The user can remove an override to return to the calendar/default link.
- Cancelled lessons do not continue presenting an active Join action. A
  cancelled occurrence already receives no workspace key natively, so this
  largely follows from existing behavior — but it also means an override cannot
  be attached to one.
- Retention/cleanup, persistence versioning and deletion behavior are specified
  before implementation.

### Occurrence identity — known design, bounded implementation

This is no longer an open scheduling problem. The parser already reads
`RECURRENCE-ID` and uses it to replace a generated occurrence with its
exception ([semantics.rs](../../src-tauri/src/published_ics/semantics.rs)).
The override key should be:

```text
source namespace + event UID + original recurrence identity
```

The third part is the occurrence's `RECURRENCE-ID` for a recurrence exception,
or the generated occurrence start for an ordinary expanded instance. It is
**not** the replacement lesson's new `DTSTART` — that is what makes an override
survive a reschedule, because Outlook keeps `RECURRENCE-ID` at the original
start while moving `DTSTART`.

Implementation notes established by source inspection:

- The value is dropped earlier than a first reading suggests. `NormalizedEvent`
  retains `recurrence_id`, but `Candidate` has no such field, and
  `push_candidate` receives an override's *new* start. The anchor must be
  threaded as an explicit parameter at expansion time and carried through
  `Candidate`, both the current/next and day-selection contracts, and key
  derivation in [work_calendar/mod.rs](../../src-tauri/src/work_calendar/mod.rs).
  Adding a field to the day-selection struct alone is not sufficient.
- `RECURRENCE-ID` may arrive TZID-qualified or as UTC, while master expansion
  generates occurrences in the series timezone. Normalize the anchor to one
  instant representation before hashing, or the same lesson keys differently
  depending on how the source serialized it.
- Identity must not depend on a transient UI token or a display title.
- Still cover ordinary occurrences, rescheduling, cancellation, timezone
  handling, and events deleted and recreated with a new UID. "Outlook normally
  preserves recurrence identity" is not a guarantee for every way a school
  edits its calendar.

### `RANGE=THISANDFUTURE` rejects the whole series

`RANGE=THISANDFUTURE` overrides are currently outside the bounded semantic
contract, and the failure discards **the entire series**, not just the edited
occurrence ([semantics.rs](../../src-tauri/src/published_ics/semantics.rs)).

That is precisely the edit a school makes: change a subject's time, teacher or
permanent joining link *from a given date onward*. In a work calendar this is
occasional. In a timetable that runs a whole term it is close to inevitable, and
when it happens the child loses that subject's lessons entirely rather than
degrading gracefully.

Consequences for this plan:

- Step 0 must check that the feed still parses **after** the school makes a
  series-level edit mid-term, not only that it parses today.
- Whether the semantic contract needs `THISANDFUTURE` support is a scope
  question to answer **before** Step 1. If it does, that work sits underneath
  occurrence identity, not beside it.

### Source identity is derived from the publication URL

The source namespace is a digest of the saved publication URL, and
`SOURCE_IDENTITY_STATE` is only a marker constant with no re-key path
([work_calendar/mod.rs](../../src-tauri/src/work_calendar/mod.rs)). A different
URL therefore produces different event keys even when the calendar content is
unchanged. Re-pasting the identical URL is safe and changes nothing.

Records are not deleted when this happens — subjects, notes and homework
remain. What breaks is their *association* with displayed events: calendar
bindings and every accumulated occurrence override become disconnected, with
no user-visible explanation. Over a school term that is a term of pasted
lesson links lost.

V1 requirement — warn and preserve, do not silently re-key:

- Detect that the saved source is changing.
- Explain that existing calendar associations may stop applying.
- Preserve the old associations; do not discard them.
- Require an explicit decision before carrying them over.
- Once the user has explicitly confirmed "same calendar, new URL", carrying
  associations over is **offered**, not withheld — otherwise a routine Outlook
  republish is unrecoverable.

Automatic re-keying is not automatically safer: a different URL may identify a
different calendar, and old joining-link overrides must never attach to
unrelated lessons.

### Existing limitation to address

Current custom event settings for a recurring event are shared across the
series. That is useful for subject association, but unsafe for a one-lesson
replacement link. The UI must distinguish **this lesson** from **the series**;
implementation must not reuse the current series-wide save path unchanged.

### Join versus return to Zoom

Keep **Join this lesson** separate from **Return to Zoom**. Existing native Zoom
activation can bring a meeting forward, but does not prove which class it is.
Opening a joining link also does not prove successful entry or attendance.

### Privacy boundary — a new contract, not a Workspace refactor

The two existing link paths already behave differently, and the first draft
blurred them:

- Calendar-extracted meeting URLs are already native-only — `meeting_url` is
  skipped during serialization
  ([semantics.rs](../../src-tauri/src/published_ics/semantics.rs)).
- User-authored workspace links are returned to the frontend in plain text.
  `binding_summary` ships the resolved `link_url` alongside `link_url_present`
  ([workspace.rs](../../src-tauri/src/workspace.rs)), and `get_event_workspace`
  hands the URL to [EventSettingsView.tsx](../../src/EventSettingsView.tsx).

So "keep saved meeting URLs behind opaque tokens" is, as written against the
current code, either a no-op or an unscoped rewrite of existing Work behavior.
Neither is wanted. The bounded scope is:

- Subject materials keep the existing workspace-link behavior. Work materials
  links are unchanged.
- New joining-link defaults and occurrence overrides get a **dedicated native
  contract**. They must not be stored as ordinary `WorkspaceBinding.linkUrl`
  values on the assumption that they inherit native-only handling — they would
  not.
- Normal snapshots expose presence and source labels plus opaque action tokens,
  not the joining URL.
- The explicit paste/edit workflow is permitted on its own bounded path. That
  is not permission to distribute stored meeting URLs to every window.

No school names, child identities, private links, or raw calendar content
should enter diagnostics or release evidence.

## 6. Work/School switch semantics

Recommended control: a **setup-time choice**, editable later in Settings. With
one experience per laptop, a permanent Work/School toggle in the widget spends
scarce widget space on an affordance nobody in the confirmed use case needs,
and it invites exactly the shared-account expectations §3 disclaims.

The setting changes vocabulary and presentation across the widget, Today,
manager, event settings, and relevant settings/help text. Centralize that
vocabulary rather than scattering mode conditionals through every component.

**Scheduling and joining mechanics are shared; interpretation is not.** The
one-lesson joining-link override carries no interpretive content and should
land unconditioned by mode — work joining links also change by chat message.
But the schedule *reading* stays mode-scoped: "no meeting scheduled" is not a
work break, "the last meeting ended" is not the end of a workday, and lesson
progress means something that an arbitrary mixed work calendar does not
support.

Switching must not:

- Convert, delete, or migrate workspace content just to change presentation.
- Replace the saved calendar or introduce a hidden second source.
- Reapply defaults every time and overwrite customization.
- Silently disable medicine reminders or other existing preferences.

Offer a quieter School layout as a deliberate preset. Users can keep useful app
shortcuts and customize visible panels. Exact preset contents and whether any
appearance settings should be remembered separately remain design questions;
this draft does not approve a full preference-profile system.

## 7. Architecture reuse and boundaries

Verified planning references from the current checkout; recheck after polish:

| Existing area | Reuse / constraint |
| --- | --- |
| [workspace-model.ts](../../src/workspace-model.ts) | Projects, notes, links, action items and event bindings support subject-level reuse |
| [work_calendar/mod.rs](../../src-tauri/src/work_calendar/mod.rs) | Source-scoped recurring-series bindings can associate several lesson series with one subject |
| [EventSettingsView.tsx](../../src/EventSettingsView.tsx) | Current recurring settings apply to future occurrences; lesson-only overrides are not already supplied |
| [published_ics/mod.rs](../../src-tauri/src/published_ics/mod.rs) | Source validation is restricted to the supported Microsoft Published ICS host/path shape; `outlook.live.com` is rejected |
| [published_ics/semantics.rs](../../src-tauri/src/published_ics/semantics.rs) | Recurrence expansion, `RECURRENCE-ID` exceptions and cancellation are supported; `RANGE=THISANDFUTURE` fails the whole series; private events yield no workspace key |
| [work-calendar-model.ts](../../src/work-calendar-model.ts) | Current/next/day selection contracts are reusable, but school presentation and occurrence overrides need deliberate extensions |
| [zoom-meeting-model.ts](../../src/zoom-meeting-model.ts) and [WidgetView.tsx](../../src/WidgetView.tsx) | Existing Zoom presence/activation and native token-based joining are different operations |
| [widget-preferences.ts](../../src/widget-preferences.ts) | Existing optional panels provide a starting point for School presentation |

Do not add a local timetable editor or new provider when the existing Outlook
source can supply the timetable. Feed incompatibility, if found, is a separate
scope decision, not a reason to quietly relax source validation.

The polish audit's window sizing, token lifetime, truthful error states, and
reliability findings are relevant prerequisites. Do not carry known defects into
a renamed School interface.

## 8. Proposed delivery steps

Revised order. The first draft led with vocabulary; that is the **largest
surface area and the smallest user value** — a child reading a panel of their
own lessons does not need it relabelled to understand it. Reliable joining is
the product goal and now comes first.

Step 0 may be performed before committing to implementation. Steps 1–3 begin
only after M19 and the approved polishing work reach their acceptance gates and
the product partner approves a bounded School proposal.

| Step | Scope |
| --- | --- |
| 0. Feasibility | Verify the real feeds, and how changed links reach the child's laptop |
| 1. Reliable joining | Occurrence identity, one-lesson override, safe source-change handling, explicit privacy contract |
| 2. School-day experience | Current/next lesson, schedule-based breaks/progress, clear stale-data states |
| 3. School presentation | Setup preference, Subjects/Materials/Homework terminology, quiet layout preset |

### Step 0 — feasibility gate

Establish, on the children's actual laptops:

- Each child has an accepted, usable published feed. `outlook.live.com` is
  rejected by the current source contract, and Microsoft documents that
  publishing can be unavailable because of organizational sharing policy — a
  school tenant may simply not permit it. We have evidence that publishing
  *can* be disabled, not that this school disables it. Check, do not assume.
- The feed carries lesson information, not just free/busy.
- Lesson times, recurrence, cancellations and joining links are interpreted
  correctly.
- Lessons are not all private or redacted, which would leave them without a
  workspace key and make subject association impossible.
- The feed still parses after the school performs a series-level edit
  ("this and all following lessons"), given the `RANGE=THISANDFUTURE`
  limitation described in §5.
- Who receives a changed joining link, and on which device.

Failure means "not feasible under the current V1 source contract" — a scope
discussion, not a reason to quietly weaken validation, and not proof that
School mode is impossible.

### Step 1 — reliable lesson joining

- Thread the recurrence anchor through candidate generation and both selection
  contracts; finalize override persistence and versioning.
- Add one-lesson joining-link overrides with explicit scope, on their own
  native contract rather than as ordinary workspace binding links.
- Warn-and-preserve handling for a changed publication URL.
- Deterministic link resolution and override removal.
- Join from the current/next lesson and the daily lesson list.
- Cover refresh, recurrence, rescheduling, cancellation and missing links.

This step contains the largest correctness risk and benefits from an
independent cross-layer review before implementation.

### Step 2 — school-day experience

- Current/next lesson, scheduled breaks and end-of-day state.
- Schedule progress excluding cancelled and unrelated all-day entries.
- Configurable, gentle transition reminders with honest stale/offline behavior.
  Reuse the existing meeting-start sound preference rather than adding a new
  reminder subsystem.
- Readability, keyboard, DPI and real daily-use testing on both laptops.

### Step 3 — school presentation

- Setup-time Work/School preference, editable later in Settings.
- Subject presentation using the existing workspace.
- Subject-to-lesson-series association, materials and homework reuse.
- Consistent school wording across relevant windows, from one centralized
  vocabulary source.
- Preserve data, calendar configuration and user preferences when switching.

These are checkpoints, not a promise of four releases or an assigned milestone
number. Reassess their boundaries after the prerequisite work lands. Whether
Step 3 earns its cross-window churn is a decision to take *after* Steps 1–2 are
in daily use, not now.

## 9. Verification and acceptance outline

Use sanitized fixtures, never private child calendars or joining links in tests
or committed evidence.

- Work/School switching preserves workspace data and existing settings.
- Multiple lesson series share subject materials and homework correctly.
- One-lesson override affects exactly one occurrence and survives refresh.
- Following occurrences retain their calendar or configured default link.
- Rescheduled/cancelled events and changed source identities are handled safely.
- Recurrence-exception fixtures cover: an ordinary expanded occurrence, an
  override that moves `DTSTART` while keeping `RECURRENCE-ID`, a cancelled
  occurrence, a `RECURRENCE-ID` serialized as UTC versus TZID-qualified, and an
  event deleted and recreated with a new UID.
- A `RANGE=THISANDFUTURE` series edit produces a truthful, actionable state
  rather than silently losing a subject's lessons.
- Changing the saved publication URL warns before it applies, preserves
  existing associations, and never attaches an old override to an unrelated
  lesson.
- Joining URLs for defaults and overrides do not appear in routine snapshot
  payloads or logs; existing Work materials-link behavior is unchanged.
- Missing links, unsupported links and native open failures are actionable.
- Join and Return to Zoom remain distinct; neither records attendance.
- Break/day-end/progress displays remain truthful with cancellations, all-day
  entries, schedule gaps, overlaps, stale data and date changes.
- Popup bounds, long subject names, keyboard focus and high DPI remain usable.
- Work mode and medicine behavior do not regress.
- Relevant automated frontend/Rust checks run for approved implementation;
  builds and installed verification retain their separate approval gates.
- Create the required root-level `REVIEW-M<milestone>-SCHOOL-MODE.cmd` only when
  implementation and manual-review scope are approved. It must call the generic
  launcher from the same checkout and describe plain-language acceptance checks.

No School code, builds, tests or live-app checks were performed during this
brainstorming. Source inspection establishes reuse opportunities, not readiness
of the proposed feature.

## 10. Out of scope for the first version

- Local weekly timetable editor or a replacement calendar provider.
- Multiple child accounts, shared-account profiles or separate Work/School stores.
- Cloud synchronization or school-platform integration.
- Grades, attendance tracking, attention scores or a parent monitoring dashboard.
- Distraction blocking, automatic joining or forced application focus.
- A full assignment-management system.
- AI guidance or medical/behavioral assessments.

## 11. Questions to settle when returning

- Does each intended Outlook feed match the supported published ICS format and
  contain lesson-level times, recurrence and cancellation information?
- Is the feed lessons-only? If not, how will school lessons be identified for
  progress, breaks and end-of-day wording?
- Do reusable links belong to a subject, a particular lesson series, or both?
- Does the recurrence anchor in §5 survive the school's real rescheduling
  behavior, including series-level edits?
- Does the semantic contract need `RANGE=THISANDFUTURE` support? Answer before
  Step 1, because that work sits underneath occurrence identity.
- **Who receives a changed joining link, and on which device?** If it arrives
  in a parent's chat but must be pasted on each child's laptop, what is the
  intended daily workflow?
- How should overrides be retained, cleaned up and included in data controls?
- What reminder timing and presentation do the children find useful in practice?
- Which panels belong in the optional School preset, and what copy is clearest?

## 12. Resume checklist

- [ ] Confirm M19 and the polishing pass against the **current acceptance
      record**, not only the resolved-findings table. The audit's later
      qualification closes M19 implementation scope while stating that
      installed and human acceptance remain release gates; resolved findings
      alone do not satisfy the prerequisite.
- [ ] Establish the new baseline commit and preserve any current dirty work.
- [ ] Revalidate the architecture references and remaining polish findings.
- [ ] Complete Step 0 and settle the open questions above.
- [ ] Assign a milestone number and approve one bounded first step.
- [ ] Obtain implementation approval separately from this saved draft.

**Guiding priority:** make “which lesson, when, and the correct link” excellent.
Subjects, homework and appearance should support that daily experience.
