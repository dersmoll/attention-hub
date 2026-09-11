# M22 UI workflow polish

Status: human accepted; beta.14 publication approved

M22 keeps the beta.13 provider and local-first boundaries unchanged while
polishing the daily calendar-to-workspace flow.

- Calendar events can target either a project or a personal list. Custom
  categories are headings that organize personal lists, not content owners.
- Existing project bindings remain valid; `listId` is an additive, mutually
  exclusive field. Deleting a list or category also removes its bindings.
- Event settings grows with conditional fields and retains scrolling as the
  small-screen fallback.
- School mode treats active lessons as in progress automatically; Work mode
  retains the explicit `I'm in` action.
- Project Hub creation controls are revealed on demand, and compact-panel
  close/navigation hover surfaces follow the shared transparent language.
- Today refresh failures are source-specific, Advanced diagnostics poll only
  while visible, updater checks are single-flight, and React has a safe
  recovery boundary.
- A calendar occurrence can be skipped locally and restored from Today. Skips
  suppress the widget selection and meeting-start sound, expire after the
  occurrence day, and never alter the published calendar or recurring series.
- Existing medicine dose times are editable in place. Extending a completed,
  non-archived course across today reopens it while retaining historical dose
  records; every active course without a dose today is named as continuing in
  Today and Meds, including mixed days where another course does have a dose.
- Hiding the last displayed calendar occurrence with Skip is a local empty
  state, not a provider failure; the widget retains the skipped subject and
  points back to Today for Undo.
- Medicine reads reconcile missing rows for the current civil day only. This
  repairs already-saved extensions after the old future-only edit cutoff while
  avoiding a synthetic backlog for earlier dates.
- Meeting reminders offer a persistent allowlisted choice of seven bundled WAV
  sounds. The compact work and school attention pill uses the shared `Soon`
  wording.

Human acceptance was completed against `REVIEW-M22-UI-WORKFLOW-POLISH.cmd` on
2026-09-11.
