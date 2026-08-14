# ADR 0027: Stabilize minimized apps and Later Inbox capture

- Status: accepted
- Date: 2026-08-14

## Context

Daily use found that Slack, Viber, and WhatsApp processes remained detectable
after minimization, but activation rejected their genuine main windows because
Windows exposed icon bounds of approximately 160 by 28 pixels. New Outlook's
minimized UI Automation tree could also be incomplete while still retaining an
Inbox label, allowing an inferred zero to appear current. Later Inbox capture
needed more pasted task context and a smaller window.

## Decision

- Keep messenger presence process-owned and unread semantics unexposed. For the
  three known messenger executables and main-window classes only, accept a
  titled, unowned, non-tool window when Windows marks it iconic, regardless of
  its icon-sized bounds, then restore it before requesting foreground focus.
- Never interpret a minimized Outlook root as current Inbox evidence. Report
  the source as not exposed, retain only an explicitly last-observed count, and
  tell the user to open Outlook to refresh. Continuous minimized-state unread
  remains unavailable without a separately approved semantic provider.
- Expand the existing schema-v1 `context` field to 4,000 characters and expose
  it as an always-visible multiline plain-text notes field. Do not add HTML,
  Markdown, images, files, or clipboard attachment storage.
- Reduce the Later window to 400 by 480 logical pixels while retaining its 360
  by 420 minimum. Reopening refreshes local data, due time, title, and focus.
- Intercept native close requests so dirty drafts remain visible, and return
  focus to the widget or Advanced opener after a clean close.
- Use Windows write-through atomic replacement for Later data. Destructive
  cleanup removes any previous-content backup before committing the deletion.

## Consequences

Minimized messenger activation no longer depends on misleading icon bounds,
while helper and tray windows remain excluded by executable, ownership, tool
style, class, and title gates. Outlook becomes more conservative and truthful;
it does not gain background synchronization. Later Inbox can retain practical
chat or task context without becoming a document editor or attachment store.

Calendar/provider behavior, Teams and Telegram semantics, DWM visual-only
surfaces, source slot geometry, clocks/converter, saved ICS, acknowledgement,
appearance, ordering, pinning, position, and application lifecycle remain
unchanged. Graph, OCR, generalized providers, reminders, product tray,
autostart, updater, signing, installer changes, and attachments remain closed.
