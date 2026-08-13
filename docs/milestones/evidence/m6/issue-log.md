# Milestone 6 structured issue log

This log stores operational metadata only. Never paste private source content,
raw labels, calendar URLs/event values, account identifiers, screenshots with
private content, or DWM pixels.

## Status vocabulary

- `new`: observed once and not yet reproduced.
- `confirmed`: reproduced from a documented state.
- `fixed`: smallest baseline-preserving correction implemented.
- `verified`: correction passes its reproduction and adjacent baseline cases.
- `deferred`: P2/P3 only, with an explicit reason.
- `proposal-required`: resolving it would expand frozen scope.

## Issue template

### M6-XXX — Short observable title

- Severity: P0 / P1 / P2 / P3
- Status:
- Revision and launch mode:
- Windows/display context:
- Source state classification only:
- Preconditions:
- Reproduction steps:
- Expected accepted-beta behavior:
- Actual behavior:
- Frequency and recovery time:
- Privacy-safe diagnostics:
- Implementation defect or semantic coverage gap:
- Smallest permitted fix or proposal boundary:
- Verification cases:

## Issues

### M6-001 — Malformed v1 preferences can reach native and time-zone APIs

- Severity: P1
- Status: verified
- Revision and launch mode: `ab9e228`; static migration audit
- Windows/display context: independent of display arrangement
- Source state classification only: not applicable
- Preconditions: `attention-hub.widget.v1` contains a non-boolean `pinned`, an
  invalid timezone string, or non-finite coordinates supplied outside JSON
- Reproduction steps: normalize `{ pinned: "false", secondaryTimeZone:
  "Invalid/Zone" }`, then construct the widget time formatter
- Expected accepted-beta behavior: malformed values fall back to bounded
  defaults while valid legacy position, pin, and timezone values survive
- Actual behavior: the string pin value survived normalization and the invalid
  timezone caused `Intl.DateTimeFormat` to throw `RangeError`
- Frequency and recovery time: deterministic for the malformed record; manual
  local-storage deletion was previously required
- Privacy-safe diagnostics: normalized value and exception class only
- Implementation defect or semantic coverage gap: implementation defect
- Smallest permitted fix or proposal boundary: validate booleans, IANA
  timezones, and finite integer coordinates in the existing v1 normalizer
- Verification cases: valid legacy subset, invalid timezone/pin/coordinates,
  malformed JSON, default appearance/order migration, TypeScript/Vite build;
  all passed on 2026-08-13

### M6-002 — Normal live-visual stop logs a DWM cleanup failure

- Severity: P2
- Status: verified
- Revision and launch mode: M7 worktree after `ab9e228`; `pnpm tauri dev`
- Windows/display context: two taskbars across two monitors; Teams selected on
  the primary taskbar and Telegram selected on the secondary taskbar
- Source state classification only: Teams and Telegram both reported attention
- Preconditions: a live taskbar visual is registered and visible
- Reproduction steps: disable its monitored source or live-visual preference
- Expected accepted-beta behavior: the native thumbnail is released quietly
  and the visual disappears immediately
- Actual behavior: the visual disappeared, followed by
  `DwmUnregisterThumbnail` returning invalid-parameter during Rust cleanup
- Frequency and recovery time: reproduced twice; no recovery was needed and
  the next mirror registration succeeded
- Privacy-safe diagnostics: HRESULT class and lifecycle phase only
- Implementation defect or semantic coverage gap: implementation defect
- Smallest permitted fix or proposal boundary: release the thumbnail when
  `WM_CLOSE` is received, before the destination window is destroyed
- Verification cases: Telegram live-visual stop/restart and full app close no
  longer logged the DWM cleanup failure; the remaining Teams surface stayed
  active, both mirrors registered again on reset/relaunch, and the original
  multi-monitor taskbar selections remained unchanged
