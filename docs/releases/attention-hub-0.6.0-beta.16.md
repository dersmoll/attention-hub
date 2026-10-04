# Attention Hub 0.6.0-beta.16

- Prepared: 2026-10-04
- Status: release candidate
- Platform: Windows x64
- Tag: `v0.6.0-beta.16`

## Milestone 24

- Auxiliary windows share the running widget's WebView2 environment. Opening
  waits for both native creation and frontend readiness, with bounded waits and
  actionable failure notices. This addresses popups stopping after a long run.
- Project To-do popups and Project Hub prioritize task notes and saved links.
  Titles reveal notes, links remain easy to follow, rows are denser, and dates
  are secondary to task context.
- The vertical preset provides a narrow stacked widget with compact application
  icons, clocks, calendar information and destination controls.
- Open all To-dos now opens a styled widget popup, grouped by project/list,
  with task context and completion/Undo support.
- Advanced has a dedicated Backup & restore page. Existing workspace and
  Medicine transfers remain compatible and now live alongside full backups.
- Full backups include widget preferences, calendar choices, projects, lists,
  notes, links, to-dos, treatments, medicine schedules, dose history and the
  sticky note. Restore previews counts and replaces only selected sections.
- Restore creates an importable previous-data backup, preserves existing local
  recovery files, and journals the transaction for rollback and startup recovery.
  A durable commit decision reconciles lost completion replies.

## Privacy and portability

- Backup JSON is unencrypted. Private notes and health information are included;
  store it in a trusted location.
- Including the saved Published ICS connection is optional and off by default.
  When included, its private publication link is written directly by native code
  to the file. It never enters the WebView or diagnostic logs.
- Downloaded calendar events and temporary meeting tokens are excluded. Calendar
  data refreshes after restore; bindings and skipped occurrences retain their
  original source identity rather than being reassigned to another calendar.
- A running focus timer is exported paused. Reachable window placement is
  checked on opening. Windows startup registration remains specific to each PC.
- This release adds no calendar provider or cloud synchronization.

## Validation

- The user accepted the updated UI and authorized release publication.
- Focused frontend checks, the production frontend build, and 15 native backup
  and store tests passed during implementation.
- The complete frontend suite and production TypeScript/Vite build passed.
- Rust all-target tests passed: 143 passed, 1 ignored reporting helper.
- Strict all-target/all-feature Clippy, formatting and synchronized version
  checks passed. Packaging and remote artifact/feed verification are recorded
  during publication.
- Installed upgrade/uninstall and an actual signed in-app update are separate
  acceptance checks; they are not implied by a passing build.

The public release includes signed updater artifacts produced in the protected
GitHub release environment. The Windows installer remains Authenticode-unsigned.
