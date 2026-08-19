# Privacy

Attention Hub is local-first and has no telemetry, analytics SDK, cloud backend,
or account aggregation service.

## Data kept locally

- Widget preferences and window state in WebView local storage.
- Later Inbox items and one bounded backup in the application-data directory.
- One user-supplied Published ICS URL in Windows Credential Manager.
- Current meeting URLs in process memory only, behind ephemeral tokens.

Later Inbox content can include text and HTTP(S) links supplied by the user. It
is not synchronized or uploaded by Attention Hub.

## Network activity

The app fetches only the saved Published ICS HTTPS source during calendar
refresh. Clicking a validated meeting or Later Inbox link asks Windows to open
that URL in the registered external handler. No other product data is sent to a
project-operated service because no such service exists.

## Information deliberately not collected

- Message or notification bodies.
- Account credentials or authentication tokens.
- Calendar publication URLs in logs or IPC.
- DWM pixels, screenshots, OCR output, or inferred visual counts.
- Later Inbox content in diagnostics or release evidence.
- Usage analytics, device fingerprints, or crash telemetry.

## Local deletion and backup expectations

Users can remove the saved calendar from Advanced settings and delete Later
Inbox items in the app. Uninstall and operating-system profile cleanup remain
Windows-managed. The app does not provide cloud backup; users who require a
backup must protect their Windows profile through their normal local backup
process.

## Security reports

Do not include real calendar URLs, message contents, Later Inbox content, or
credentials in a public issue. Report the behavior with sanitized reproduction
steps and placeholder values.
