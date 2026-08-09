# Milestone 0 evidence: persistent attention-signal probe

## Run context

- Date/time: 2026-08-09, Europe/Kyiv (UTC+03:00).
- Probe: `scripts/windows/inspect-attention-signals.ps1`.
- Behavior: read-only window metadata and Windows UI Automation snapshot.
- Source applications were not focused, clicked, typed into, or otherwise controlled.
- No notification was generated, enabled, retained, dismissed, or required.

## Result

| Source | Signal | Observed value | Origin | Confidence / limitation |
| --- | --- | --- | --- | --- |
| Telegram Desktop 7.0.9 | Application counter | 20; needs attention | Top-level window title trailing count | Medium; exact semantics follow Telegram's badge settings. |
| Telegram Desktop 7.0.9 | Unread chats | 9; needs attention | Application UI Automation label | Medium; wording is localized and app-defined. |
| Microsoft Teams 26198.304.4946.9672 | Activity status | `New activity` | Notification-area UI Automation label | Medium; qualitative, no exact count exposed. |
| New Outlook 1.2026.728.100 | Unread status | `No unread messages`; count 0 | Notification-area UI Automation label | Low; the app mapping and nonzero/localized forms still need validation. |

The probe returned no diagnostics.

While incoming Telegram messages continued, the probe later returned an
application counter of 26. The user independently reported that the visible
taskbar badge showed 25 immediately beforehand. Together with the earlier value
of 20, this confirms that the title-derived counter changes with the rendered
taskbar badge; the one-count difference was a timing race, not a semantic
mismatch.

## Generic taskbar API result

- Microsoft's public taskbar overlay and badge surfaces expose setters for an application's own state, not a getter for another application's numeric badge.
- Generic taskbar UI Automation exposed pinned source identity/AUMID but did not expose Telegram's rendered numeric badge.
- The useful signals were available upstream from source-owned window/accessibility state rather than from a universal taskbar-count property.

## Rust/Tauri/React integration result

Verified on 2026-08-10 using ordinary unpackaged `pnpm tauri dev`:

- The source-specific extraction was ported into a Windows-only Rust adapter.
- Tauri returned application-owned `AttentionSignalSnapshot` DTOs to React.
- React refreshed complete snapshots every two seconds and rendered four
  normalized signals without requiring package identity or creating a toast.
- The first request during application startup returned Win32/UI Automation
  `0x80004005` and no signals. The next request recovered automatically; 15
  consecutive requests then returned four signals with no diagnostics.
- In the same unpackaged run, the older `NotificationChanged` subscription
  still failed with `0x80070490`. This demonstrates that the source-owned path
  is operationally independent of the sparse identity experiment.
- Rust unit tests, strict Clippy, TypeScript compilation, and the Vite production
  build passed.

No message title or body is emitted to native logs. The debug UI deliberately
shows raw application-owned labels because their stability and semantics are
part of the spike.

## Next validation

1. Confirm Telegram's visible taskbar counter matches the probed top-level-window counter.
2. Observe count changes while Telegram is foregrounded, minimized, and hidden to its tray.
3. Produce and clear one Teams activity item and record the qualitative transition.
4. Produce/read one Outlook mail item and determine whether the tray label exposes a count or only a boolean state.
5. Observe long-running CPU use and missed/late updates before choosing a
   production refresh strategy; the two-second debug poll is not a production
   decision.
