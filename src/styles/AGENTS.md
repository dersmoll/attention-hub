# Styles guide

Read this before touching anything under `src/styles/`. It tells you which file
owns a given class and which rules the stylesheet follows.

Entry point is `src/App.scss` — it `@use`s every partial in cascade order and is
imported once from `src/App.tsx`. There is no other stylesheet; all windows
share this one bundle.

## Where does my class live?

| You are restyling | File |
| --- | --- |
| Global custom properties (colours, radii, shadows, fonts) | `_tokens.scss` |
| Reusable mixins/functions | `_mixins.scss` |
| Element defaults: `button`, `table`, `dl`, `hr`, `.actions`, `.sr-only`, `[data-status]` | `_base.scss` |
| Per-window `html`/`body`/`#root` sizing (`data-window="…"`) | `_windows.scss` |
| Attention dashboard: `.app-header`, `.attention-*`, `.source-*`, `.section-heading`, `.technical-details`, `.secret-probe-form`, `.eyebrow` | `_app-main.scss` |
| Preference fieldsets: `.widget-preference*`, `.widget-source-control*`, `.widget-app-order`, `.panel-surface-*`, `.widget-color-control`, `.calendar-configuration`, `.calendar-attention-settings` | `_preferences.scss` |
| Updater prompt: `.app-update-*` | `_app-update.scss` |
| Advanced settings window: `.advanced-*`, plus its denser re-skin of the shared components | `_advanced-settings.scss` |
| "Later" inbox window: `.later-*` | `_later-inbox.scss` |
| Widget rail: `.widget-shell`, `.widget-zone`, `.widget-app-*`, `.widget-clock*`, `.widget-utility*`, `.widget-error`, `.hub-close-icon` | `_widget-core.scss` |
| Calendar band + today panel: `.widget-calendar*`, `.widget-calendar-day-panel*`, `.today-popup-shell*` | `_widget-calendar.scss` |
| Detached panels: `.event-settings-*`, `.project-stash-*` | `_event-panels.scss` |
| `data-width-mode="recommended"` size overrides | `_widget-standard.scss` |
| `data-width-mode="slim"` size overrides | `_widget-slim.scss` |

Some classes appear in two files on purpose: the base look lives in its own
partial, and `_advanced-settings.scss` / `_widget-standard.scss` /
`_widget-slim.scss` re-skin it for a denser context. Change the base file unless
your change is specific to that context.

## Cascade order matters

`App.scss` loads partials in a deliberate order:

1. `tokens`, `base`, `windows` — foundations
2. `app-main`, `preferences`, `app-update`, `advanced-settings`, `later-inbox`
3. `widget-core`, `widget-calendar`, `event-panels`
4. `widget-standard`, `widget-slim` — width-mode overrides, loaded last

Several rules rely on source order rather than specificity (for example
`.widget-calendar small` must precede `.widget-calendar__next small`; the slim
rail's `> .widget-utility` radius must follow the shared segment rule). **Do not
reorder rules or partials without checking the compiled output.**

## Rules

### 1. Nest elements under their block

Use `&__element`, not a repeated flat selector. This is the house style.

```scss
.widget-calendar {
  padding: 8px;

  &__content { … }          // → .widget-calendar__content
  &__event { … }            // → .widget-calendar__event
  &[data-day-summary] { … } // → .widget-calendar[data-day-summary]
}
```

Inside a *modifier* block `&` is no longer the bare block, so capture it first:

```scss
.widget-calendar {
  $block: &;

  &[data-calendar-attention="started"] {
    #{$block}__state { color: var(--color-danger-strong); }
  }
}
```

Trade-off to know: `.widget-calendar__state` is no longer greppable as a literal
string. Search for `__state` or for the block name instead.

A plain nested class (no `&`) produces a **descendant** selector and raises
specificity — only do it when you mean it, and say why in a comment.

### 2. Never hardcode a value that has a token

Check `_tokens.scss` first. Colours, radii, shadows, and the two font stacks all
live there. Add a token when a value is used in two or more places; keep true
one-offs inline.

Token families:

- `--color-canvas* / -surface*` backgrounds, `--color-text*`, `--color-border*`
- `--color-*-chrome*` — the denser advanced-settings/updater windows only
- status: `--color-danger*`, `--color-success*`, `--color-warning*`,
  `--color-caution-*`, `--color-notice-*`
- `--radius-field | -control | -notice | -card | -card-lg` (rem, document
  windows) and `--radius-panel | -chrome | -chrome-card | -pill` (px, widget
  rail and compact chrome)
- `--shadow-panel | -floating | -popover`
- `--font-ui`, `--font-numeric` (tabular clock/time digits)

### 3. Never repeat a size

Equal width and height is one value, not two:

```scss
// no
width: 12px;
height: 12px;

// yes
@include square(12px);
```

And a size that differs per width mode is a custom property on `.widget-shell`,
not a duplicated override rule. `_widget-core.scss` owns the rule;
`_widget-standard.scss` and `_widget-slim.scss` only re-point the token:

```scss
// _widget-core.scss
.widget-shell { --widget-utility-surface-size: 20px; }
.widget-utility__surface { @include square(var(--widget-utility-surface-size)); }

// _widget-slim.scss
.widget-shell[data-width-mode="slim"] { --widget-utility-surface-size: 24px; }
```

The tokens already wired up this way are `--widget-app-slot-size`,
`--widget-app-slot-radius`, `--widget-app-surface-size`,
`--widget-app-surface-radius`, `--widget-app-icon-size`,
`--widget-utility-surface-size`, `--widget-utility-icon-size` and
`--widget-utility-close-size`. Add to that list rather than adding a
`.widget-shell[data-width-mode="…"] .some-element { width: … }` rule.

`--widget-utility-width`, `--widget-left-width`, `--widget-clock-width`,
`--widget-calendar-width`, `--widget-height`, `--widget-grid-template` and
`--widget-drag-handle-width` are written from `widget-layout.ts` onto the shell.
Read them; never restate their numbers in CSS, or the rail and the window size
will drift apart.

### 4. Component-scoped properties stay on the component

Global tokens go in `_tokens.scss`; anything only one component needs is
declared on that component's root and points at a global token where possible:

```scss
.later-shell {
  --later-accent: var(--color-brand);
  --later-control-height: 1.75rem;
}
```

### 5. Widget panel colours are user-themed — no fallbacks

`widgetPanelStyle()` in `src/widget-preferences.ts` writes
`--widget-panel-background`, `--widget-panel-solid`, `--widget-panel-foreground`,
`--widget-panel-accent`, `--widget-panel-accent-foreground`,
`--widget-panel-interactive-foreground`, `--widget-panel-muted` and
`--widget-panel-border` inline on every panel root, and `:root` declares
defaults for all eight. Write `var(--widget-panel-muted)`, never
`var(--widget-panel-muted, #475569)` — the fallback is dead code and drifts out
of sync.

To derive a colour from the themed panel use the helpers, not a literal:
`panel-tint(6%)`, `panel-border-wash(36%)`, `panel-foreground-wash(45%)`,
`panel-accent-hover()`.

### 6. Reach for a shape mixin before writing a new one

From `_mixins.scss`. A partial that uses one needs `@use "mixins" as *;` as its
first line — most already have it.

| Mixin | Use for |
| --- | --- |
| `surface-card($padding, $radius, $border, $background)` | any bordered card or settings panel |
| `icon-button($size, $radius)` | square button holding one glyph |
| `count-badge($size, $offset, $font-size, …)` | corner counter badge |
| `uppercase-label($font-size, $tracking, $weight)` | eyebrows, state words, section tags |
| `truncate` | single-line ellipsis |
| `square($size)` | equal width and height |
| `fixed-size($size)` | width/min-width/height/min-height together |
| `stroke-icon($size, $stroke-width)` | outlined SVG drawn with `currentColor` |
| `empty-placeholder($color)` | `data-placeholder` hint in a contenteditable |
| `visually-hidden` | screen-reader-only content |
| `widget-focus-ring` | focus ring for controls on the widget rail |
| `stack-on-narrow { … }` | flex row that becomes a column under `$breakpoint-narrow` |
| `narrow-viewport`, `reduced-motion`, `forced-colors` | media queries |
| `window-shell($labels…)`, `window-body($labels…)` | per-window `html`/`body`/`#root` rules |

Careful with `fixed-size` on flex items: it emits `min-width`, which a
width-mode override that only sets `width`/`flex-basis` will not undo. That is
why `.widget-app-slot` is written out by hand.

### 7. Accessibility is not optional

Keep the `@include forced-colors` blocks working when you touch borders or
backgrounds, keep `@include reduced-motion` opt-outs on anything animated, and
never remove a focus ring without replacing it.

## Before you finish

```bash
pnpm run test:widget-layout && pnpm run test:meeting-workspace
```

Both compile `src/App.scss` (via `scripts/app-styles.mjs`) and assert against the
resulting CSS, so they catch a selector you accidentally changed while nesting.
`pnpm test` runs the full suite.

For a larger refactor, diff the compiled CSS before and after:

```bash
npx sass --no-source-map --style=expanded src/App.scss /tmp/after.css
```
