# Milestone 11 community-feedback proposal

Baseline: `v0.6.0-beta.3` / `73d2d62667a9ab523f0e5971962a04bbfd0baa41`.

## Approved sequence

1. M11A: improve Balkan timezone discoverability; correct Join/Rejoin state and dark-theme hover contrast; add a reduced-motion-safe one-minute calendar cue.
2. M11B: allow two through five clocks, retain the accepted two-zone converter, and offer horizontal or compact vertical presentation.
3. M11C: add a local anchored today panel with a bounded meeting list, meeting count, and overlap-safe occupied-time total.
4. M11D: keep native live mirrors aligned with the widget while Today is open; retain the automatic reduced-motion-safe meeting-start visual cue and add a configurable, default-on, one-shot Windows system sound.

## Constraints and non-goals

- Preserve the single explicitly selected Published ICS calendar, secure per-user URL storage, privacy redaction, and ephemeral join tokens.
- Keep extra clocks display-only; conversion remains between the primary and secondary zones.
- Do not add Graph, OCR, generalized providers, installer lifecycle, autostart, tray, updater, attendance detection, telemetry, or meeting history.
- The bundled meeting-start sound is enabled by default, can be disabled in Advanced, contains no meeting data, and fires only for an observed upcoming-to-active timed-event transition. It does not sound for all-day events, repeated active refreshes, or initial observation of an already-active meeting.

## Acceptance evidence

- Preference migration and timezone-search tests, including Serbia, Bosnia and Herzegovina, and North Macedonia aliases.
- Two-to-five-clock horizontal/vertical geometry tests.
- Join/Rejoin state tests and explicit light/dark hover/focus styling.
- Reduced-motion-safe one-minute calendar treatment.
- Rust same-day selection, privacy-redaction, and overlap-safe duration tests.
- Native mirror vertical-offset tests plus frontend one-shot meeting-transition and sound-preference migration tests.
- Focused frontend suites, production build, Rust tests/format/Clippy, and final diff/privacy review.
