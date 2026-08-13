# Installed beta lifecycle and installer evidence

- Date: 2026-08-13 Europe/Kyiv
- Source revision: `da431d3`, tag `v0.4.0-beta.1`
- Installed version under test: `0.4.0-beta.1`
- Launch mode: per-user installed executable
- Sensitive values recorded: none

## Disk and worktree boundary

- C: began this closeout with 9.376 GiB free.
- `git worktree list` contained only the clean `main` worktree and this clean
  milestone worktree. The separate `main` worktree had no Rust target output
  and was preserved because it may belong to another active Codex task.
- This worktree's `src-tauri/target` contained 8.943 GiB of rebuildable output.
  The canonical installer on D: was re-hashed before cleanup.
- `cargo clean` removed 11,008 files and 8.9 GiB. C: then had 17.34 GiB free.
- The installed application contained two files totaling 13.63 MiB. Its
  per-user WebView data contained 802 files totaling 71.09 MiB; this is user
  data/cache, not repository build output, and was not deleted.
- No source checkout, user data, credential, installer, or unrelated cache was
  removed.

## Installed-state baseline

- The interactive user uninstall entry reported `0.4.0-beta.1`.
- The installed executable and uninstaller both reported product version
  `0.4.0-beta.1`.
- The exact Credential Manager target
  `AttentionHub/PublishedWorkCalendar` was present; its value was not read.
- Advanced reported the calendar as configured.
- All three fixed sources and both live visuals were enabled.
- App order was Teams, Telegram, Outlook; opacity was 85 percent; the widget
  was always-on-top and restored to `-1040,985,960,80`.
- A quiescent copy of the LevelDB preference directory was made on D: before
  destructive installer transitions. The five non-lock source and backup files
  had matching SHA-256 manifests. No file contents were inspected.

## Startup and restart

- One true initial installed cold start exposed the native widget after 242 ms.
- A dedicated exact gate then performed three installed starts from confirmed
  zero-process states. The widget exposed after 182, 179, and 187 ms; after an
  eight-second readiness delay, every cycle restored
  `-1040,985,960,80`. The first two cycles closed normally and the third left
  the installed beta running.
- Current source attention did not require native visual surfaces during the
  dedicated starts. Their absence was therefore not represented as startup or
  semantic failure.
- Three subsequent normal quit/restart cycles exposed the widget after 297,
  208, and 194 ms.
- Every cycle restored `-1040,985,960,80` and two visible 40 by 40 native
  surfaces. No development server was listening on port 1420.
- One additional normal widget close removed the complete Attention Hub-owned
  process tree. A direct installed restart exposed the widget after 203 ms.

## Outlook fallback and Advanced isolation

- With a real running Outlook window, the widget initially classified Outlook
  as `observed`. No unread value, source label, account identifier, or content
  was persisted in the diagnostic.
- Three minimize/restore cycles passed. Minimize changed the widget to explicit
  `lastObserved` after 5.09, 5.39, and 5.41 seconds. Restore returned it to fresh
  `observed` after 5.65, 5.39, and 5.42 seconds.
- The same Outlook process remained running throughout. Outlook termination and
  the corresponding `notRunning` clear remain user-driven because this pass did
  not stop source applications.
- Advanced opened and closed twice in 2.22 and 2.26 seconds. Each close destroyed
  only Advanced; the widget and installed process remained available.
- `scripts/windows/test-attention-hub-outlook-fallback.ps1` records only state
  classifications, transition timings, and process continuity.

## Explorer and display recovery

- Two Explorer restart cycles were executed while Attention Hub remained
  running. The first recorded cycle restored both taskbars but exposed only the
  Teams surface when the 35-second deadline elapsed. A second restart restored
  both surfaces in 6.49 seconds without restarting Attention Hub.
- One settled recheck then restored both taskbars and both surfaces in 14.34
  seconds. The intermittent first-cycle result is recorded as `M6-003`; it did
  not reproduce twice from the same state, so it does not meet the milestone's
  P1 fix threshold.
- Every snapshot retained the same Attention Hub process, the 960 by 80 widget,
  and its saved position. The JSON records contain window geometry and state
  only, never source pixels or labels.
- The widget moved from the secondary display to the primary display, back to
  the secondary display, and then to its exact saved position. At every step
  the widget remained 960 by 80 and both native surfaces remained 40 by 40 and
  aligned to their ordered slots.
- Both available displays reported 96 by 96 DPI. Cross-monitor recovery passed;
  mixed-DPI behavior cannot be claimed on this topology without changing a
  Windows display setting.
- `scripts/windows/test-attention-hub-installed-lifecycle.ps1` now provides a
  repeatable sanitized snapshot, an optional stabilization delay, and an
  optional one- or two-cycle Explorer test.

## Suspend and resume

- Two S3 suspend/resume cycles were accepted by Windows. Temporary wake tasks
  were armed for two minutes and removed by the test script after each cycle.
- The measured wall-clock gaps were 92.4 and 91.6 seconds.
- The same installed Attention Hub process survived both cycles. Before and
  after each resume, the widget remained at `-1040,985,960,80` and both visible
  surfaces remained aligned at 40 by 40.
- No `AttentionHub-M6-Wake*` scheduled task remained after the run.

## Resource run

- The installed beta ran for 1,884 seconds with 360 five-second samples and no
  crash or process loss.
- After the ten-minute warm-up, all 245 samples contained seven Attention Hub
  processes. Average normalized machine CPU was 3.178 percent and peak was
  3.194 percent, below the five-percent investigation threshold.
- Working set changed from 479,485,952 to 481,910,784 bytes and peaked at
  483,864,576 bytes. Private bytes changed from 218,894,336 to 222,003,200 and
  peaked at 223,772,672 bytes. Handles decreased from 3,757 to 3,692 and peaked
  at 3,765.
- Working set, private bytes, and handles did not grow at every post-warm-up
  sample. The run therefore did not trigger a resource P1 investigation.

## Uninstall retention and in-place upgrade

The canonical `0.3.0-beta.1` and `0.4.0-beta.1` installers matched their release
sizes and SHA-256 values and were unsigned as documented.

1. The installed `0.4.0-beta.1` process closed normally.
2. Its silent uninstaller returned zero and removed the uninstall entry and
   application directory.
3. The WebView storage directory and exact calendar credential target remained.
   One LevelDB file was briefly locked before uninstall, so byte-for-byte
   pre/post equality is not claimed from this transition.
4. A silent `0.3.0-beta.1` install returned zero. Registry and executable
   versions both reported `0.3.0-beta.1`; it did not auto-launch.
5. The installed `0.3.0-beta.1` reopened with the saved widget position,
   always-on-top state, 85 percent opacity, app order, configured calendar, and
   two native surfaces.
6. With `0.3.0-beta.1` closed, the `0.4.0-beta.1` installer ran in place and
   returned zero. Exactly one uninstall entry remained; registry and executable
   versions both reported `0.4.0-beta.1`.
7. The upgraded beta reopened with all retained state plus all three monitoring
   controls and both live-visual controls enabled.

This proves current-profile uninstall retention and the bounded
`0.3.0-beta.1` to `0.4.0-beta.1` in-place upgrade relevant to the installed
candidate. It does not claim the matrix's older `0.2.0` to `0.3.0-beta.1` path
and does not prove a disposable clean-machine installation.

## Remaining gates at this checkpoint

- Days 2 through 5 of the daily-use log remain real-time evidence. A daily
  heartbeat is active to append sanitized installed-state observations and stop
  after five entries.
- Windows Sandbox is disabled and Hyper-V has no registered VM. A clean-machine
  execution therefore requires an explicit Windows feature/VM decision.
- Mixed-DPI and display disconnect/reconnect remain unavailable without changing
  the current Windows display configuration.
- Outlook observed/minimized-last-observed/restored-observed transitions passed.
  Outlook stopped/cleared, real taskbar-button reorder, source close/reopen, and
  real-user source/native-surface activation remain manual because this
  closeout did not terminate source apps or synthesize user foreground input.
