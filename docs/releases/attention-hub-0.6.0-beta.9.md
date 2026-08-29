# Attention Hub 0.6.0-beta.9

- Released: 2026-08-29
- Status: public beta
- Platform: Windows x64
- Format: NSIS setup executable plus signed Tauri updater artifacts
- Tag: `v0.6.0-beta.9`

## Milestone 15

- Introduces light, dark, and custom two-color panel surfaces. Light and dark
  are available from the native context menu, while custom appearance keeps
  independent background, text, and opacity controls.
- Consolidates the recommended layout into one compact surface, removes the
  Larger preset, reduces panel chrome, and keeps Compact single-line as the
  second supported layout.
- Refines the clock panel with left-aligned content, compact city labels, day
  context, and stable two-column converter behavior.
- Exposes local event settings, project time, and stash actions directly from
  the main calendar segment as well as the Today summary.
- Adds compact Teams and Zoom meeting indicators using calendar metadata and
  meeting URLs without broadening provider integration scope.
- Mirrors Viber's Windows taskbar visual surface so its native badge can remain
  visible in the shortcuts panel without pixel reading or invented counters.
- Enables the main panel's development inspector in debug builds.

## Release workflow maintenance

- Removes the unsupported release-notes input from the Tauri release action.
- Updates the pinned Tauri action away from its Node 20 runtime without using
  GitHub's insecure compatibility override.
- Retains the dedicated signed beta updater feed and protected release
  environment.

## Validation

- The user visually accepted the M15 panel, clock, calendar-action, provider,
  and Viber live-visual changes in development builds.
- Frontend model suites, the TypeScript/Vite production build, Rust formatting,
  all-target tests, and strict all-target/all-feature Clippy are release gates.
- The GitHub release workflow verifies synchronized versions and publishes the
  installer, updater archive, detached signature, and beta feed metadata.

## Known limits

- The Windows installer remains Authenticode-unsigned by design; the Tauri
  updater signature is the in-app update validation path.
- Users on `0.6.0-beta.6` or earlier still need to install `0.6.0-beta.7`
  manually before the signed beta updater path is available.
- DWM thumbnail integrations remain visual-only. Attention Hub does not read
  pixels or infer notification counts from mirrored surfaces.
