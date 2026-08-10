# Teams badge accessibility probe: controlled comparison

- Date: 2026-08-10 Europe/Kyiv
- Cases: C1, C1a
- Result: exact-count path stopped; qualitative transition passed

## Observed states

The user captured Teams Chat with a visible badge state of zero and then one. Attention Hub's existing notification-area signal changed from `activityStatus=false` to `activityStatus=true`, matching the observed transition.

The deeper sanitized accessibility result cannot yet be compared across those states because both screenshots display the same probe timestamp: `2026-08-09T22:54:00.397Z`. The probe was therefore run once and its result remained on screen while the Teams state changed.

At badge zero, the returned candidates already included an `activity` keyword with numeric token `1` in a 17-character accessible name. This matches the shape of Teams' permanent `Activity (Ctrl+1)` navigation shortcut and is not evidence of a badge count. The sanitizer has been updated to exclude digits adjacent to keyboard-shortcut markers such as `Ctrl`, `Alt`, and `Shift` while retaining a separate count occurrence near an attention keyword.

## Privacy handling

The supplied screenshots contain visible private chat names and are not committed. This note records only redacted structural observations.

## Final bounded test

A naturally occurring Teams state displayed badge `2`, comprising a visible Activity item and a Chat indicator. A fresh scan at `2026-08-10T08:32:30.103Z` traversed one Teams window and 31 elements. All six returned candidates were structural ARIA metadata with no numeric token.

Opening Activity cleared both visible indicators, so the expected intermediate state of `1` could not be isolated. The Activity-page screenshot still displayed the earlier probe timestamp and is treated only as UI-state evidence, not a second probe result.

A final fresh scan at `2026-08-10T08:34:56.315Z`, after the visible badges cleared, traversed one Teams window and 438 elements. It exposed qualitative `activity` structure but no useful count in the highest-relevance candidates. Attention Hub's existing Teams signal returned to `activityStatus=false`.

## Decision

The passive UI Automation exact-count path reached its stop condition. Retain the proven Teams `activityStatus` boolean, remove the experimental diagnostic implementation, and defer exact counts or message details until a future source-specific technique is explicitly justified. No additional Teams messages or tests are required for Milestone 0.
