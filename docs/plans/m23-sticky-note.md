# M23 sticky note

## Approved scope

- One sticky-note destination remains available in every widget layout.
- Clicking it opens or focuses one frameless, resizable, always-on-top window.
- Plain text autosaves locally and closing waits for the latest save.
- The window restores its last reachable position and logical size.
- HTTP(S) links found in the saved text open only after native revalidation.

## Boundaries

- One note, 4,000 characters maximum.
- No rich text, Markdown, multiple notes, reminders, cloud sync, link previews,
  project attachment, history, or implicit Project Hub export.
- Content lives in the dedicated native `sticky-note.json` store; geometry is
  stored separately with the existing floating-window geometry mechanism.

## Acceptance

The icon opens or focuses one window, text survives closing and app restart,
close never drops the latest keystrokes, move/resize geometry survives reopening,
the note remains above other applications, disconnected-monitor coordinates
fall back safely, and only links still present in saved text can be opened.
