# Privacy

Attention Hub is local-first and has no telemetry, analytics SDK, cloud backend,
or account aggregation service.

## Data kept locally

- Widget preferences and window state in WebView local storage.
- Project Hub projects, personal lists, useful links, to-dos, event bindings,
  and one bounded backup in the application-data directory.
- Medicine treatments, medicines, schedules, and the dose history in a separate
  `medicine.json` in the same directory, with its own bounded backup.
- One user-supplied Published ICS URL in Windows Credential Manager.
- Current meeting URLs in process memory only, behind ephemeral tokens.

Project Hub and to-do content can include text and HTTP(S) links
supplied by the user. It is not synchronized or uploaded by Attention Hub.

### Medicine data is health data, and it is stored unencrypted

Medicine records are the most sensitive thing Attention Hub stores: a treatment
name and a medicine name together can reveal a diagnosis. Two things follow,
and both are stated in the app on Advanced / Reminders rather than only here.

**`medicine.json` is plain text.** Attention Hub applies no encryption or
password of its own. The file is protected only by the Windows user profile's
access control and whatever full-disk encryption the machine already has.
Anyone who can read the user's Windows profile can read treatment names,
medicine names, strengths, schedules, and the complete dose history. A user who
needs protection beyond that should rely on Windows account security and device
encryption; Attention Hub does not substitute for either.

**Medicine data is excluded from the workspace export.** Exporting Project Hub
and to-do data never writes medicine records into the exported file, and there
is no medicine export. This is a consequence of medicine living in its own
file, not a filter applied at export time.

## Network activity

The app fetches only the saved Published ICS HTTPS source during calendar
refresh. Clicking a validated meeting, to-do, event, or project
note link asks Windows to open that URL in the registered external handler. No
other product data is sent to a project-operated service because no such
service exists.

## Information deliberately not collected

- Message or notification bodies.
- Account credentials or authentication tokens.
- External-service credentials, API tokens, API requests, or time-entry status.
- Calendar publication URLs in logs or IPC.
- DWM pixels, screenshots, OCR output, or inferred visual counts.
- Project Hub, to-do, or medicine content in diagnostics or release evidence.
- Treatment names, medicine names, strengths, schedules, or dose history in
  diagnostics, release evidence, or notification text.
- Project names, notes, event links, or recurrence identifiers in
  diagnostics or release evidence.
- Usage analytics, device fingerprints, or crash telemetry.

Attention Hub does not request access to Windows Notification Center or inspect
notifications created by other applications. Meeting sounds, to-do
notifications, and dose reminders are generated locally from data already held
by Attention Hub.

Dose reminders name nothing. Both the title and the body are generic — "A
scheduled dose is due." — because a Windows toast can appear on a lock screen
and persists in notification history. This is deliberately stricter than the
to-do reminder, which does put the to-do's title in the notification body.

## Local deletion and backup expectations

Users can remove the saved calendar from Advanced settings and delete to-dos,
personal lists, categories, and projects in the app. Removing a project also unlinks its
event assignments. Uninstall and operating-system profile cleanup
remain Windows-managed. The app does not provide cloud backup; users who
require automatic backup must protect their Windows profile through their
normal local backup process. Advanced settings can manually export Project Hub
and to-do data to a user-selected JSON file and replace the current workspace
from a validated export after an explicit confirmation. Export files contain
the user's project names, notes, links, lists, to-dos, and calendar bindings;
they exclude the Published ICS credential, widget preferences, and all medicine
data. Users are responsible for protecting and deleting exported files.

Medicine data is deleted separately. A treatment can be deleted in the Medicine
window after a confirmation that reports how many medicines and dose records
will be destroyed, and Advanced / Reminders can delete every medicine record at
once. Both are permanent and neither is included in any export.

## Security reports

Do not include real calendar URLs, message contents, Project Hub content, or
credentials in a public issue. Report the behavior with sanitized reproduction
steps and placeholder values.
