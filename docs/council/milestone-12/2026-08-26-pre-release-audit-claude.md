# Attention Hub pre-release audit — functional and UI/UX state

- Date: 2026-08-26
- Reviewer: Claude (Opus 5)
- Baseline: branch `codex/m12-optional-panels-slim-layout`, working tree on top of
  `2248aed` (released `0.6.0-beta.5`), including the uncommitted M12 optional-panels
  and compact single-line work.
- Purpose: independent readiness review before a final release.

## 1. Method and scope

What was done:

- Full read of the frontend surfaces (`WidgetView`, `AdvancedView`, `LaterInboxView`,
  `AttentionPanel`, `LaterInboxDataPanel`) and all shared models.
- Full read of `App.css` widget/Advanced/Later sections, focused on layout, state
  colours, focus handling, reduced motion, and forced colours.
- Read of the Rust command surface, `work_calendar`, `published_ics` bounds and URL
  policy, `later_inbox` storage/notification paths, `attention_signals`, `uia_gate`,
  and the M12 `teams_mirror` slim/reposition diff.
- Manifest, capability, packaging, and repository-hygiene review.
- Re-ran every release gate that can run without a Windows GUI session.
- Computed the real widget geometry for every preset and compared it with the window
  manifest.

What was **not** done (and should still be done by the project owner before release):

- No run of the installed or dev build; no visual/manual smoke test, no DPI or
  multi-monitor test, no installer upgrade/uninstall test.
- No verification of DWM mirror alignment in Compact single-line on real hardware.
- No non-English Windows/Outlook/Teams/Telegram verification.

### 1.1 Verification results (all green)

| Gate | Result |
| --- | --- |
| `tsc --noEmit` | pass |
| `vite build` (production) | pass — 60 modules, 323 kB JS / 57 kB CSS |
| 7 frontend model suites | pass |
| `cargo test --all-targets` | pass — 49 tests |
| `cargo clippy --all-targets --all-features -D warnings` | pass |
| `cargo fmt --check` | pass |

Code hygiene is genuinely good: zero `TODO`/`FIXME`/`unimplemented!`, no `unwrap`
outside tests, bounded parsing everywhere, and a well-tested privacy boundary. The
findings below are almost all product-completeness and polish issues, not rot.

---

## 2. Findings

Severity key: **S1** = should block a final release, **S2** = should be fixed before
calling it final, **S3** = polish / follow-up.

### S1-1 — The widget error strip is never cleared and shows raw developer strings

`widgetError` has 16 setters and **zero** clears
(`src/WidgetView.tsx:517`, sites at
`src/WidgetView.tsx:620`, `src/WidgetView.tsx:755`,
`src/WidgetView.tsx:888`, `src/WidgetView.tsx:1016`,
`src/WidgetView.tsx:1062`, `src/WidgetView.tsx:1099` …).
Once anything fails once — a single attention poll at startup, one mirror reposition
during a drag — a 10 px red one-line strip pins itself to the bottom-right of the
widget for the rest of the session (`src/App.css:3090`). It has no
dismiss control, no auto-expiry, and no success path that resets it.

The content is also developer-facing: `Attention refresh failed: ${String(error)}`.

This is the single most likely thing a first-time user will hit and report. The
`data-feedback` tooltip added in beta.5 for activation failures is the right pattern —
apply it here: transient, human-readable, self-clearing, and clear the strip on the
next successful refresh.

### S1-2 — Diagnostics still ships the notification-listener spike, contradicting the privacy doc

`docs/privacy.md:25` states message and notification bodies are "deliberately not
collected". The Advanced → Diagnostics page still contains the Milestone-0 spike
(`src/App.tsx:1373` "Milestone 0 persistent attention-signal evidence",
`src/App.tsx:1476` "Windows Notification Center comparison … Retained as
spike evidence"). It:

- offers a **Request access** button for the Windows `UserNotificationListener`
  capability;
- auto-calls `get_notification_snapshot` and `start_notification_listener` whenever
  access is already allowed (`src/App.tsx:617`,
  `src/App.tsx:623`);
- renders notification **title, body, and raw text elements** in a table
  (`src/App.tsx:1586`).

Nothing is written to disk, so the doc is not literally false about *storage* — but a
shipped product that asks for notification-reading permission and then displays every
notification body is not defensible under the stated vision, and a reviewer will read
it as a contradiction.

Recommendation: remove `get_notification_snapshot`, `start_notification_listener`,
`request_notification_access`, `get_notification_access_status` and the whole
`notifications` module from the release build (or gate them behind a debug feature).
If the surface stays, `docs/privacy.md` and `docs/architecture.md` must describe it
explicitly.

### S1-3 — No LICENSE, no CI, no CHANGELOG, no SECURITY policy

The repository root has no `LICENSE`/`COPYING`, no `.github/` (no build or test
workflow, no issue templates), and `src-tauri/Cargo.toml` has `authors = []` and no
`license` field. For a public GitHub release this is a blocker independent of code
quality — a downloadable installer with no licence terms.

Related: `sounds/README.md` says distribution rights for the bundled WAV "remain the
project owner's responsibility", and the six source glyphs in
`src/WidgetView.tsx:285` are hand-drawn approximations of the
Teams / Telegram / Outlook / Slack / Viber / WhatsApp marks. A short
`docs/third-party.md` covering audio provenance and trademark/nominative-use posture
would close this cleanly.

### S1-4 — Window manifest geometry no longer matches any shipped preset

`src-tauri/tauri.conf.json` declares `width: 1112, height: 80, minWidth: 744,
maxWidth: 1208, minHeight: 80, maxHeight: 80`. The actual runtime geometry:

| Preset | Minimum width | Default width | Maximum width | Height |
| --- | --- | --- | --- | --- |
| Recommended | 346 | 666 | 1274 | 68 (292 with Today open) |
| Larger | 492 | 876 | 1460 | 80 (304) |
| Compact single-line | 410 | 660 | 1580 | 44 (268) |

Every value is outside the declared box. Two consequences:

1. **Startup flicker (visible today).** The window is created at 1112×80, centered and
   `visible`, then React resizes it to e.g. 666×68 and moves it to the saved position.
   Every launch shows a wrong-size widget in the wrong place for a frame or more.
   Fix: `"visible": false` in the manifest plus an explicit `show()` after the first
   layout pass, and set the manifest defaults to the Recommended geometry.
2. **Latent clamping.** In tao 0.35.3 the constraints are applied only through
   `WM_GETMINMAXINFO` track sizes, and `set_inner_size` goes straight to
   `SetWindowPos`, so programmatic resizes are not clamped today. That is luck, not
   design — a tao/Tauri upgrade or any future user-resizable path would immediately
   cap Compact single-line at 1208 px and floor the height at 80 px. Correct the
   manifest to the real range (or drop min/max entirely, since `resizable: false`).

Related startup race: the resize effect (`src/WidgetView.tsx:945`)
and the position-restore effect (`src/WidgetView.tsx:1037`) both
run on mount and both call `setPosition` asynchronously with no ordering guarantee. The
resize effect clamps a position it read before the restore effect wrote one.

### S2-1 — Six dead commands remain in the IPC allowlist

`start_teams_mirror`, `stop_teams_mirror`, `get_telegram_mirror_status`,
`start_telegram_mirror`, `stop_telegram_mirror`, and `set_taskbar_mirror_layout` have
zero frontend callers but are still registered in `generate_handler!`
(`src-tauri/src/lib.rs:527`). `docs/architecture.md` claims an
"allowlisted Tauri command surface"; six unused entry points is the opposite. Removing
them costs nothing and shrinks the surface.

### S2-2 — Semantic attention is silently English-only

Teams activity, Telegram unread chats, and Outlook Inbox unread all parse English
accessibility strings:
`src-tauri/src/attention_signals/windows_adapter.rs:589`
matches `"unread chat)"`, `needs_attention` matches `"new activity"` /
`"unread"` / `"notification"` (`src-tauri/src/attention_signals/windows_adapter.rs:600`),
and `parse_outlook_inbox_unread` matches `"Inbox … N unread"`
(`src-tauri/src/attention_signals/windows_adapter.rs:617`). One diagnostic even
says "no English Inbox accessibility label was found"
(`src-tauri/src/attention_signals/windows_adapter.rs:312`).

On a German, French, Ukrainian, or Serbian Windows/Outlook the app degrades to
"attention state is not exposed" for its three semantic sources — i.e. the core value
proposition silently disappears. Nothing in the README, architecture doc, or in-app
copy tells the user why.

Minimum: state the English-UI requirement in the README and in the Diagnostics panel.
Better: add per-locale label patterns for the top handful of languages, or detect the
UI language and surface an explicit "unsupported UI language" state instead of a
generic `notExposed`.

### S2-3 — Source buttons cannot launch a closed app

`activate_source` only restores an existing window
(`src-tauri/src/teams_mirror/windows_adapter.rs:812`), and the
button is `disabled` when the process is not running
(`src/WidgetView.tsx:1648` and peers, styled at
`src/App.css:1824`). The README calls this row "app shortcuts", and the
failure tooltip literally says "Start or restore it, then try again" — telling the user
to do the thing the button looks like it should do. This is the highest-value
functional gap in the widget.

### S2-4 — The Today panel is mouse-only

The calendar surface opens today's meeting summary from a bare `onClick` on a
`<section>` with no `role`, `tabIndex`, or key handler
(`src/WidgetView.tsx:1924`). Keyboard and screen-reader users
cannot reach the feature at all. The same element also carries an unconditional
`title="Click the calendar area for today's meetings"` even when
`daySelections` is empty and the click is a no-op — a tooltip that lies in the
unconfigured and empty states.

(Join / I'm in / Finish are fine: they are real buttons and `:focus-within` reveals
them, so keyboard access works there.)

### S2-5 — Time format is hard-coded to 24-hour, and inconsistently so

`formatTime` and `formatCalendarRange` force `hourCycle: "h23"`
(`src/WidgetView.tsx:117`,
`src/WidgetView.tsx:133`), ignoring the Windows locale. Meanwhile the Later
Inbox uses locale-aware `timeStyle: "short"`
(`src/LaterInboxView.tsx:48`), so a US user sees `14:30` on the
widget and `2:30 PM` in reminders — in the same product. Add a 12/24-hour preference
defaulting to the system locale, and apply it everywhere.

### S2-6 — No dark theme anywhere

`:root` is a single hard-coded light palette (`src/App.css:1`) with no
`prefers-color-scheme` handling. The widget's colour picker only tints the widget
panels; the Advanced (900×680) and Later Inbox windows are always bright white. On a
dark-themed Windows 11 desktop, opening Advanced is a flashbang. The widget's
attention states also force a light cream/red surface
(`src/App.css:2473`) that clashes with a user-chosen dark panel colour.

### S2-7 — Widget-side timezone changes do not reach an open Advanced window

The two inline clock selects call `writeWidgetPreferences` + `setPreferences` without
emitting `WIDGET_PREFERENCES_CHANGED_EVENT`
(`src/WidgetView.tsx:1814`,
`src/WidgetView.tsx:1867`) — unlike `updateWidgetPreferences`
(`src/WidgetView.tsx:1103`) which does. An open Advanced window keeps showing
the old primary/secondary zone until it is reopened. No data is lost (writes always
re-read localStorage first), but the two surfaces visibly disagree.

### S2-8 — A failed calendar save discards the pasted secret URL

`saveWorkCalendarSource` clears the field on entry
(`src/App.tsx:388`) and then, on any verification or network failure, sets
an error and leaves it empty (`src/App.tsx:414`). The user must go back to
Outlook and re-copy a long publication URL to retry. Keep the value until a save
actually succeeds, and clear it then.

### S2-9 — There is no version anywhere in the UI

Neither the widget nor Advanced displays a version, build date, or link to release
notes. For an unsigned, manually-updated beta this is the main way a user can tell you
what they are running when they report a bug. An **About** page in Advanced with
version, install path, WebView2 version, and a link to the GitHub releases page is
close to free.

### S2-10 — Steady-state IPC cost is higher than it needs to be

- A 1-second poll invokes `get_taskbar_mirror_status` for **all five** visual sources
  regardless of what the user enabled (`src/WidgetView.tsx:100`,
  `src/WidgetView.tsx:926`) — 5 IPC round-trips per second, 300/minute.
- The layout/start/stop effect (`src/WidgetView.tsx:870`) depends on the whole
  `preferences` object *and* on `attentionSnapshot`, so it re-runs every 5 s and fires
  `set_fixed_taskbar_mirror_layout` plus start/stop for all five sources — another
  11 invokes every 5 s, plus a redundant `refreshMirrors()` at the end of each run.
- The 1 s `now` tick re-renders the whole widget every second even though the clock
  only has minute resolution.

For an always-on desktop widget on battery this is worth tightening: poll only enabled
visual sources, back the interval off to 2–3 s, narrow the effect's dependency list to
the fields it actually reads, and align the clock tick to the minute boundary while
keeping a shorter tick only when a countdown is visible.

### S3 — Smaller items

| # | Finding | Location |
| --- | --- | --- |
| S3-1 | The × button quits the whole app with no confirmation and no tray/hide alternative. With `skipTaskbar: true` there is no undo. | `src/WidgetView.tsx:2216` |
| S3-2 | No "Reset widget position" action. If a monitor is unplugged while the widget is on it, re-clamping only happens on mount or on a width-changing preference change — which needs Advanced, which needs the widget. | `src/WidgetView.tsx:441` |
| S3-3 | The widget shows no date at all — only `HH:mm` per zone. Day-of-week/date only appears inside a calendar range string. | `src/WidgetView.tsx:1853` |
| S3-4 | Advanced copy calls the bundled WAV "one Windows system sound"; it is a bundled file played via `PlaySoundW`. | `src/App.tsx:1215` |
| S3-5 | `AttentionPanel` empty state says "Use Source monitoring above" — Source monitoring moved to the Apps page in the M10 navigation refactor. | `src/AttentionPanel.tsx:300` |
| S3-6 | `announcedMeetingStartAlertsRef` and `finishedActiveEvents` grow without bound for the process lifetime. Harmless in practice, unbounded in principle. | `src/WidgetView.tsx:535`, `src/WidgetView.tsx:514` |
| S3-7 | `MIAMI_TIME_ZONE` and `DEFAULT_TIME_ZONE = "America/New_York"` are personal defaults baked into shipping code. A first-run secondary clock of "Miami" is arbitrary for most users. | `src/WidgetView.tsx:98`, `src/widget-preferences.ts:3` |
| S3-8 | `Policy::none()` rejects any Published ICS URL that answers with a redirect (`RedirectBlocked`). Correct as a security default, but the failure is opaque to the user. Surface a specific "this link redirects" message. | `src-tauri/src/published_ics/mod.rs:218` |
| S3-9 | The calendar setup copy is Outlook-specific and gated on an Outlook-specific confirmation, although the parser is a generic ICS reader that would accept Google/iCloud secret ICS URLs. | `src/App.tsx:1284` |
| S3-10 | `button:disabled { cursor: wait }` globally — wrong affordance for permanently disabled controls. | `src/App.css:40` |
| S3-11 | The activation-failure tooltip is a 220 px `::after` inside a window clipped by `overflow: hidden`. In Compact single-line (44 px tall) a two-line tooltip will be cut off. | `src/App.css:1849` |
| S3-12 | `zero_string` best-effort wiping does not cover `published_url.clone()` handed to the probe, nor any reallocation. Fine as intent, but it should not be described as a guarantee. | `src-tauri/src/work_calendar/mod.rs:400` |
| S3-13 | Repo hygiene: two 3 MB installers sit untracked in the root and `*.exe` is not in `.gitignore`; ten unused candidate MP3s sit in `sounds/`; `RUN-ATTENTION-HUB.cmd` is a machine-specific "Milestone 12 Test Launcher" hard-coding a `codex-runtimes` Node path at the repo root. | root, `.gitignore` |
| S3-14 | `package.json` has no aggregate `test` script (seven suites must be run individually) and no frontend linter/formatter, while Rust has clippy + fmt. | `package.json` |

---

## 3. UI/UX assessment by surface

### 3.1 Widget — strong

The four-zone model works. Density presets are well thought out, the state vocabulary
(*Up next / Starting soon / Meeting started / In progress*) is honest, the
hover/focus-revealed Join·I'm in·Finish actions keep title width free, `:focus-within`
makes them keyboard-usable, reduced-motion and forced-colours are handled, and the
right-click context menu is a genuinely good discoverability shortcut for size,
panels, sources, and clock layout.

Weak points, in order: the never-clearing error strip (S1-1), the mouse-only Today
panel (S2-4), disabled-when-closed source buttons (S2-3), forced 24-hour time (S2-5),
no date (S3-3), and the destructive × (S3-1).

### 3.2 Compact single-line (M12, in progress) — good direction, verify on hardware

The unified 44 px rail with a dedicated dotted drag handle is the right answer to
"the calendar zone is not a drag region". Layout maths, preference migration
(`slim` is a new value; legacy `compact` still maps to `recommended`), and the native
mirror geometry (`WIDGET_SLIM_*` constants, `slim_mode` flag threaded through
`set_fixed_taskbar_mirror_layout`) are all consistent, and the new
`reposition_taskbar_mirrors` call on `onMoved` is a real improvement for mirror
tracking during drags.

Things to check on real hardware before shipping it:

- Slim calendar width grows heuristically from a **character count**
  (`growthPerCharacter` 4–5 px, `src/widget-layout.ts:119`).
  Proportional fonts make this approximate; long titles at 800 px dual-max will still
  ellipsize, short ones will leave slack. Verify against real meeting titles.
- 26 px utility buttons with 12 px glyphs are below the Windows 11 comfortable target
  and close to the practical minimum for precise clicking.
- 9 px state pills and 10 px detail text are at the readability floor on 100 % scaling.
- Tooltip clipping (S3-11) and mirror alignment at 125 %/150 % DPI.

### 3.3 Optional panels (M12) — one gap

Hiding both panels is correctly wired end to end (grid template, window width, mirror
pause, Advanced checkboxes, context menu). The one gap: **there is no way to hide the
calendar panel**, so the minimum widget is still 346 px wide even for a user who only
wants clocks. If "optional panels" is the feature, the calendar should be optional too
— with a sensible guard against hiding all three.

### 3.4 Advanced — solid shell, two rough pages

The PowerToys-style two-column layout with six pages is clean and the mounted-but-hidden
page strategy correctly preserves drafts. Gaps: no About/version (S2-9), no settings
search, no "reset all settings", no dark theme (S2-6), and Diagnostics is still a raw
spike dump (S1-2) with a debug-grade heading ("Milestone 0 persistent attention-signal
evidence") that a real user will never understand.

### 3.5 Later Inbox — good bones, missing the daily-use verbs

The three-step What/When/Details wizard, dirty-draft guard on Escape and on close,
inline delete confirmation, Work/Private split, link-aware notes with a character
budget, and the "previous valid backup" recovery banner are all well executed.

What daily use will immediately ask for: **snooze** (the single biggest omission — a
due reminder can only be completed, edited, or deleted), recurring reminders, search
or filter once the list passes ~20 items, actionable toast buttons, and quick capture
without opening the full window. Scope tabs are also disabled while the wizard is open
(`src/LaterInboxView.tsx:486`), which is defensible but feels
locked.

### 3.6 Accessibility summary

Good: `sr-only` live regions, `aria-pressed`/`aria-current`, focus-visible rings
everywhere, `forced-colors` and `prefers-reduced-motion` blocks, progress bars with
proper ARIA, and post-action focus restoration in Later Inbox.

Gaps: the mouse-only Today panel (S2-4); `AppSlot` duplicates a long string into both
`aria-label` and `title`, so screen readers announce it twice and a large native
tooltip fires on hover (`src/WidgetView.tsx:416`); the clock
`<select>` elements keep `value=""` with the current zone as a placeholder option
(`src/WidgetView.tsx:1809`), so the current selection is not
programmatically marked; and with `skipTaskbar: true`, no tray, and no global hotkey,
there is no keyboard route *to* the widget at all — only within it.

---

## 4. Release-readiness checklist

| Item | State |
| --- | --- |
| Build, tests, lint, format | ✅ all green |
| Privacy boundary (ICS URL, join tokens, DWM pixels) | ✅ verified in code and tests |
| Network policy (HTTPS-only, no creds, no redirects, allowlisted join hosts) | ✅ |
| Bounded parsing (size, lines, properties, events, parse time) | ✅ |
| Local storage schema versioning + backup + destructive-delete path | ✅ |
| LICENSE / third-party notices | ❌ missing (S1-3) |
| CI pipeline | ❌ missing (S1-3) |
| Version visible in product | ❌ missing (S2-9) |
| Code signing | ❌ known, documented |
| Autostart / tray / updater | ❌ known non-goals — see §5 |
| Diagnostics spike removed from shipping build | ❌ (S1-2) |
| Window manifest matches runtime geometry | ❌ (S1-4) |
| Non-English Windows behaviour documented | ❌ (S2-2) |
| Installer upgrade/uninstall lifecycle revalidated | ⚠️ explicitly not revalidated since beta.4 |

Suggested minimum before calling a build "final": S1-1 through S1-4, plus S2-1, S2-2
(documentation at minimum), S2-8, and S2-9.

---

## 5. Nice-to-add features

Ordered by value per unit of risk. Nothing here requires breaking a stable decision
unless noted.

### Tier 1 — the things daily use will ask for first

1. **Snooze on reminders.** `+15 min / +1 h / tonight / tomorrow 09:00` on each due
   card and, if the notification plugin allows, on the toast itself. The single
   biggest Later Inbox gap.
2. **Launch a closed source app.** Turn the disabled icon into a launcher via the
   registered AUMID/shell verb, with an explicit per-source opt-in so the "observer,
   not controller" boundary stays a user choice. Closes S2-3.
3. **Autostart with Windows.** Currently a non-goal, but for a widget whose reminders
   and meeting sound only work while running, it is the difference between a tool and
   a demo. A plain per-user `Run` key or Startup shortcut with an Advanced toggle
   avoids installer-managed autostart entirely.
4. **Hide instead of quit** — a tray icon *or* a "Hide for 1 hour / until next
   meeting" action, plus a confirmation on ×. Pairs with a global hotkey
   (`Win+Alt+A`) to show/focus/hide, which also fixes the keyboard-reachability gap.
5. **12/24-hour preference + a date display.** Closes S2-5 and S3-3.
6. **Dark theme following the Windows app theme**, across all three windows. Closes
   S2-6.
7. **About page** with version, checksum, WebView2 version, log location, and a
   "what's new" link. Closes S2-9.

### Tier 2 — sharpens the core value

8. **Focus / Do Not Disturb session.** One toggle that mutes the meeting sound and
   reminder toasts for 25/50/90 minutes and visibly marks the widget as muted. Fits
   the product's thesis better than almost anything else on this list.
9. **Selectable meeting-start sound and lead time.** Ten candidate sounds are already
   sitting unused in `sounds/`; expose a small picker plus a 1/2/5-minute lead choice
   and a per-sound preview.
10. **Create a reminder from the current meeting.** One click on the calendar card
    pre-fills a Later Inbox item with the subject and a follow-up at the meeting's end
    — a natural bridge between the two features that already exist.
11. **Extend the Today panel** with tomorrow's first event, a free-until-next-meeting
    figure, and a "no meetings left today" state. The occupied-minutes computation is
    already overlap-safe.
12. **Optional calendar panel** and an all-panels-hidden guard, completing M12 (§3.3).
13. **Reset widget position / "bring widget here"** from Advanced, for the
    unplugged-monitor case (S3-2).
14. **Reminder search, filter, and recurrence.** Needed once the list exceeds a screen.
15. **Local export/import of Later Inbox JSON.** Backup without any sync service —
    consistent with the local-first stance.

### Tier 3 — broadening reach

16. **Localized semantic labels** for the top non-English Windows UI languages, or at
    minimum an explicit "unsupported UI language" state instead of `notExposed`
    (S2-2).
17. **Generic ICS provider support in the copy** — Google Calendar and iCloud secret
    ICS URLs already work through the same parser; only the Outlook-specific
    confirmation blocks them (S3-9). Rewording plus a provider dropdown is a small
    change with a large audience effect.
18. **Second calendar source** (still read-only, still Published ICS) for people with
    separate work and personal calendars — the most likely first request after the
    single-source limit is hit.
19. **Snap-to-edge docking** and per-monitor position memory.
20. **Onboarding pass** on first run: a three-step "pick your apps → pick your second
    clock → connect your calendar" flow instead of the current empty widget plus a
    **Set up** chip.

### Explicitly not recommended

Microsoft Graph, OCR, pixel reading, a generalized provider framework, cloud sync, and
message aggregation should all stay out. They are the reason the current privacy story
is credible, and every one of them would cost more trust than it buys capability.

---

## 6. Bottom line

The engineering baseline is release-grade: every gate passes, the privacy and security
boundaries are real and tested, and the layout system is coherent across three presets
plus optional panels. What is missing is the last mile of *product* finish — a licence,
an error surface a user can live with, a version number, removal of the diagnostics
spike, a window manifest that matches reality, and honest documentation of the
English-only limitation. Those seven items, not the code, are what stand between
`0.6.0-beta.5` and a `1.0`.
