# ADR 0020: Personalize the compact widget surface and app order

- Status: accepted
- Date: 2026-08-13

## Context

The approved Option A geometry is compact and stable, but its two clock labels
used different browser line-boxes, and the Advanced view did not expose the
small set of visual preferences needed for daily use. Reordering React app
buttons without moving the separately owned native DWM windows would also make
the visible slots incorrect.

The calendar can show an acknowledged current event and one upcoming companion.
At the fixed 432 by 72-pixel panel size, these must share the content area rather
than increase the physical widget height.

## Decision

- Local and secondary clock labels share one explicit 24-pixel label row. The
  secondary timezone remains a native select with a decorative chevron.
- The two-event calendar state uses two equal bounded columns. Each event keeps
  three single-line rows and truncates overflow without increasing panel height.
- Advanced exposes one shared panel background color and an 85 through 100
  percent opacity range. Foreground, muted text, and structural border colors
  are derived for contrast; calendar amber and red attention surfaces remain
  fixed semantic overrides.
- Teams, Telegram, and Outlook can be reordered using named Move up and Move
  down buttons. Advanced remains fixed last, and a reset restores the default
  order.
- A shared version-one local preference record is normalized on every read, so
  prior position, pin, and timezone values migrate without a destructive reset.
- Tauri events apply preference changes immediately across the main and
  Advanced WebViews. Rust receives the Teams and Telegram slot indices and its
  existing 100-millisecond DWM reflow moves each native surface with the React
  slot.

## Accessibility contract

The color picker, range, select, and ordering actions remain native controls.
Every control has a persistent visible or programmatic label, ordering is fully
keyboard operable, focus remains visible, and the smallest action target is at
least 24 by 24 CSS pixels. Reordering and calendar states are expressed in text
and do not depend on color or drag input.

## Consequences

The widget gains bounded personalization without a theme framework or provider
abstraction. At minimum opacity, contrast is derived from the selected solid
surface color, but arbitrary desktop imagery can still affect the perceived
contrast of translucent pixels; the 85-percent floor limits that risk. The
calendar provider, source semantics, window bounds, and installer remain
unchanged.
