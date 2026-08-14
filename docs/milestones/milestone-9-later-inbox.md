# Milestone 9: Local-first Later Inbox

## Status

Implemented on 2026-08-14. Automated validation and current-machine live
evidence are recorded separately. Release packaging, installer work, and user
acceptance remain separate.

## Product outcome

Capture a lower-priority request from the always-visible widget in one click,
retain only the minimum context needed to resume it, and review or complete the
queue later without creating an external account, cloud integration, or false
source-attention meaning.

## Bounded flow

1. Activate the fixed Later button between enabled sources and Advanced.
2. Type a required title and press Enter for title-only capture.
3. Optionally disclose project/context, an HTTP(S) task URL, and a follow-up
   date/time. `Ctrl+Enter` saves from any field.
4. Review due items first and remaining open items oldest first.
5. Explicitly open a validated saved link, edit the item, or complete it.
6. Restore completed items in the Later window, or clean completed/all data in
   Advanced.

## Acceptance gate

- [x] Rust owns a schema-v1, size-bounded, per-user JSON document and one
      previous-valid backup; WebView local storage does not own inbox content.
- [x] Missing data creates an empty snapshot, corrupt primary data can fall back
      to a valid backup, and a future schema is visible and never overwritten.
- [x] Loaded records, IDs, timestamps, lengths, and URLs are revalidated.
- [x] HTTP/HTTPS links reject embedded credentials and open only after explicit
      item-ID activation through a narrow native command.
- [x] Later remains separate from monitored sources, semantic coverage, and
      **All clear**.
- [x] The 48-pixel Later target exposes exact open/due counts accessibly; due is
      represented with text/symbol/structure as well as color.
- [x] The 420 by 520 Later window supports labeled native controls, logical tab
      order, Enter and `Ctrl+Enter`, focus return, live announcements, and no
      silent Escape discard.
- [x] Advanced exposes data location and bounded destructive controls with a
      second confirmation step for delete-all.
- [x] Follow-up is explicitly passive and produces no Windows reminder claim.
- [x] Responsive layout tests cover 744 through 1208 logical pixels without
      changing the zero-through-six source slot contract.
- [ ] Current-machine live evidence verifies window geometry, keyboard/focus,
      restart persistence, and the passive due transition with synthetic Later
      data. No native mirror surface was available during the final sample, so
      live pixel alignment remains unclaimed; the unchanged source-slot
      contract is covered by the responsive layout tests.

## Automated gate

- Later model tests, widget layout tests, all existing focused frontend tests,
  TypeScript, and production Vite build.
- Rust unit tests including validation, unsafe URL rejection, previous-valid
  backup, corrupt-primary recovery, and future-schema refusal.
- `cargo test --all-targets`, Clippy with warnings denied, Rust format check,
  and `git diff --check`.

## Frozen behavior

Teams qualitative activity, Telegram numeric signals, Outlook aggregate Inbox
unread and last-observed fallback, Slack/Viber/WhatsApp presence and visual-only
surfaces, source activation, widget position/pinning, responsive calendar
widths, clocks/converter, appearance, app order, acknowledgement, and the one
saved Published ICS calendar remain unchanged. DWM pixels remain visual-only.

## Explicit non-goals

Windows reminders, global shortcuts, attachments, long notes, tags,
priorities, recurrence, collaboration, sync, imports, external-tool
integrations, Graph, OCR, generalized providers, new calendar work, product
tray, autostart, updater, signing, installer changes, release packaging, and an
in-app export picker are outside Milestone 9.
