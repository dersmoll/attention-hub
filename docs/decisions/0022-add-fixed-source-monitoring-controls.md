# ADR 0022: Add fixed-source monitoring controls

- Status: accepted
- Date: 2026-08-13

## Context

The production beta always observes and displays Teams, Telegram, and Outlook.
That fixed coverage is truthful, but it does not yet satisfy the product
principle that observed sources remain user-controlled. Merely hiding a React
button would be misleading because native UI Automation would continue reading
the source and the summary could still treat it as coverage.

Teams and Telegram also have two independent contracts: a source-owned semantic
signal and an optional DWM-composed visual. Turning off pixels must not turn off
or alter the semantic signal.

## Decision

- Extend the existing backward-compatible v1 widget preference record with
  `monitoredSources` and `liveVisualSources`.
- Default migrated records to all three fixed sources monitored and both
  existing DWM visuals enabled, preserving beta behavior.
- Allow zero through three monitored sources. Disabled sources are omitted from
  native capture, the widget row, Advanced source cards, and coverage math.
- Report coverage against the selected denominator. With zero sources, show
  **Monitoring paused**, never **All clear**.
- Keep live visual preferences separate for Teams and Telegram. A visual starts
  only when the source is monitored, its semantic signal reports attention, and
  its live-visual preference is enabled.
- Compress and center the visible React row while passing its source count and
  slot indices into the two native DWM controllers.
- Keep the fixed source implementations and semantics; do not add a provider
  registry or arbitrary source enrollment.

## Consequences

Users can reduce observation and widget noise without creating false-clear
claims. A disabled source is a deliberate coverage exclusion, not a successful
zero. Existing users retain the current three-source behavior automatically.

The source-selection list crosses IPC, so Rust validates every key and rejects
unsupported values. Empty selection returns a bounded empty snapshot without
initializing UI Automation.

Calendar behavior, source activation, source meanings, DWM pixel handling,
Graph, OCR, new providers, autostart, and tray behavior remain unchanged.
