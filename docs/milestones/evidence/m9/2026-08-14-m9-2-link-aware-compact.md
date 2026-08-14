# Milestone 9.2 link-aware compact evidence — 2026-08-14

## Automated evidence

- TypeScript and the Vite production build passed with 49 transformed modules.
- Attention-model, widget-preference migration, time-zone, responsive
  widget-layout, and Later Inbox model tests passed.
- Later model tests cover the 360×420 default and 340×360 minimum geometry,
  plain-text HTTP(S) linkification, punctuation boundaries, and unsupported
  plain-text schemes.
- All 42 Rust tests passed. New coverage verifies schema-v1 context migration,
  safe linked-segment normalization, unsafe note-URL rejection, the 4,000-note
  boundary, saved-item link activation, previous-valid backup, destructive
  cleanup, corrupt-primary recovery, and future-schema refusal.
- Clippy passed for all targets with warnings denied.
- Rust formatting and `git diff --check` passed.

## Security and privacy boundary

The WebView converts clipboard input into text segments plus optional HTTP(S)
links. It does not persist source HTML, images, files, embeds, scripts, styles,
or other markup. Rust revalidates every saved segment and confirms that an
inline URL belongs to the requested saved item before opening it. Embedded URL
credentials remain rejected.

## Live evidence still required

- Paste a synthetic request containing linked words from a real work
  application and confirm text, paragraph breaks, and link activation survive
  save, edit, close, and restart.
- Confirm that unsupported formatting and images are discarded, and that
  keyboard editing, native-X dirty protection, and opener focus return remain
  usable in the content-editable field.
- Confirm the 360×420 default and 340×360 minimum remain readable at the current
  display scale and in Windows forced-colors mode.
- Reproduce Outlook observed-to-minimized state and confirm a visible ellipsis
  replaces the historical numeric badge while the accessible explanation keeps
  the last-observed count.

No private source content was captured during this automated gate, and the app
was not launched or foregrounded. These live checks are therefore not claimed.
