# ADR 0028: Add a link-aware compact Later Inbox

- Status: accepted
- Date: 2026-08-14

## Context

Daily capture often starts by copying a manager request from chat. A plain
textarea retained the words but discarded hyperlinks attached to those words.
The 400 by 480 window and inherited 16-pixel typography also remained larger
than the desired mini-inbox. Separately, a faded numeric Outlook badge still
looked current even though a rapid read/delete/minimize sequence could occur
between five-second UI Automation polls.

## Decision

- Use a schema-v2 structured note made of text segments with optional link
  marks. Preserve paragraphs, line breaks, linked words from HTML clipboard
  data, and complete plain-text HTTP(S) URLs. Never store pasted HTML.
- Migrate each valid schema-v1 `context` string to one unlinked text segment.
  Preserve IDs, timestamps, completion, task URL, and follow-up fields.
- Bound notes to 4,000 visible characters, 256 segments, and 25 linked
  segments. Validate links as HTTP(S), reject embedded credentials, and verify
  a clicked URL against the saved item before opening it through Windows.
- Keep formatting, images, files, embeds, previews, mentions, and collaboration
  out of scope.
- Use the approved compact option: 360 by 420 logical pixels, 340 by 360
  minimum, 13-pixel base typography, an 18-pixel heading, dense cards, and a
  64-pixel internally scrolling editor. Keep URL and follow-up collapsed.
- When Outlook is not exposed, retain its last count only for the accessible
  explanation and replace the visible numeric badge with an ellipsis. Do not
  claim that the five-second polling provider observed changes made just before
  minimization.

## Consequences

Pasted requests retain the minimum rich semantic content the user selected
without introducing an HTML sanitizer, document model, attachment directory,
or generic opener permission. Existing data migrates without a destructive
rewrite on read. The compact window shows less content at once and therefore
relies on normal vertical scrolling.

This decision does not provide fresh Outlook counts while minimized. Exact
background synchronization still requires a separately approved semantic
provider decision. Calendar, clocks, messenger presence/visual boundaries,
DWM visual-only pixels, source slots, appearance, ordering, pinning, position,
and lifecycle remain unchanged.
