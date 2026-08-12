# ADR 0017: Retire calendar spike controls from the production app

- Status: accepted
- Date: 2026-08-12

## Context

The My Day UI Automation, Published ICS structure/semantic, Windows
AppointmentStore, and Graph environment surfaces were bounded discovery tools.
Their decisions are recorded in milestone evidence, but retaining all of their
buttons in Advanced makes a validated product build look like several competing
calendar implementations.

## Decision

The production Advanced view retains only the secure one-calendar setup,
refresh, removal, and sanitized saved-source result required by the widget. The
completed calendar spike controls and their Tauri IPC commands are removed.
Published ICS parsing remains an internal implementation detail of the saved
work-calendar provider.

The canonical Windows distributable is version `0.2.0` and uses one bundle
target: NSIS. Cargo debug/release executables and Vite output are build
intermediates, not alternative releases.

## Consequences

There is one visible calendar path and one installer format. Historical source
and evidence remain available for engineering review without exposing retired
experiments as product actions. Reopening Graph, Outlook UI Automation, or a
different provider requires a new explicit decision.
