# Milestone 1 evidence: unpackaged calendar access

- Date: 2026-08-10
- Windows build: 26220.9022 (25H2)
- Launch: self-contained ordinary unpackaged Tauri executable
- Test case: A1, explicit `AllCalendarsReadOnly` request

## Observed result

- `AppointmentManager` API available: `true`
- Package identity present: `false`
- `Package::Current` diagnostic: `0x80073D54` (process has no package identity)
- Access result: `allowed`
- `AppointmentStore` returned: `true`
- Failure/crash: none observed

This passes the Phase 0 exit gate without package identity. The sparse package
was not used for this test and its manifest was not changed. Test A2 is not
needed unless a later snapshot or change-event result shows a specific identity
or capability dependency.

No calendar, appointment, account, subject, location, attendee, organizer, or
meeting-link content is recorded in this evidence file.

## Initial snapshot observation

The first seven-day unpackaged snapshot returned 11 calendars and 13
appointments and displayed real upcoming metadata in React. A meeting URL was
observed inside an ordinary appointment `Location` field. The implementation
was immediately tightened to omit URL-like location values in Rust before IPC;
the URL itself is not recorded here. New Outlook and Teams coverage comparison
remains pending user confirmation.
