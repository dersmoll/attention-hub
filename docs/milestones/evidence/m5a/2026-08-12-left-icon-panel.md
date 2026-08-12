# Left icon panel evidence

- Date: 2026-08-12 Europe/Kyiv
- Scope: Milestone 5A visual, semantic, multi-taskbar, and activation boundary
- Sensitive values recorded: none

## Automated validation

- Rust: `cargo test` passed 30 tests; `cargo clippy --all-targets -- -D
  warnings` passed.
- Frontend: TypeScript `--noEmit` and Vite production build passed; 41 modules
  transformed.
- Repository: `cargo fmt --all` and `git diff --check` passed.

## Live two-monitor gate

One interactive development instance discovered two taskbar surfaces. Teams had
one unambiguous source button on the primary taskbar at `taskbar@0,0,48,1440`.
Telegram had one unambiguous source button on the secondary taskbar at
`taskbar@-1920,0,-1872,1080`. Both DWM registrations succeeded with a centered
48 by 44 thumbnail inside a 48 by 48 native destination.

The attention snapshot kept its source semantics separate: Telegram was
observed with two signal kinds, Teams was observed with one qualitative signal,
and Outlook was `notExposed` because no aggregate English Inbox label was
available. No zero Outlook count was emitted.

Over the corrected 60-second runtime window, the two 100 ms mirror trackers
completed 547 and 548 checks. Average check time was 683 and 615 microseconds,
maximum check time was 3,921 and 3,574 microseconds, and neither source required
a full rediscovery.

## Remaining manual acceptance

The app-button activation paths compile and are reachable from both React
buttons and the native Teams/Telegram surfaces. The automation shell used for
this run could not address the interactive GUI desktop to generate a reliable
end-to-end click, so visible alignment and real foreground transitions remain
explicit user confirmation items rather than inferred passes.

## User visual pass and correction

The user confirmed three visible icons, pointer activation for Teams, Telegram,
and Outlook, and correct Telegram numbers from both monitor taskbars. The same
pass showed that the 48-by-48 native mirrors still appeared as undersized
rectangles inside the rounded 52-pixel React slots. Outlook's fresh aggregate
Inbox number also disappeared when minimizing Outlook because its accessibility
tree became `notExposed`.

A second correction used a rounded 50-by-50 native surface, but a third user
pass confirmed the fundamental problem remained: an opaque taskbar-button crop
cannot look like a natural app icon merely by rounding its destination. It also
showed that the unequal side panels did not match the intended composition.

The next correction tried stable local glyphs with 20-by-20 circular DWM badge
overlays. The user rejected these as miniatures rather than the real rendered
badges and clarified that all three panels should be level, not raised.

The current correction returns the complete live Teams and Telegram taskbar
tiles but scales each proportionally inside a centered 44-by-44 native surface,
leaving a deliberate 4-pixel inset inside its 52-pixel React slot. The native
surface uses an 8-pixel corner radius. The pixels remain visual-only and are
never parsed or claimed as a count. A geometry test covers bounded expansion of
a 48-by-44 button to a 48-by-48 crop and full scaling into a 44-by-44 destination.

The shell now uses equal 366-by-80 side panels around a 240-by-80 center panel,
with 4-pixel gaps. All three share one top and bottom edge and an 8-pixel corner
radius; the 224-pixel app row remains centered in the left panel.

Outlook retains only the most recent
observed Inbox signal in process memory while the running source is
`notExposed`; the fallback badge is amber/dashed and its accessible label says
last-observed. It clears when Outlook is not running and does not survive an
Attention Hub restart. Final appearance and minimize/restore behavior await the
next user pass.

The previous live startup selected full source crops `0,669,48,717` for Teams
and `0,185,48,233` for Telegram; those results document the rejected whole-tile
composition rather than acceptance evidence for the current badge-only model.
Final inset-tile appearance and level-panel composition await the next user
visual pass.
