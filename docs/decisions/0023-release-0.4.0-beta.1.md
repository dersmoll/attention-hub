# ADR 0023: Release 0.4.0-beta.1 fixed-source controls beta

- Status: accepted
- Date: 2026-08-13

## Context

The `0.3.0-beta.1` baseline passed a same-version install/reinstall observation.
Milestone 6 then added structured hardening evidence and bounded preference and
native-thumbnail lifecycle fixes. Milestone 7 added user control over the three
existing fixed sources without changing their meanings or introducing a
provider framework.

Automated validation passed, and the user accepted the live Advanced/widget
interaction, selected-source coverage, compressed native layout, restart
persistence, reset behavior, and independent live-visual controls.

## Decision

Release this bounded product slice as `0.4.0-beta.1` using the existing unsigned
x64 NSIS distribution.

The minor beta increment reflects a user-visible capability: Teams, Telegram,
and Outlook monitoring can be enabled independently, while Teams and Telegram
taskbar visuals remain separate visual-only preferences. Existing preference
records migrate to the `0.3.0-beta.1` behavior.

## Consequences

The release preserves source activation, source-owned attention semantics,
Outlook aggregate unread and last-observed fallback, widget preferences, clocks,
Advanced, and the saved Published ICS calendar. DWM pixels remain visual-only.

The installer remains unsigned. Installer execution, in-place upgrade from the
previous beta, clean-machine behavior, signing, updater, autostart, tray, Graph,
OCR, generalized providers, and new calendar/provider work are not claimed by
this release record.
