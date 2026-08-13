# Milestone 7: Fixed-source monitoring controls

## Status

Implemented and accepted on 2026-08-13 for the `0.4.0-beta.1` candidate.
Automated and live validation are recorded separately.

## Product outcome

Let the user choose which existing fixed sources Attention Hub observes and
shows, while keeping coverage truthful and keeping semantic observation
separate from optional DWM visuals.

## Scope

- Monitor toggles for Teams, Telegram, and Outlook in Advanced.
- Separate persistent live-taskbar-visual toggles for Teams and Telegram.
- Backward-compatible preference migration with beta behavior as the default.
- Native capture limited to the selected fixed source keys.
- Coverage expressed against the selected source count.
- Explicit **Monitoring paused** state for zero selected sources.
- Compressed centered widget app row and matching native mirror layout.
- Existing app order and source activation retained for enabled sources.

## Acceptance gate

- [x] Existing v1 preferences migrate to all sources and visuals enabled.
- [x] Empty, partial, duplicate, and unsupported selections are bounded.
- [x] Disabled sources are absent from native observations and flattened
      signals.
- [x] A disabled source cannot contribute attention, failure, or all-clear.
- [x] Coverage uses the selected denominator; zero selected never says clear.
- [x] DWM visual preference does not alter its semantic source signal.
- [x] Native positions match compressed one-, two-, and three-source rows.
- [x] Frontend focused tests, TypeScript, Rust tests, and formatting pass.
- [x] Production frontend build, Clippy, and diff checks pass.
- [x] Live Advanced toggles immediately update Widget and native surfaces.
- [x] Restart preserves monitoring and visual selections.
- [x] Reset restores all three sources and both visuals.

## Frozen behavior

Teams remains qualitative, Telegram retains its separate numeric signals, and
Outlook remains aggregate Inbox unread with the explicit in-process
last-observed fallback. DWM pixels remain visual-only. Calendar/provider work,
Graph, OCR, new sources, generalized providers, meeting actions, application
launching, autostart, tray, updater, signing, and unrelated UI redesign remain
closed.

## Live test plan

1. Open Advanced and disable Outlook. Confirm its widget button and Advanced
   card disappear and coverage becomes selected-source coverage.
2. Disable Teams and confirm its native surface stops; Telegram compresses to
   its current ordered slot.
3. Disable the Telegram live visual while keeping Telegram monitored. Confirm
   its semantic badge/fallback remains and no native surface covers it.
4. Disable every source. Confirm only Advanced remains in the centered app row
   and the summary says **Monitoring paused**.
5. Restore sources in a non-default app order. Confirm React and native slots
   match without changing source semantics.
6. Restart, verify persistence, then use **Reset source defaults**.
