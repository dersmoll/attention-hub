# Teams badge accessibility probe: first controlled comparison

- Date: 2026-08-10 Europe/Kyiv
- Cases: C1, C1a
- Result: partial; qualitative transition passed, exact-count comparison must be repeated

## Observed states

The user captured Teams Chat with a visible badge state of zero and then one. Attention Hub's existing notification-area signal changed from `activityStatus=false` to `activityStatus=true`, matching the observed transition.

The deeper sanitized accessibility result cannot yet be compared across those states because both screenshots display the same probe timestamp: `2026-08-09T22:54:00.397Z`. The probe was therefore run once and its result remained on screen while the Teams state changed.

At badge zero, the returned candidates already included an `activity` keyword with numeric token `1` in a 17-character accessible name. This matches the shape of Teams' permanent `Activity (Ctrl+1)` navigation shortcut and is not evidence of a badge count. The sanitizer has been updated to exclude digits adjacent to keyboard-shortcut markers such as `Ctrl`, `Alt`, and `Shift` while retaining a separate count occurrence near an attention keyword.

## Privacy handling

The supplied screenshots contain visible private chat names and are not committed. This note records only redacted structural observations.

## Next test

Repeat the manual probe at badge states zero and one, clicking **Run Teams probe** after each change and confirming that the captured timestamps differ. Add a state of two or more when it can be created naturally. No additional messages need to be generated solely for the spike.
