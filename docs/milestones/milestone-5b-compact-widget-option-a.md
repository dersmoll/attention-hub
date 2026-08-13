# Milestone 5B: Compact widget Option A

## Status

Implemented on 2026-08-12. Automated validation passed; final visual acceptance
requires the user's live screenshot pass.

## Product outcome

Turn the compact main widget into one coherent bar whose physical window,
panels, app surfaces, clocks, calendar, and window controls follow the approved
dimensioned Option A mockup.

## Scope

- Fixed 960 by 80 main window.
- Aligned 304, 208, and 432-pixel panels, each 72 pixels high.
- Eight-pixel panel gaps and 10-pixel radii.
- Four integrated 48-pixel targets for Teams, Telegram, Outlook, and Advanced.
- Matching 40-pixel local and native inner surfaces.
- Horizontal `HH:mm` clocks.
- Dedicated 40-pixel pin and close controls inside the calendar panel.
- Focus, names, target sizes, contrast, forced colors, and reduced motion.
- Screenshot comparison against the approved mockup.

## Frozen behavior

Calendar/provider work, Graph, installer, autostart, tray, and unrelated
lifecycle work remain frozen. Teams and Telegram multi-monitor selection,
activation, Outlook fresh and last-observed semantics, widget persistence,
clocks, Advanced, saved ICS, and calendar acknowledgement remain intact. DWM
pixels remain visual-only.

## Acceptance gate

- [x] User approves Option A as the visual source of truth.
- [x] Tauri reports a 960 by 80 logical main window.
- [x] Panel rectangles match Option A within one logical pixel.
- [x] Native surfaces match their 40-pixel CSS inner rectangles at current DPI.
- [x] App, Advanced, pin, close, timezone, and acknowledgement controls meet the
      bounded target-size and accessible-name contract.
- [x] TypeScript, Vite, Rust tests, Clippy, formatting, and diff checks pass.
- [x] One live startup confirms the main/native geometry without creating a
      second Rust build directory.
- [ ] Outlook minimize/restore treatment receives a separate live acceptance
      pass; the user accepted the Option A appearance and requested only the
      Milestone 5C refinements.

## Screenshot comparison

Capture the exact main-window rectangle at a fixed Windows scale. Mask changing
times, event text, and badge values. Overlay the live image at 50 percent over
the approved reference, then inspect an edge-difference image. Panel, target,
control, and native-surface edges allow one logical pixel; text baselines allow
two pixels.
