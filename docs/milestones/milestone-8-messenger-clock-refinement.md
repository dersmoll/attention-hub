# Milestone 8: Messenger and clock refinement

## Status

Implemented on 2026-08-13. Automated and current-machine live validation are
recorded separately; release packaging and user acceptance remain separate.

## Product outcome

Add truthful fixed access to Slack, Viber, and WhatsApp, make the two clocks
immediately readable, convert a colleague's Miami time to local time in place,
fit the widget to the enabled app count, and show elapsed progress for an active
timed event.

## Acceptance gate

- [x] Slack, Viber, and WhatsApp have distinct local glyphs and activate only an
      existing source window.
- [x] Running/not-running presence is explicit; no unread count is inferred.
- [x] Each new source has an independent visual-only DWM taskbar preference.
- [x] Five native surfaces use source-monitor taskbar selection and ordered
      app slots without pixel readback.
- [x] Semantic coverage and all-clear use only Teams, Telegram, and Outlook.
- [x] Existing preferences migrate once to the six-source catalog; an explicit
      later three-source selection remains stable.
- [x] Left-panel and window widths are bounded for zero through six sources.
- [x] Clock numerals are 36 pixels; Miami remains DST-aware ET.
- [x] The inline Miami converter handles EST, EDT, local day rollover, and a
      nonexistent spring-transition time without guessing.
- [x] Active timed events expose an accessible 0–100 progress line.
- [x] Focused frontend tests, TypeScript, production Vite build, Rust tests,
      formatting, and diff checks pass.
- [x] The current machine rendered six app slots at 1152×80 and five aligned
      native surfaces at 40×40.

## Frozen behavior

Teams qualitative activity, Telegram numeric signals, Outlook aggregate Inbox
unread and last-observed fallback, source activation constraints, widget
position/pinning, appearance, app ordering, acknowledgement, and the one saved
Published ICS calendar remain unchanged. DWM pixels remain visual-only.

Graph, OCR, a provider framework, arbitrary applications, new calendar work,
autostart, tray, updater, signing, and unrelated lifecycle work remain closed.
