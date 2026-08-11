# Milestone 3B widget-composition evidence

- Date: 2026-08-11 Europe/Kyiv
- Environment: Windows 11, vertical primary taskbar, unpackaged debug build
- Result: primary composition gate passed with documented open manual cases

## Live source discovery

Both automatically started visual sources produced exactly one unambiguous
taskbar candidate while excluding their notification-area entries:

```text
teams_taskbar_candidate_count=1
teams_source_crop=left:0 top:671 right:48 bottom:715
telegram_taskbar_candidate_count=1
telegram_source_crop=left:0 top:715 right:48 bottom:759
```

DWM registered the 48 by 1440 primary taskbar independently for each source and
rendered each 48 by 44 crop within a 52 by 52 widget slot. Attention Hub did not
receive or inspect a bitmap.

## Geometry and movement

Initial live geometry:

| Surface | Left | Top | Width | Height |
| --- | ---: | ---: | ---: | ---: |
| Widget | 814 | 632 | 980 | 176 |
| Teams visual | 840 | 690 | 52 | 52 |
| Telegram visual | 904 | 690 | 52 | 52 |

After moving the widget to `500,300`, the next observed geometry was:

| Surface | Left | Top | Width | Height |
| --- | ---: | ---: | ---: | ---: |
| Widget | 500 | 300 | 980 | 176 |
| Teams visual | 526 | 358 | 52 | 52 |
| Telegram visual | 590 | 358 | 52 | 52 |

Both sources therefore retained their exact logical offsets of `26,58` and
`90,58`. This test moved the native window programmatically; a real user drag
gesture and mixed-DPI monitor transition remain open.

## Persistence and lifecycle

After normal window close and application restart, the widget restored to
`500,300`, and both new mirror windows restored to the same relative positions.
The Pin control changed the native `WS_EX_TOPMOST` state from true to false and
back to true. The widget close control ended the process with exit code 0 and
the state-owned mirror threads shut down with it.

The first native-builder attempt created a blank Advanced WebView in development
and was rejected. The replacement uses Tauri's supported frontend
`WebviewWindow` creation permission. The ellipsis then created the complete
Advanced view on demand. Closing it removed the window rather than hiding a
polling diagnostic runtime.

## Visual and semantic result

The live widget displayed:

- real Teams and Telegram taskbar visuals in the first two slots;
- nonfunctional, explicitly future Slack and Viber slots;
- local time and `New York - EDT`, demonstrating automatic summer-time naming;
- a textual calendar-unavailable state with no stale appointment data;
- Pin and clean-close controls.

The semantic fallback badge initially extended beyond a live native surface.
It was corrected so fallback badges render only while the corresponding DWM
surface is not visible.

During the final run the structured attention snapshot reported all three
semantic sources observed. Outlook reported aggregate Inbox unread `2`, showing
that the earlier `notExposed` result was a transient absence of its accessibility
label rather than a zero or calendar result.

## Automated validation

- TypeScript `tsc --noEmit`: passed.
- Vite 7.3.6 production build: 40 modules transformed successfully.
- `cargo fmt --all -- --check`: passed.
- `cargo clippy --all-targets -- -D warnings`: passed.
- `cargo test`: 16 passed, 0 failed, 1 intentionally ignored manual calendar
  diagnostic.
- `git diff --check`: passed.

## Runtime observations

Several consecutive one-minute metric windows completed for both mirror
controllers without rediscovery. Average cached-check times were approximately
0.3 to 0.7 ms, with observed maxima from approximately 3.3 to 15.3 ms. This is
useful smoke evidence, not the required 30-to-60-minute resource run.

## Still open

- Human drag gesture and multi-monitor/mixed-DPI movement.
- Non-default timezone change followed by application restart.
- Simultaneous Teams and Telegram taskbar reflow.
- Explorer restart and source close/reopen recovery.
- Controlled badge transitions and semantic/visual comparison.
- A 30-to-60-minute combined resource run.
