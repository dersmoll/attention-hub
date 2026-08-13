# Fixed-source monitoring controls evidence

- Date: 2026-08-13 Europe/Kyiv
- Baseline branch: `codex/m6-beta-hardening`
- Sensitive values recorded: none

## Implemented contract

- Existing preference records migrate to Teams, Telegram, and Outlook monitored
  with both existing live visuals enabled.
- Monitoring and live-visual selections are independent bounded subsets.
- Selected fixed source keys cross IPC; Rust rejects unknown keys and removes
  duplicates before capture.
- Native UI Automation traverses only selected sources. Empty selection returns
  an empty snapshot before UI Automation initialization.
- Coverage uses the selected denominator. Zero selected sources renders
  **Monitoring paused** and cannot render **All clear**.
- The widget row contains selected sources plus Advanced, remains centered, and
  gives native Teams/Telegram surfaces the same compressed slot layout.
- A live visual starts only when its source is monitored, its semantic signal
  reports attention, and its separate preference is enabled.

## Automated validation

- Preference migration and subset tests passed.
- Attention coverage tests passed for partial selection, disabled positive
  sources, zero selected, and missing selected observations.
- TypeScript `--noEmit` passed.
- Vite production build passed with 42 transformed modules.
- Rust `cargo test --all-targets` passed 32 tests.
- Rust selection tests cover bounded/deduplicated keys and selected-only failure
  observations.
- Native geometry tests cover centered one-, two-, and three-source rows.
- Clippy with all targets/features and warnings denied passed.
- Rust formatting and `git diff --check` passed.

## Live validation

After the user closed the installed `0.3.0-beta.1`, the M7 worktree was launched
once at a time with `pnpm tauri dev`. No installed-beta process was overlaid.

- Advanced exposed all three fixed source controls and separate Teams/Telegram
  live-visual controls through Windows UI Automation.
- Deselecting Outlook compressed the two native visual surfaces from the
  four-control default row to the three-control row.
- Deselecting Teams left Telegram centered in the two-control row and disabled
  the Teams live-visual control without changing its saved value.
- Deselecting Telegram produced **Monitoring paused**, returned an empty native
  snapshot, and removed both native visual surfaces.
- Reset restored all three monitored sources, both live visuals, and the
  original four-control geometry.
- An Outlook-disabled selection survived a full application close and relaunch;
  reset then restored the all-source defaults.
- Turning off only Telegram's live visual removed its native surface while
  Telegram monitoring remained enabled. Reset restored the visual.

The run also found one native cleanup warning when a visible thumbnail stopped.
It is tracked as verified M6-002. Releasing the thumbnail on `WM_CLOSE`, before
the destination window is destroyed, removed the warning during a live-visual
stop and a full application close. The remaining mirror stayed active and both
mirrors registered again with their original multi-monitor taskbar selections.
