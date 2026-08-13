# Milestone 6 hardening baseline

- Date: 2026-08-13 Europe/Kyiv
- Baseline: merged `main` commit `ab9e228`, tag `v0.3.0-beta.1`
- Branch: `codex/m6-beta-hardening`
- Sensitive values recorded: none

## Entry state

- The worktree began clean with no branch divergence from the tagged beta.
- No Attention Hub process or installed-app uninstall entry was present.
- The worktree began without `node_modules` or `src-tauri/target`.
- The canonical `0.2.0` and `0.3.0-beta.1` NSIS installers were both present.
  Their size, embedded version, SHA-256, and unsigned Authenticode state matched
  their release records.
- C: had approximately 17.7 GiB free before dependency/native validation.

## Baseline-preserving fix

The v1 preference audit reproduced M6-001. The existing normalizer accepted a
string as `pinned`, any string as `secondaryTimeZone`, and non-finite numeric
coordinates. `Invalid/Zone` then caused `Intl.DateTimeFormat` to throw
`RangeError` while rendering the widget.

The smallest correction keeps the v1 storage key and schema, preserves valid
legacy pin/timezone/position values, and adds only bounded validation:

- pin must be boolean;
- timezone must be accepted by `Intl.DateTimeFormat`;
- coordinates must be finite and are normalized to physical integer pixels;
- existing color, opacity, and exact-app-order behavior is unchanged.

A focused Node test now covers a valid legacy subset, malformed pin/timezone/
coordinates, bounded opacity, malformed JSON, and appearance/order defaults.

## Automated validation

- `pnpm run test:preferences`: passed.
- TypeScript and Vite production build: passed, 42 modules transformed.
- `cargo test --all-targets`: passed, 30 tests and no failures.
- `cargo clippy --all-targets --all-features -- -D warnings`: passed.
- `cargo fmt --all -- --check`: passed.
- `git diff --check`: passed.
- Resource sampler PowerShell parse check: passed.

The managed filesystem sandbox prevented Vite from resolving its config during
the first build attempt. Re-running the same command with approved broader
filesystem visibility passed; no source workaround was made.

## Development resource smoke

The current development build was launched once only to validate the sampler.
It observed the fixed three-source contract and a configured calendar without
recording source labels, values, URLs, or pixels. It was stopped after the
bounded run; the development server and Attention Hub process were both closed.

The one-minute CSV contains 12 five-second samples for a stable seven-process
tree. Working set changed from 494,874,624 to 486,825,984 bytes, private bytes
from 239,087,616 to 229,609,472, and handles from 3,674 to 3,640. This is a
sampler smoke only. It does not satisfy the required 30-to-60-minute installed-
beta resource gate.

After validation, the single Rust target cache occupied 4,672,348,088 bytes and
frontend dependencies occupied 82,317,502 bytes. C: free space was
14,507,859,968 bytes. No parallel Rust target was created.

## Installer rehearsal limitation

A silent `0.2.0` invocation returned exit code zero, but the managed approval
environment redirected its per-user target to the isolated
`CodexSandboxOffline` identity. It did not create a usable installation or
uninstall entry for the interactive Windows profile. The one broken interactive
profile Start-menu shortcut created by that attempt was removed and its absence
was verified.

The attempt is therefore environment evidence only. Current-user install,
`0.2.0` to `0.3.0-beta.1` upgrade, direct installed launch, uninstall, and data-
retention behavior remain explicitly unexecuted. No clean-machine claim is
made.

## Remaining manual and daily-use gates

- Five working days using the sanitized dogfood log.
- Outlook fresh/minimized/last-observed/restored/stopped transitions.
- Suspend/resume and two Explorer-restart recoveries.
- Source close/reopen, taskbar reflow, and React/native activation.
- Daily-use monitor and mixed-DPI movement in both directions.
- Preference persistence through installed-beta restarts and a live migration
  seed/restore pass.
- A real-profile install/upgrade/uninstall rehearsal and separate clean-machine
  execution.
- One 30-to-60-minute installed-beta resource run.

These are not failures; they remain unexecuted acceptance cases and must not be
reported as passed.

## User-reported current-profile reinstall

Later on 2026-08-13, the user reported installing and reinstalling the canonical
`Attention Hub_0.3.0-beta.1_x64-setup.exe` successfully in the interactive
Windows profile and described the result as all good. This closes the basic
same-version install/reinstall usability observation. It does not by itself
claim `0.2.0` upgrade behavior, clean-machine coverage, uninstall data
retention, or the longer lifecycle/resource matrix.
