# M24 popup reliability repair

Approved scope: keep auxiliary windows on the widget's running WebView2
environment, verify native and frontend readiness, and report bounded failures.
No provider, persistence, release, or automatic-restart changes.

## Investigation

The installed beta.15 process started at 10:41 on 2026-10-03 and retained
WebView2 155.0.4283.24. Windows installed 155.0.4283.33 at about 10:46 while
the process remained running. Today, Medicine and Settings then failed to open;
the clock, inline clock conversion and native context menu still worked.
Read-only native-window and thread inspection found no auxiliary native windows
and no global UI-thread deadlock.

Tauri 2.11.5 / runtime-wry 2.11.4 / wry 0.55.1 create a fresh browser
environment by default. A runtime-update conflict with an existing older
browser using the same profile is the strongest supported explanation; the
exact failure HRESULT was not captured, so this remains an evidence-backed
diagnosis rather than a reproduced native error.

Microsoft documents the browser-version/profile limitation under
[NewBrowserVersionAvailable](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2environment#add_newbrowserversionavailable).
Tauri's creation notification can precede native creation and React readiness,
and failed native creation can leave a registered label without a native window.

## Repair

- The native command accepts the existing nine auxiliary labels and local app
  entry URLs only. It obtains the widget's environment on the UI thread and
  passes that environment to each auxiliary WebView. An actual HWND query
  verifies creation. A nonblocking guard prevents reentrant native creation.
- A correlated React readiness signal is subscribed before creation. Native
  dispatch success alone cannot complete the opening operation.
- Native lookups, geometry preparation, placement and visibility checks have
  ten-second deadlines. Widget click guards clear after success or failure.
  Ready listeners are disposed even when registration completes late.
- Failure notices use fixed user-facing text with a close/reopen recovery step.
  Raw native errors, profile paths and URLs do not cross into notices.
- Today and Medicine retain their existing payload-readiness protocols.
  Failed Medicine-manager handoffs leave the originating popup open.

Simultaneous native creations may reject one request with a retry notice.
Deadlines bound the frontend wait; they cannot cancel native COM creation or
repair a phantom label already left by the old installed version. Restarting
the running installed app remains the immediate recovery for that old state.

## Validation

`scripts/test-auxiliary-window.mjs` executes the real readiness lifecycle and
Tauri adapter with mocked native ports. It covers dispatch-only timeouts,
correlation, early readiness, native rejection, late registration/completion,
duplicate creation, URL preservation, sanitized notices, stale labels and
visibility deadlines. Existing popup/workspace checks and TypeScript checking
must also pass. Rust compilation and tests require the separate build gate.

Human review uses `REVIEW-M24-POPUP-RELIABILITY.cmd` from this checkout. Repeat
open/close and rapid-click tests, then leave the app running through normal
use and a naturally occurring WebView2 update. Development review does not
establish installed-release acceptance. Build, launch, commit, push and release
remain separate approvals.

Verified on 2026-10-03 after build/launch approval:

- Production frontend build and Rust development compilation passed.
- All 11 auxiliary-window behavior checks and all three focused Rust tests
  passed. Eight existing checks passed: Advanced focus, Medicine panel,
  Medicine manager window, Sticky note, app update, meeting workspace,
  widget layout, and workspace model. TypeScript and `git diff --check` passed.
- Computer Use targeted the compiled executable in this checkout, with native
  process-path verification. Today opened three times; Medicine and Settings
  opened twice each. Rapid double-click checks produced one window. The
  Medicine-manager handoff, Project Hub, Sticky note, and to-do details rendered
  successfully and closed normally. Saved data was not edited.
- Event settings and the updater prompt were source/contract checked rather
  than opened live. No forced native failure, runtime update, sleep/wake or
  hours-long endurance test was performed. Installed beta.15 was not replaced.
