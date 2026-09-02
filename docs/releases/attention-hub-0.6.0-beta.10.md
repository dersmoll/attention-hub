# Attention Hub 0.6.0-beta.10

- Released: 2026-09-02
- Status: public beta
- Platform: Windows x64
- Format: NSIS setup executable plus signed Tauri updater artifacts
- Tag: `v0.6.0-beta.10`

## Milestones 16 and 17

- Adds panel accent customization and makes the calendar segment directly
  resizable with persisted width and snapped height behavior.
- Replaces the separate Later Inbox with one local Project Hub for projects,
  personal lists, bounded notes and links, calendar bindings, and to-dos.
- Adds Project Hub, project-panel, Today, and All To-dos surfaces with compact
  editing, due dates, reminders, completion, and local notifications while the
  app is running.
- Adds a Time Focus clock layout, primary-clock seconds, and the final clock
  geometry refinements from this milestone.
- Makes an offline shortcut click launch the configured Windows application.
  A live Zoom meeting appears only while active and focuses its meeting window
  when selected.
- Improves Teams meeting-link recognition for current Outlook Published ICS
  event formats.
- Adds a manually initiated JSON workspace export/import flow with validation,
  preview, explicit replacement confirmation, atomic persistence, and recovery
  backup protection. Calendar credentials and widget preferences are excluded.
- Retains the last successful sanitized calendar event through a temporary
  calendar refresh failure, exposes a retrying state, and preserves its
  ephemeral Join action until recovery or event expiry.

## Validation

- User dogfooding accepted the milestone's Project Hub, to-do, clock, shortcut,
  Zoom, Teams, export/import, and calendar behavior in development builds.
- Frontend model suites, the TypeScript/Vite production build, Rust formatting,
  all-target tests, and strict all-target/all-feature Clippy are release gates.
- The GitHub release workflow verifies synchronized versions and publishes the
  installer, updater archive, detached signature, and dedicated beta feed.

## Known limits

- The Windows installer remains Authenticode-unsigned by design; the signed
  Tauri updater metadata is the in-app update validation path.
- Workspace transfer is manual and local. This release does not add cloud sync,
  background sync, or closed-app to-do reminders.
- DWM thumbnail integrations remain visual-only. Attention Hub does not read
  pixels or infer notification counts from mirrored surfaces.
