# Milestone 9 Later Inbox evidence — 2026-08-14

## Scope and privacy

This current-machine gate used one synthetic item only. No source-application
message, calendar event, screenshot, or private window content was retained.
The synthetic record was deleted through the product's two-step Advanced flow
after the restart check; the final schema-v1 document contains zero items and
the previous-valid backup is absent.

## Automated evidence

- Attention model, widget preference, time-zone, responsive widget-layout, and
  Later Inbox model tests passed.
- TypeScript and the Vite production build passed with 48 transformed modules.
- Rust formatting, 38 all-target unit tests, Clippy with warnings denied, and
  the native debug build passed.
- `git diff --check` passed after the final evidence update.

## Live current-machine evidence

| Gate | Result | Sanitized observation |
| --- | --- | --- |
| Widget integration | Passed | The default six-source Auto composition rendered at 1112 by 80 logical pixels. Later and Advanced retained 48 by 48 targets; Later exposed exact open and due counts in its accessible name. |
| Window geometry | Passed | The Later WebView client rendered at 420 by 520 logical pixels (436 by 559 including native frame). Advanced remained a separate on-demand window. |
| Capture and edit | Passed | Title-only capture returned focus to the title field. Edit exposed labeled context, HTTP(S) URL, follow-up, Update, Cancel, and Complete controls with 44-pixel-or-larger primary form targets. |
| Passive due state | Passed | A synthetic past follow-up changed the widget name to `1 open item, 1 due` and added visible `DUE`/follow-up text. No Windows notification or reminder was produced or claimed. |
| Complete and restore | Passed | Completing changed the widget to zero open items; expanding Completed and restoring returned it to one open, one due. |
| Restart persistence | Passed | After an app-owned close and supported Tauri dev restart, the same synthetic open/due count returned from the Rust-owned app-data document. |
| Storage contract | Passed | The live document used schema version 1 with opaque ID, title, context, URL, follow-up, created, updated, and completed fields under `%APPDATA%\com.attentionhub.desktop\later-inbox.json`. A previous-valid backup existed after mutation. |
| Window reuse and focus | Passed after correction | Close now hides the least-privilege reusable Later window, focuses the main widget, and explicitly returns DOM focus to the Later launch button. Reopen uses the existing window label. |
| Advanced data controls | Passed | Advanced exposed storage/privacy disclosure, open/completed counts, Open Later Inbox, delete-completed, and a two-step delete-all flow. Confirmed deletion left schema v1 with zero items and removed the backup. |
| Native mirror alignment | Not observed | No owned native mirror surface was available in the final sample. Source buttons and source-slot indices were unchanged, and zero-through-six source layouts passed automated geometry tests; live pixel alignment is not claimed here. |

## Boundaries

This evidence does not claim 200% scaling, forced-colors/high-contrast visual
sign-off, installer or upgrade behavior, Windows reminders, tray/autostart,
external integrations, or long-duration dogfooding. It does verify semantic
UI Automation names, focus, control sizes, logical order, live-region results,
local persistence, backup cleanup, and current-machine geometry for the
approved Milestone 9 slice.
