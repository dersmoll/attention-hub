# School mode — feature plan

> **Status: Step 0 complete and passed. Step 1 approved and assigned M21.**
> Steps 2–3 remain unapproved. See
> [M21 school calendar source](m21-school-calendar-source.md) for current
> implementation status; this document holds the design and its rationale.

- **Discussion date:** 2026-09-05
- **Revised:** 2026-09-06, after a cross-review of this draft against the
  current source. The revision reorders the delivery steps, replaces the
  occurrence-identity risk wording with a named design, adds two hazards the
  first draft missed (published-URL source identity, `RANGE=THISANDFUTURE`),
  and narrows the privacy contract. No code was changed.
- **Revised:** 2026-09-07, after completing Step 0. The feasibility gate
  **changed the calendar provider**: the children's Outlook feeds are
  unavailable, and the source is now a parent-owned Google calendar per child.
  See [§8 Step 0 results](#step-0-results-2026-09-07). This revision also
  corrects the `RANGE=THISANDFUTURE` blast radius, which §5 previously
  understated.
- **Implementation baseline:** `main` at `cc3e58b`, after M20 merged.
- **Preceding work:** [M19 medicine tracker](m19-medicine-tracker.md),
  [M20 daily polish](m20-daily-polish.md), and
  [post-M19 polish audit](../council/2026-09-05-post-m19-polish-audit-devin.md).

Step 1 is approved as M21 and is being implemented. Steps 2–4 record direction
only, and approve no application changes, builds, or releases.

## 1. Context confirmed by the product partner

- Two children study remotely, with roughly seven to eight consecutive lessons.
- Long school days make maintaining attention and tracking transitions difficult.
- Each child has their **own laptop**, so each can have an independent Hub setup.
- Zoom links are **mixed**: some reusable, some lesson-specific.
- When joining links change, updates arrive **in messages**, rather than being
  reflected in the calendar event.
- The parent uses the work experience; the children would use the school
  experience. Simultaneous Work/School datasets for one person are not an
  established requirement.

### Calendar source — superseded by Step 0

The draft assumed the lesson calendar would come from **the children's Microsoft
Outlook accounts**. Step 0 established that it cannot:

- The children sign in with **personal** Microsoft accounts, which offer no
  calendar publishing at all on their accounts.
- A personal Microsoft account publishes **only its default calendar**, so one
  parent account cannot publish a separate calendar per child either.

The confirmed source is a **parent-owned Google calendar per child**, read via
each calendar's *secret* iCal address. The children need no Google account and
the calendars are not shared with them.

**The school publishes no feed of its own.** Every schedule and joining-link
change arrives by messenger and is transcribed into Google Calendar by the
parent, manually. This makes the parent a single point of failure for all
changes, which is why [§8](#proposed-delivery-steps) reorders the remaining
steps.

Do not request or record private publication URLs in planning documents, public
issues, or diagnostics.

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

### `RANGE=THISANDFUTURE` rejects the whole feed

Corrected 2026-09-07. An earlier revision said this discards "the entire
series". It does not — it discards **the entire feed**, every subject at once.

The rejection at `semantics.rs:696-704` returns `Err` from `expand_series`,
which the caller propagates with `?` at `semantics.rs:252`, out of
`extract_current_or_next` entirely. `published_ics/mod.rs:406-424` then marks
the whole probe `Unavailable`. One `THISANDFUTURE` override anywhere in the
document therefore blanks the calendar, not one subject.

**Step 0 finding — this does not apply to the confirmed source.** Google
Calendar implements a "this and following" change by *splitting the series*:
the original master is truncated with `UNTIL` and the future occurrences become
a new event with a **new UID**. No `RANGE=THISANDFUTURE` is emitted. The
observed `UNTIL` truncation on a series-level delete is the signature of that
model; a `THISANDFUTURE` implementation has no reason to truncate anything.

This is recorded as a **strong inference, not a verified fact** — confirm with a
fixture during M21. It remains fully live for the parent's *work* Outlook
calendar, which is a Microsoft 365 source.

The hazard that replaces it is quieter and worse-behaved:

- A split yields a **new UID**, and the workspace key derives from `series_uid`
  (`work_calendar/mod.rs:665-679`). A subject's materials, notes and homework
  silently detach, with no error and no explanation.
- Because the parent is the only editor, this is largely avoidable by workflow:
  preferring **"All events"** over **"This and following"** keeps the UID
  stable. Past occurrences shift, which does not matter for a today/next view.
- M21 therefore ships UID-change **detection** — turning a silent break into a
  visible one — rather than `THISANDFUTURE` support.

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
| [published_ics/mod.rs](../../src-tauri/src/published_ics/mod.rs) | Source validation accepts two Microsoft 365 hosts only; `outlook.live.com` and `calendar.google.com` are both rejected. M21 widens this to a bounded provider table. Redirects are blocked outright and any 3xx fails the fetch |
| [published_ics/semantics.rs](../../src-tauri/src/published_ics/semantics.rs) | Recurrence expansion, `RECURRENCE-ID` exceptions, `EXDATE` and cancellation are supported; `RANGE=THISANDFUTURE` fails **the whole feed**; private events yield no workspace key; every property is scanned for joining links |
| [work-calendar-model.ts](../../src/work-calendar-model.ts) | Current/next/day selection contracts are reusable, but school presentation and occurrence overrides need deliberate extensions |
| [zoom-meeting-model.ts](../../src/zoom-meeting-model.ts) and [WidgetView.tsx](../../src/WidgetView.tsx) | Existing Zoom presence/activation and native token-based joining are different operations |
| [widget-preferences.ts](../../src/widget-preferences.ts) | Existing optional panels provide a starting point for School presentation |

Do not add a local timetable editor. Feed incompatibility **was** found in Step
0, and adding Google was taken as an explicit scope decision rather than a
quiet relaxation: the allowlist bounds what the app will fetch, and widening it
from two Microsoft hosts to three named provider hosts leaves the scheme,
credential, query, fragment, redirect, path-shape and size guards untouched.
Record any further provider the same way.

The polish audit's window sizing, token lifetime, truthful error states, and
reliability findings are relevant prerequisites. Do not carry known defects into
a renamed School interface.

## 8. Proposed delivery steps

Revised order. The first draft led with vocabulary; that is the **largest
surface area and the smallest user value** — a child reading a panel of their
own lessons does not need it relabelled to understand it. Reliable joining is
the product goal and now comes first.

Reordered 2026-09-07 by the Step 0 results. The original Step 1 bundled the
calendar source with the occurrence-override machinery. Step 0 split them: the
source change is now *blocking* (without it the app cannot read the real
calendars at all), while the override became a fallback rather than the
foundation.

| Step | Scope | State |
| --- | --- | --- |
| 0. Feasibility | Verify the real feeds and how changed links reach each laptop | **Complete, passed** |
| 1. Calendar source | Google source validation, safe source-change handling, UID-change detection | **Approved — M21** |
| 2. Reliable joining | Per-occurrence joining-link override and recurrence anchor | Not approved |
| 3. School-day experience | Current/next lesson, schedule-based breaks/progress, stale-data states | Not approved |
| 4. School presentation | Setup preference, Subjects/Materials/Homework terminology, quiet layout | Not approved |

**Why Step 2 now precedes the school-day experience.** The school publishes no
feed, so every change is transcribed by the parent by hand. That makes the
parent a single point of failure: if they are unavailable when a link changes
shortly before a lesson, nothing reaches the children. The override is the only
cover for that gap, and polish work should not queue ahead of it.

### Step 0 results (2026-09-07)

**Verdict: feasible, with a different provider than the draft assumed.**

The children's Outlook path is dead (see [§1](#calendar-source--superseded-by-step-0)).
Everything below was measured against a throwaway Google test calendar using a
local diagnostic that reported counts, timezone names and a body hash only —
never the URL, titles, descriptions or links. No repository changes were made
during Step 0.

| Check | Result |
| --- | --- |
| Transport | `200`, **no redirect**, `text/calendar`, ~250 ms, ~1.2 KB |
| Timezone | `Europe/Kiev` (deprecated IANA alias) parses — chrono-tz 0.10.4 |
| Lesson-level data | `SUMMARY` always present, never `Busy` — not free/busy |
| Privacy flags | No `CLASS:PRIVATE`, so a workspace key is issued |
| Recurrence | `RRULE` present and expandable |
| Cancellation | Single-occurrence delete arrives as `EXDATE`, parsed natively |
| Joining links | Extracted from `DESCRIPTION`; every property is scanned, so `LOCATION` also works. Zoom `?pwd=` survives |
| **Propagation lag** | **Under 30 seconds**, four consecutive measurements |

Two findings drove the revised delivery order:

1. **Redirects were the real transport risk.** `published_ics/mod.rs:259-267`
   fails outright on any 3xx with `Policy::none()`. Google does not redirect, so
   the feed is reachable — but this is the check to repeat for any future
   provider, ahead of content questions.
2. **Sub-30s lag closes §5's "unclosable" workflow gap.** With the 120 s app
   poll, a parent's edit reaches both laptops in ~2.5 minutes. The parent
   updates one calendar and both children follow; no per-laptop pasting and no
   synchronization are required. This demotes the per-occurrence joining-link
   override from foundation to fallback.

Carried as **inference, not verified**: that Google never emits
`RANGE=THISANDFUTURE`. See [§5](#rangethisandfuture-rejects-the-whole-feed).

Not established, and deliberately so: none of this was checked on the
children's actual laptops, because the source is the parent's account and the
same feed serves both. Per-laptop verification belongs to M21 acceptance.

### Step 1 — calendar source (M21, approved)

See [m21-school-calendar-source.md](m21-school-calendar-source.md) for status.

- Add Google published-calendar support to source validation, as a bounded
  `(host, path-shape)` table rather than a second hardcoded pair. Every other
  guard — HTTPS-only, credential-free, no query or fragment, blocked redirects,
  size and time caps — stays unchanged.
- Correct the user-facing strings that name Microsoft 365 as the only provider.
- Warn-and-preserve handling for a changed publication URL.
- UID-change detection, so a series split reports rather than silently
  detaching a subject's materials, notes and homework.

### Step 2 — reliable lesson joining (not approved)

- Thread the recurrence anchor through candidate generation and both selection
  contracts; finalize override persistence and versioning.
- Add one-lesson joining-link overrides with explicit scope, on their own
  native contract rather than as ordinary workspace binding links.
- Deterministic link resolution and override removal.
- Join from the current/next lesson and the daily lesson list.
- Cover refresh, recurrence, rescheduling, cancellation and missing links.

This step contains the largest correctness risk and benefits from an
independent cross-layer review before implementation.

### Step 3 — school-day experience (not approved)

- Current/next lesson, scheduled breaks and end-of-day state.
- Schedule progress excluding cancelled and unrelated all-day entries.
- Configurable, gentle transition reminders with honest stale/offline behavior.
  Reuse the existing meeting-start sound preference rather than adding a new
  reminder subsystem.
- Readability, keyboard, DPI and real daily-use testing on both laptops.

### Step 4 — school presentation (not approved)

- Setup-time Work/School preference, editable later in Settings.
- Subject presentation using the existing workspace.
- Subject-to-lesson-series association, materials and homework reuse.
- Consistent school wording across relevant windows, from one centralized
  vocabulary source.
- Preserve data, calendar configuration and user preferences when switching.

These are checkpoints, not a promise of five releases. Reassess their boundaries
after each lands. Whether Step 4 earns its cross-window churn is a decision to
take *after* Steps 1–3 are in daily use, not now.

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

Step 0 performed no repository changes: its evidence came from a local
diagnostic run against a throwaway Google test calendar, reporting counts and
hashes only. M21 implementation and its verification are recorded in
[m21-school-calendar-source.md](m21-school-calendar-source.md).

## 10. Out of scope for the first version

- Local weekly timetable editor. (Adding Google as a second *published ICS*
  provider is in scope for M21; a non-ICS provider integration is not.)
- Multiple child accounts, shared-account profiles or separate Work/School stores.
- Cloud synchronization or school-platform integration.
- Grades, attendance tracking, attention scores or a parent monitoring dashboard.
- Distraction blocking, automatic joining or forced application focus.
- A full assignment-management system.
- AI guidance or medical/behavioral assessments.

## 11. Questions — answered by Step 0

- **Does the feed match the supported published ICS format, with lesson-level
  times, recurrence and cancellation?** Yes, for the Google source. Not for the
  children's Outlook, which cannot publish at all.
- **Is the feed lessons-only?** Yes. The parent creates a dedicated calendar per
  child containing nothing else, which removes the "identify school lessons
  among other events" problem the draft anticipated.
- **Who receives a changed joining link, and on which device?** The parent, by
  messenger. They transcribe it into Google Calendar, and both laptops follow in
  ~2.5 minutes. No per-laptop pasting is needed while the parent is available.
- **Does the semantic contract need `RANGE=THISANDFUTURE` support?** Not for
  Google, which splits the series instead. Still open for Outlook work
  calendars. See [§5](#rangethisandfuture-rejects-the-whole-feed).

### Still open

- Do reusable links belong to a subject, a particular lesson series, or both?
- Does the recurrence anchor in §5 survive real rescheduling, including the
  UID change produced by a Google series split?
- How should overrides be retained, cleaned up and included in data controls?
- What reminder timing and presentation do the children find useful in practice?
- Which panels belong in the optional School preset, and what copy is clearest?
- What should happen when the parent is unavailable and a link changes minutes
  before a lesson? Step 2 is the proposed cover; the daily workflow is not
  settled.

## 12. Checklist

- [x] Confirm M19 and the polishing pass against the current acceptance record.
- [x] Establish the baseline commit — `main` at `cc3e58b`, after M20 merged.
- [x] Revalidate the architecture references and remaining polish findings.
- [x] Complete Step 0 and settle the blocking questions.
- [x] Assign a milestone number and approve one bounded first step — M21.
- [ ] Confirm the Google series-split inference with a fixture during M21.
- [ ] Verify on both children's laptops with the real calendars.

**Guiding priority:** make “which lesson, when, and the correct link” excellent.
Subjects, homework and appearance should support that daily experience.
