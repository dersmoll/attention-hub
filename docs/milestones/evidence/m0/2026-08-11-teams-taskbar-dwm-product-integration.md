# Teams taskbar DWM product integration evidence

- Date: 2026-08-11
- Scope: ADR 0009 opt-in Windows companion integration
- Environment: same Windows development desktop as the ADR 0008 readiness gate

## Implemented boundary

- The manual Cargo probe and product adapter share one native tracker.
- Tauri owns one `TeamsMirrorState` and exposes status, start, and stop commands.
- React labels the feature `Teams visual mirror (optional)` and states that
  Attention Hub neither reads the pixels nor converts the badge into a count.
- Start is asynchronous and status is polled through an application-owned DTO.
- The existing semantic Teams `activityStatus` signal is unchanged.
- No OCR, image recognition, screenshot ingestion, pixel readback, input
  forwarding, Teams process inspection, or numeric signal was added.

## Live findings

The first synchronous prototype exposed a real coordination issue: initial
taskbar discovery could outlast a fixed startup timeout while the existing
two-second attention-signal traversal also used UI Automation. Product startup
was changed to a background lifecycle, and a process-wide gate now serializes
provider access. Initial mirror discovery gets priority after current work;
cached mirror checks skip when the gate is occupied.

The final live run produced these observable states:

1. Clicking `Show Teams visual` returned control to the panel immediately.
2. Status transitioned to `running`; `Pixels visible` became `true`.
3. The native companion displayed the current Teams icon and real badge.
4. Native inspection showed the companion was visible, owned by the Attention
   Hub main window, and had both caption and thick-frame styles.
5. Its initial bounds were `1188,312,1524,395` while the main window bounds were
   `360,312,1176,951`, confirming the intended 12-pixel adjacent placement.
6. A real caption drag changed the companion bounds to
   `1268,360,1604,443`; the DWM content remained live.
7. `Stop mirror` removed the companion.
8. A second start recreated it; closing its native X removed it and the panel
   recovered to `stopped` with `Pixels visible` equal to `false`.

No screenshots are committed. Temporary local captures were used only to
operate and visually verify the running desktop application.

## Automated validation

- `cargo fmt --all`
- `cargo clippy --all-targets -- -D warnings`
- `cargo test`: 14 passed, 0 failed, 1 manual calendar diagnostic ignored
- TypeScript compilation through the repository `tsconfig.json`
- Vite production build: 32 modules transformed successfully
- `git diff --check`

## Remaining caveats

- Primary `Shell_TrayWnd` only; secondary taskbars remain unimplemented.
- The accepted brief stale-icon flash during a real taskbar reorder remains.
- Provider discovery time is outside Attention Hub's control; the UI therefore
  reports `starting` instead of promising a fixed deadline.
- This surface is visual-only and must not be used as evidence of a numeric
  Teams count.
