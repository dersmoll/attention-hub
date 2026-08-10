# Milestone 1: Windows calendar-awareness spike

## Status

Paused at the provider-policy decision. Phase 0 passed unpackaged, but Phase 1
proved that the returned legacy Mail and Calendar store is not authoritative for
the current New Outlook work calendar. ADR 0006 requires an explicit decision
before any Microsoft Graph/OAuth work.

## Purpose

Prove or disprove this assumption:

> Attention Hub can obtain useful upcoming calendar state from Windows locally, without configuring Outlook or Teams credentials, and expose it through the existing Rust/Tauri/React boundary.

The outcome is evidence and an architecture decision, not a production calendar panel.

## Product question

Can Attention Hub reliably answer “what meeting or appointment is coming up?” with enough lead time to be useful, while remaining an observer and avoiding duplicate account configuration?

## Initial hypothesis

Use `Windows.ApplicationModel.Appointments.AppointmentManager.RequestStoreAsync(AllCalendarsReadOnly)` and `AppointmentStore.FindAppointmentsAsync` through Microsoft's Rust Windows bindings.

Microsoft documents that the package `appointments` capability can read appointments from synchronized network accounts. Current appointment API reference pages label the requirement `appointmentsSystem`; whether the documented public capability, sparse identity, medium-integrity desktop execution, and New Outlook's calendar store interoperate is the central hypothesis to test.

## Scope

- Detect appointment API availability and report package identity/capability context.
- Request read-only access from an explicit debug-UI action.
- Query a complete upcoming snapshot for a bounded range, initially seven days so real test events are likely to exist.
- Normalize calendar/source identity, local appointment ID, start time, duration/end time, all-day state, subject, location, busy status, sensitivity, and recurrence/debug metadata where the OS exposes them.
- Keep event body, attendees, organizer addresses, attachments, and join URLs out of the first contract.
- Expose application-owned DTOs through one Tauri command and a deliberately plain React table.
- Compare the returned snapshot with real events visible in New Outlook, including at least one Teams meeting where naturally available.
- After snapshot usefulness is proven, test `AppointmentStore.StoreChanged` as an invalidation signal followed by a complete refresh.
- Record behavior after application restart and calendar changes.

## Non-scope

- Production calendar UI, agenda design, reminders, alarms, notifications, or meeting-join controls.
- Creating, editing, accepting, declining, or deleting appointments.
- Microsoft Graph, OAuth, Azure app registration, Outlook/Teams credentials, or a cloud backend.
- Classic Outlook COM/Object Model integration.
- Outlook or Teams UI Automation/scraping, profile/database reads, WebView debugging, OCR, or screen capture.
- Calendar settings, filters, account selection, privacy mode, history, caching database, or generalized provider framework.
- Additional application sources unrelated to the calendar feasibility question.

## Technical questions

1. Is `AppointmentManager` available to ordinary unpackaged Tauri, and what exact error/status does `RequestStoreAsync(AllCalendarsReadOnly)` return?
2. Does the API require package identity on the tested Windows build?
3. Is `<uap:Capability Name="appointments" />` sufficient for the current sparse medium-integrity package, despite API reference pages naming `appointmentsSystem`?
4. Does Windows show a permission prompt or Settings-controlled access state, and how do allow, deny, repeat, and revocation behave?
5. Does the returned store contain the calendars and appointments visible in New Outlook on this machine?
6. Do naturally occurring Teams meetings appear as ordinary Outlook/Exchange appointments, and which safe fields identify them?
7. How are recurring instances, all-day events, cancellations, private events, tentative events, multiple time zones, and daylight-saving boundaries represented?
8. Are calendar/local appointment IDs stable enough for a current snapshot key, without assuming durable database identity?
9. Does `StoreChanged` fire for additions, edits, removals, and sync updates while Attention Hub is foregrounded and backgrounded?
10. Can a complete snapshot recover after restart, missed events, sleep/resume, and source synchronization?
11. If the store is empty, is that a permission/identity defect or evidence that New Outlook does not publish this account to Windows' appointment store?
12. Is the sparse identity/capability cost proportionate, or would calendar support require an explicit policy change to Microsoft Graph?

## Normalized debug contract

Exact field names may change during implementation, but React must receive only application-owned serialized types:

```ts
interface CalendarSnapshot {
  accessStatus: "unspecified" | "allowed" | "denied" | "unsupported" | "error";
  capturedAt: string;
  rangeStart: string;
  rangeEnd: string;
  calendars: CalendarSource[];
  appointments: CalendarAppointment[];
  diagnostics: string[];
}

interface CalendarSource {
  id: string;
  displayName: string;
}

interface CalendarAppointment {
  id: string;
  calendarId: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  subject: string | null;
  location: string | null;
  busyStatus: string | null;
  sensitivity: string | null;
  isRecurring: boolean | null;
  diagnostics: string[];
}
```

IDs are spike-only current-snapshot metadata. No body, attendee, organizer address, attachment, or join URL crosses IPC in this milestone.

## Implementation phases

### Phase 0: API and capability diagnostic

- Add only the `ApplicationModel_Appointments` Windows-binding feature.
- Add API/identity diagnostics and a manual read-only access request.
- Run unpackaged first and record the exact result.
- If required, add the public `appointments` capability to the existing development sparse manifest, rebuild/register it, and repeat.
- Do not request or invent an undocumented/restricted capability if the public manifest route fails.

Exit gate: one supported launch path returns an `AppointmentStore`, or a reproducible permission/identity/capability blocker is recorded.

Result on 2026-08-10: passed unpackaged on Windows build 26220.9022. The API was
available, the process had no package identity (`Package::Current` returned
`0x80073D54`), and the explicit `AllCalendarsReadOnly` request returned an
`AppointmentStore`. Do not add `uap:Capability Name="appointments"` for the
snapshot phase; sparse-package comparison A2 is not required by this result.

### Phase 1: snapshot usefulness

- Query the next seven days using `FindAppointmentsAsync`.
- Normalize immediately in Rust and isolate per-calendar/per-item conversion failures.
- Render a plain calendar/source and appointment table in React.
- Compare with New Outlook and at least one Teams meeting if naturally available.
- Record missing calendars/events rather than compensating with another source.

Exit gate: at least one real, upcoming, useful appointment crosses Windows -> Rust -> Tauri -> React and matches New Outlook, or the Windows store is proven unsuitable on this machine.

Final Phase 1 result on 2026-08-10: the unpackaged seven-day query returned 11
calendars and 13 appointments and rendered real upcoming appointment metadata
in React. The first diagnostic exposed that an ordinary `Location` value can
itself contain a meeting URL. Rust normalization now omits URL-like locations
before IPC; `OnlineMeetingLink`, `Uri`, details/body, and people fields are not
read. Direct comparison then showed that all returned calendars belonged to the
legacy Mail and Calendar source and the schedule materially differed from the
current New Outlook and Microsoft 365 views. Some recurring work events
overlapped, but current events were missing or stale. The Windows store is not a
useful authoritative provider for this product. Phase 2 store-change work is
stopped; ADR 0006 owns the Graph-or-stop decision.

### Phase 2: invalidation and recovery — stopped for this provider

- Do not subscribe to `AppointmentStore.StoreChanged`; Phase 1 coverage failed.
- Emit a small invalidation event and request a complete fresh snapshot.
- Verify cleanup, restart recovery, one add/edit/remove transition, and background behavior.
- Keep manual refresh available when event subscription fails.

Exit gate: the frontend converges without restart and complete refresh recovers from missed/inapplicable events.

### Phase 3: findings and decision

- Complete the source-coverage, privacy, reliability, and packaging findings.
- Decide: continue with Windows appointment store, explicitly review Graph/OAuth, or stop calendar integration.
- Reassess whether the development identity/package and trusted certificate should remain installed.
- Propose product UI only after technical usefulness is demonstrated.

## Acceptance criteria

- [x] Access/availability/identity status is visible and failures are diagnostics, not crashes.
- [x] Access is requested explicitly and read-only.
- [ ] React receives no WinRT or Windows-specific objects.
- [ ] A complete upcoming snapshot can be requested at any time.
- [x] At least one real New Outlook appointment is matched, or an explicit platform blocker is recorded. The explicit blocker is stale legacy-store coverage.
- [x] Naturally occurring Teams meeting coverage is recorded without creating a meeting solely for the spike. A current Teams meeting was absent from the stale OS snapshot.
- [ ] Times, durations, all-day state, recurrence, sensitivity, and time-zone behavior are documented accurately enough for the debug slice.
- [ ] No event body, attendee, organizer address, attachment, or join URL crosses IPC.
- [ ] No appointment is created, edited, accepted, declined, dismissed, or deleted.
- [ ] No Graph/OAuth, credential, backend, database, telemetry, or generalized provider framework is introduced.
- [ ] If snapshots succeed, one calendar change updates the frontend and restart restores current state.
- [ ] Findings explicitly assess New Outlook coverage and sparse identity/capability cost.

## Manual test cases

| ID | Case | Expected observation |
| --- | --- | --- |
| A1 | Request all-calendars read-only access unpackaged | Passed: `Allowed`; API available; no identity; `AppointmentStore` returned. |
| A2 | Repeat with sparse identity and public `appointments` capability if needed | Not required after A1 succeeded; capability remains absent. |
| S1 | Query the next seven days | Failed coverage: 11 legacy-source calendars and 13 stale/partial events differed materially from New Outlook. |
| S2 | Include a naturally occurring Teams meeting | Failed coverage: a current New Outlook Teams meeting was not represented in the OS snapshot. |
| S3 | Private/sensitive event | OS redaction and normalized sensitivity behavior are recorded without committing private content. |
| S4 | Recurring event instance | Instance time/ID/recurrence behavior is recorded. |
| S5 | All-day and non-local-time-zone events | Boundary and conversion behavior is recorded. |
| C1 | Add or modify one harmless test appointment in the source calendar | Store event/manual refresh and convergence timing are recorded. |
| C2 | Remove the harmless test appointment | Removal and final snapshot convergence are recorded. |
| R1 | Restart Attention Hub | Complete snapshot restores upcoming events without local history. |
| R2 | Background and sleep/resume | Event continuity and snapshot recovery are recorded. |
| P1 | Deny or revoke calendar access | Nonfatal status and recovery path are recorded. |

Do not commit screenshots or fixtures containing private calendar content. Evidence notes must redact subjects, locations, account names, organizer data, and meeting links unless the user explicitly approves a synthetic test value.

## Main risks and assumptions

| Risk / assumption | Impact | Spike response |
| --- | --- | --- |
| New Outlook may not publish its calendar into Windows `AppointmentStore`. | Critical: the local OS hypothesis may return an empty/incomplete store. | Compare directly with New Outlook and stop rather than scrape if coverage is absent. |
| The public `appointments` manifest capability may not satisfy the API's documented `appointmentsSystem` requirement for this desktop packaging model. | High. | Test unpackaged and one sparse public-capability route; record exact errors and do not request restricted capabilities speculatively. |
| Package identity/certificate complexity may be disproportionate. | High. | Reuse the bounded development route only for the spike and reassess cleanup afterward. |
| Calendar data is more privacy-sensitive than counts. | High. | Read only a bounded future range, omit bodies/people/links, avoid logs and committed screenshots, and keep everything local. |
| Recurrence, time zones, all-day boundaries, and DST can produce incorrect attention timing. | High. | Preserve source times, normalize deliberately, and run explicit boundary cases before product UI. |
| `StoreChanged` may be noisy, delayed, or identity-dependent. | Medium. | Use it only for invalidation and recover through complete snapshots. |
| Microsoft Graph may be the only complete New Outlook source. | High product-policy decision. | Do not implement automatically; present delegated `Calendars.ReadBasic` OAuth as an explicit exception to the no-credentials principle. |
| Classic Outlook COM is unavailable in New Outlook. | High for fallback options. | Do not invest in COM unless the user changes Outlook products and explicitly reopens that architecture. |

## Final findings

The WinRT/Tauri hypothesis is technically viable but not useful for the active
work calendar. Read-only `AppointmentStore` acquisition and seven-day snapshots
work unpackaged without an `appointments` manifest capability, and 11 calendars
plus 13 appointments crossed the full boundary. However, Windows returned the
legacy Mail and Calendar source, not an authoritative New Outlook schedule.
Current Outlook and Microsoft 365 views contained materially different events,
including a Teams meeting absent from the OS snapshot. Meeting URLs found in
`Location` are now omitted in Rust before IPC.

Decision: stop `AppointmentStore` invalidation work. Calendar implementation is
closed for `AppointmentStore`. ADR 0006 option 1 was approved on 2026-08-10;
Milestone 2 owns the separate bounded Microsoft Graph delegated-OAuth spike.

## Official references

- Microsoft: [App capability declarations (`appointments`)](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/app-capability-declarations)
- Microsoft: [`uap:Capability`](https://learn.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/element-uap-capability)
- Microsoft: [`AppointmentManager`](https://learn.microsoft.com/en-us/uwp/api/windows.applicationmodel.appointments.appointmentmanager)
- Microsoft: [`AppointmentStore`](https://learn.microsoft.com/en-us/uwp/api/windows.applicationmodel.appointments.appointmentstore)
- Microsoft: [`AppointmentStoreAccessType`](https://learn.microsoft.com/en-us/uwp/api/windows.applicationmodel.appointments.appointmentstoreaccesstype)
- Microsoft: [`AppointmentStore.FindAppointmentsAsync`](https://learn.microsoft.com/en-us/uwp/api/windows.applicationmodel.appointments.appointmentstore.findappointmentsasync)
- Microsoft: [New Outlook does not support COM add-ins](https://learn.microsoft.com/en-us/microsoft-365-apps/outlook/get-started/state-of-com-add-ins)
- Microsoft: [Graph Outlook calendar overview](https://learn.microsoft.com/en-us/graph/outlook-calendar-concept-overview)
- Microsoft: [Graph permissions reference (`Calendars.ReadBasic`)](https://learn.microsoft.com/en-us/graph/permissions-reference)
