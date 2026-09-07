# Ukrainian wording for the child-facing surfaces

> **Status: plan only. Not approved, no milestone number, no code written.**
> Raised 2026-09-07 while reviewing M21's School mode: the children may not
> reliably read some English words in the widget.

- **Parent plan:** [School mode](school-mode.md). This is not one of its
  numbered steps; it sits alongside Step 4's presentation work but is
  independent of it.
- **Blocked on:** M21 merging. Do not open this on the M21 branch — that branch
  already carries 24 commits and one unreviewed round of contract changes.

## Confirmed by the product partner

- **Wording only.** Dates, times and number formats are *not* switched.
- **The two laptops differ:** one runs Ukrainian Windows, one English.
- Scope is the **main panel and popups**. Settings and the managers stay
  English.

## What is already true, and must not be "fixed"

Measured on 2026-09-07, before any work.

- **Times are already 24-hour on both laptops.** The calendar and clock
  formatters force `hourCycle: "h23"`
  (`time-zone-converter.ts:19`, `time-zone-converter.ts:89`,
  `EventSettingsView.tsx:39`). So Ukrainian wording next to `09:00` reads
  correctly on the English laptop too, and "wording only" is genuinely
  consistent rather than half-translated. This removed the main objection to
  the wording-only decision.
- **Display dates already follow the OS locale** — `toLocaleTimeString([])`,
  `toLocaleDateString(undefined, …)`. Left alone by decision.
- **Preferences are already per-machine.** `localStorage`
  (`widget-preferences.ts:397`), so a language preference needs no new
  mechanism and the two laptops can differ naturally.
- **`calendar-vocabulary.ts` is already the right structure** — a centralised
  table keyed by mode. Adding a language axis is the same pattern with a second
  dimension. It was written for plan §6's "centralize that vocabulary rather
  than scattering mode conditionals", and that pays off here by accident.

> **Trap.** The hardcoded `en-US`, `en-CA` and `en-GB` locales in
> `school-day-model.ts:42`, `time-zone-converter.ts:10`,
> `time-zone-options.ts:101,116` and `widget-preferences.ts:175` are **machine
> formats**, not display text. `viewerLocalDate` in particular produces the
> `YYYY-MM-DD` that the day-validity contract compares against Rust's
> `viewer_day`. Localising any of them would break that comparison and report
> the timetable as unknown all day. Do not touch them.

## String inventory

| Surface | Strings | State |
| --- | --- | --- |
| `calendar-vocabulary.ts` | ~20 fields × 2 modes | Already centralised; needs a language column |
| `school-day-model.ts` | ~14 | `summarizeSchoolDay` + `schoolDayStatusLabel`; extract into the same table |
| `TodayPopupView.tsx` | ~17 | Inline |
| `MedicinePanelView.tsx` | ~17 | Inline |
| `WidgetView.tsx` | ~60–90 in scope | Inline, across 3,566 lines |

Roughly **150–200 strings**, of which ~40 already sit in the right structure.
The translation is the small part; extracting the inline strings is the labour,
and it concentrates in the one file where a careless change has already caused
a layout regression once.

Excluded from the count and from scope: IANA timezone identifiers, key names
(`Enter`, `Escape`), and anything rendered only in Advanced or a manager.

## The three things that make this more than a string table

### 1. Ukrainian has three plural forms

English has two. `1 хвилина` / `2 хвилини` / `5 хвилин`, and the same for
"Lesson 3 of 8", "2 doses left today", "3 events".

Use `Intl.PluralRules("uk")` and design plural-aware messages **from the
start**. Retrofitting plurals onto a flat table is materially worse than
building them in, and roughly 10–15 messages need it. Existing code does this
with inline `=== 1 ? …` ternaries in at least eight files; those are the ones to
convert, not to copy.

### 2. Length budgets are per-language, and the rail clips silently

The widget rail uses `white-space: nowrap` with ellipsis throughout, and the
band has a fixed height. An over-long translation **truncates without warning**
rather than wrapping — the first sign would be a clipped word on a child's
screen.

Concretely, `scripts/test-school-day-model.mjs` pins status-pill labels to
**≤ 11 characters**, a budget chosen against "In progress". Ukrainian:

| English | Terse Ukrainian | Length |
| --- | --- | --- |
| `Break` | `Перерва` | 7 |
| `Day starts` | `Початок` | 7 |
| `2 of 8` | `2 з 8` | 5 |
| `Day ended` | `Кінець` | 6 |
| `No lessons` | `Немає уроків` | **12** |

So most fit, but not all, and `Уроки скінчились` (16) certainly does not. The
budget must become **per-language with tests per language**, and translations
for constrained slots have to be chosen against the budget rather than for
elegance.

### 3. Accessibility strings count

61 `aria-label` / `title` attributes in `WidgetView.tsx` alone. A child using a
screen reader or hovering for a tooltip gets those, so they belong in scope even
though they are not visible text.

## Proposed shape

No new dependency. Hand-rolled tables plus `Intl.PluralRules` matches how this
codebase already works, and the vocabulary module proves the pattern.

- A `language` preference — `"en" | "uk"` — defaulting from the OS language so
  the Ukrainian laptop is correct with no setup and the English one needs one
  toggle, once. Persisted per machine alongside `schoolModeEnabled`.
- Extend the vocabulary lookup from `(mode) => strings` to
  `(mode, language) => strings`, keeping components ignorant of both.
- A plural helper wrapping `Intl.PluralRules`, used for every count.
- Tests asserting: both languages define the same keys; no key is left
  untranslated; constrained slots respect a per-language budget.

**Deliberately not chosen:** defaulting to Ukrainian when School mode is on.
The app should not infer a language from a mode.

## Phasing

**Phase one — what a child reads during lessons.** The calendar band, the
school-day reading and the Today popup. Most of the value for roughly a third of
the churn, and the surfaces where the existing structure already helps. Smaller
than the M21 audit repairs.

**Phase two — the rest of the rail.** App shortcuts, clocks, utility actions,
error notices, and the Medicine popup. Larger, and mostly mechanical extraction.

Both phases together are larger than M21's original scope.

## Open questions

- Which terse Ukrainian wording do the children actually prefer for the
  constrained slots? Worth asking them rather than deciding here — they are the
  only reviewers who matter for this.
- Should the pill's length budget be raised instead of translations shortened?
  That is a layout change and would need the same "must not change the layout"
  scrutiny School mode got.
- Do the error and diagnostic notices belong in scope? They are child-visible
  but describe app internals, and a bad translation there is worse than English.
- Does anything in the Medicine popup need it, or is that a parent-facing
  surface on these laptops?
