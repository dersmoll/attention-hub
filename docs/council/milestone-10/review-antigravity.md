# M10 community-feedback council review — Antigravity

- Reviewer: Antigravity (Gemini 3.7 Flash)
- Brief: [`codex-community-feedback-brief.md`](file:///d:/Work/PetProjects/attention-hub/docs/council/milestone-10/codex-community-feedback-brief.md)
- Verified baseline: public `v0.5.0-beta.1`, commit `1ea5798`
- Inspection scope: read-only verification across [`src/widget-preferences.ts`](file:///d:/Work/PetProjects/attention-hub/src/widget-preferences.ts), [`src/widget-layout.ts`](file:///d:/Work/PetProjects/attention-hub/src/widget-layout.ts), [`src/WidgetView.tsx`](file:///d:/Work/PetProjects/attention-hub/src/WidgetView.tsx), [`src/App.tsx`](file:///d:/Work/PetProjects/attention-hub/src/App.tsx), [`src/App.css`](file:///d:/Work/PetProjects/attention-hub/src/App.css), [`src/LaterInboxView.tsx`](file:///d:/Work/PetProjects/attention-hub/src/LaterInboxView.tsx), [`src-tauri/src/teams_mirror/windows_adapter.rs`](file:///d:/Work/PetProjects/attention-hub/src-tauri/src/teams_mirror/windows_adapter.rs), [`src-tauri/src/attention_signals/windows_adapter.rs`](file:///d:/Work/PetProjects/attention-hub/src-tauri/src/attention_signals/windows_adapter.rs), [`src-tauri/tauri.conf.json`](file:///d:/Work/PetProjects/attention-hub/src-tauri/tauri.conf.json), and [`scripts/test-widget-preferences.mjs`](file:///d:/Work/PetProjects/attention-hub/scripts/test-widget-preferences.mjs). No application code or binaries were modified.

---

## 1. Verdict

**Decision-ready with critical architectural modifications.**

The brief provides a solid, disciplined synthesis of the community feedback. I verified all core claims against the repository:
1. **Fresh defaults**: `DEFAULT_WIDGET_PREFERENCES` unconditionally enables all 6 sources and 5 live mirrors ([`src/widget-preferences.ts:47-59`](file:///d:/Work/PetProjects/attention-hub/src/widget-preferences.ts#L47-L59)).
2. **Opacity clamp**: Hardcoded minimum 85% in [`src/widget-preferences.ts:67-71`](file:///d:/Work/PetProjects/attention-hub/src/widget-preferences.ts#L67-L71) and [`src/App.tsx:538-539`](file:///d:/Work/PetProjects/attention-hub/src/App.tsx#L538-L539).
3. **Taskbar ranking**: `ordered_taskbars_for_source` sorts by preferred window monitor, then primary, with zero attention/badge criteria ([`src-tauri/src/teams_mirror/windows_adapter.rs:840-856`](file:///d:/Work/PetProjects/attention-hub/src-tauri/src/teams_mirror/windows_adapter.rs#L840-L856)).
4. **Outlook matching**: Bounded strictly to `olk.exe` ([`src-tauri/src/attention_signals/windows_adapter.rs:38`](file:///d:/Work/PetProjects/attention-hub/src-tauri/src/attention_signals/windows_adapter.rs#L38) and [`src-tauri/src/teams_mirror/windows_adapter.rs:407`](file:///d:/Work/PetProjects/attention-hub/src-tauri/src/teams_mirror/windows_adapter.rs#L407)).
5. **Geometry coupling**: Rust native DWM window positioning duplicates CSS geometry constants ([`src-tauri/src/teams_mirror/windows_adapter.rs:380-387`](file:///d:/Work/PetProjects/attention-hub/src-tauri/src/teams_mirror/windows_adapter.rs#L380-L387), [`:1311-1358`](file:///d:/Work/PetProjects/attention-hub/src-tauri/src/teams_mirror/windows_adapter.rs#L1311-L1358)), while `tauri.conf.json` enforces a static `80px` height constraint ([`src-tauri/tauri.conf.json:18-22`](file:///d:/Work/PetProjects/attention-hub/src-tauri/tauri.conf.json#L18-L22)).

The **M10A / M10B split** is the right strategy to unblock community UX polish without stalling on dual-monitor repro or Classic Outlook reverse engineering.

However, four specific architectural risks must be resolved in the M10 plan before implementation begins:
- **Migration & Reset decoupling**: Legacy migration fallback must not be conflated with the fresh-install default.
- **Multiple-of-4 DPI scaling for Compact geometry**: Compact layout dimensions must use multiples of 4 to prevent 1px subpixel truncation drift in native DWM thumbnail positioning at 125% and 150% Windows DPI scales.
- **Tauri runtime window constraints & DWM density propagation**: Density switching requires dynamic Tauri window sizing and explicit Rust-side layout awareness.
- **Later Inbox notification copy contradiction**: Rectify the outdated "does not create a Windows notification" helper text.

---

## 2. Adopt

1. **M10-001 Quiet fresh defaults (`monitoredSources: ["teams", "outlook"]`, `liveVisualSources: ["teams"]`)**:
   - Retain all 6 apps in `appOrder` so users can easily toggle Telegram, Slack, Viber, and WhatsApp in Advanced settings.
   - Adopt with explicit migration separation (see §3.1).
2. **M10-006 Expanded Opacity (25–100%)**:
   - Update `normalizeOpacity` to clamp to `[25, 100]`.
   - Include a low-opacity warning when slider < 60% and a "Reset to 100%" button.
   - Maintain solid/opaque treatment for urgent calendar indicators and high-contrast / forced-colors media query integrity.
3. **M10-008 Standalone Gear Glyph**:
   - Replace `.widget-more`'s 48×48 bordered square styling with an unbordered, transparent-surface gear icon.
   - Preserve hit target dimensions (48×48 in Comfortable, 44×44 in Compact), accessible keyboard focus rings (`outline: 3px solid #1d4ed8`), and descriptive `aria-label`.
4. **M10-003 Primary Clock Timezone Override (`primaryTimeZone: null | string`)**:
   - `null` represents `System local (<resolved zone>)`.
   - Stored IANA string overrides primary clock display and the local side of the clock converter only.
   - Keep completely isolated from ICS calendar parsing, calendar urgency countdowns, and Later Inbox timestamps.
5. **M10-007 Quick Reminder Shortcut via Later Inbox (Alternative C1)**:
   - Add a 20×20 bell trigger to the clock zone opening the existing 360×420 Later Inbox window in create mode prefilled to the next 15-minute mark.
   - Reuses existing storage, one-shot due notifications, and running-app lifecycle. No second scheduler or database.
6. **M10-009 Bounded Source Status in Advanced**:
   - Clarify Advanced wording to show which of the 6 fixed catalog sources are Monitored, Visually Mirrored, and Currently Detected.
   - Reject arbitrary taskbar enumeration.
7. **M10B Evidence Gates**:
   - Gate Teams cross-taskbar ranking and Classic Outlook unread parsing behind sanitized evidence probes; keep M10B independent from M10A release.

---

## 3. Modify

### 3.1 Separate "Fresh Defaults", "Legacy Migration Targets", and "Reset Defaults" (Blocking)

In [`src/widget-preferences.ts:123-145`](file:///d:/Work/PetProjects/attention-hub/src/widget-preferences.ts#L123-L145), `normalizeSourceSubset` currently takes a `fallback` parameter which is passed as `DEFAULT_WIDGET_PREFERENCES.monitoredSources`. When migrating pre-v2 legacy preferences where `sourceCatalogVersion !== 2`, if the user previously had the legacy default trio `["teams", "telegram", "outlook"]`, the code mapped it to `fallback`.

If `DEFAULT_WIDGET_PREFERENCES` is simply updated to `["teams", "outlook"]`:
- A legacy user with the default trio would be silently downgraded, losing Telegram.
- Corrupt JSON / uninitialized state would be mixed with intentional upgrade paths.

**Required modification**:
- Define explicit constants:
  - `FRESH_MONITORED_SOURCES: AttentionAppKey[] = ["teams", "outlook"]`
  - `FRESH_LIVE_VISUAL_SOURCES: LiveVisualAppKey[] = ["teams"]`
  - `HISTORICAL_CATALOG_SOURCES: AttentionAppKey[] = ["teams", "telegram", "outlook", "slack", "viber", "whatsapp"]`
- In `normalizeWidgetPreferences(value)`:
  - If `value == null` (fresh install or corrupt JSON reset): use `FRESH_MONITORED_SOURCES` and `FRESH_LIVE_VISUAL_SOURCES`.
  - If `value` is present but `sourceCatalogVersion !== 2` (legacy migration): map the legacy trio `["teams", "telegram", "outlook"]` to `HISTORICAL_CATALOG_SOURCES` to preserve user access to all sources.
  - If `value` is present with `sourceCatalogVersion === 2`: preserve the exact user array.
- In Advanced Settings: Provide "Reset to Quiet Defaults" (Teams + Outlook) alongside a "Select All Sources" button.

### 3.2 Compact Preset Geometry: Enforce Multiples of 4 for Win32/DWM Integer Scaling (Blocking for A2)

In [`src-tauri/src/teams_mirror/windows_adapter.rs:1320-1333`](file:///d:/Work/PetProjects/attention-hub/src-tauri/src/teams_mirror/windows_adapter.rs#L1320-L1333), native DWM destination window rects are computed using integer arithmetic:
$$\text{scale}(v) = \lfloor (v \times \text{dpi}) / 96 \rfloor$$

At **125% DPI scale** ($\text{dpi} = 120$), $\text{scale}(v) = \lfloor v \times 5 / 4 \rfloor$.
If any logical dimension or stride is not an exact multiple of 4, integer division truncates the fractional half-pixel:
- A $6\text{ px}$ gap becomes $\lfloor 6 \times 1.25 \rfloor = 7\text{ px}$ (instead of $7.5\text{ px}$).
- A $10\text{ px}$ padding becomes $\lfloor 10 \times 1.25 \rfloor = 12\text{ px}$ (instead of $12.5\text{ px}$).
- Over multiple slots, the native DWM mirror shifts $1\text{ to }2\text{ px}$ out of alignment with the CSS border ring.

**Required modification — All Compact constants must be multiples of 4**:
- **Window Height**: $68\text{ px}$ ($\times 1.25 \to 85\text{ px}$ exact)
- **Zone Height**: $60\text{ px}$ ($\times 1.25 \to 75\text{ px}$ exact)
- **App & Control Hit Targets**: $44 \times 44\text{ px}$ ($\times 1.25 \to 55\text{ px}$ exact; satisfies pointer target accessibility)
- **Native DWM Mirror Size**: $36 \times 36\text{ px}$ ($\times 1.25 \to 45\text{ px}$ exact)
- **Mirror Inset**: $4\text{ px}$ ($36 + 2 \times 4 = 44\text{ px}$ exact center alignment)
- **App Slot Gap**: $4\text{ px}$ (Stride $44 + 4 = 48\text{ px} \times 1.25 \to 60\text{ px}$ exact)
- **Left Panel Padding**: $12\text{ px}$ ($\times 1.25 \to 15\text{ px}$ exact; total left padding $24\text{ px}$)
- **Icon Top Offset**: $12\text{ px}$ ($(68 - 44)/2 = 12\text{ px} \times 1.25 \to 15\text{ px}$ exact)
- **Zone Gap**: $8\text{ px}$ ($\times 1.25 \to 10\text{ px}$ exact)
- **Clock Zone**: $280\text{ px}$, Clock Numerals: $30\text{ px}$
- **Calendar Zone**: $304\text{ px}$ (Single Event / Compact) / $392\text{ px}$ (Current + Next)

**Resulting Exact Target Widths (Compact)**:
- **2 Sources (Teams + Outlook) + Later + Gear (4 slots)**:
  $$\text{Left Panel} = 24 + 4 \times 44 + 3 \times 4 = 212\text{ px}$$
  $$\text{Total (Single Event)} = 212 + 280 + 304 + (2 \times 8) = \mathbf{812\text{ px}}$$
  $$\text{Total (Dual Event)} = 212 + 280 + 392 + 16 = \mathbf{900\text{ px}}$$
- **6 Sources + Later + Gear (8 slots)**:
  $$\text{Left Panel} = 24 + 8 \times 44 + 7 \times 4 = 404\text{ px}$$
  $$\text{Total (Single Event)} = 404 + 280 + 304 + 16 = \mathbf{1004\text{ px}}$$
  $$\text{Total (Dual Event)} = 404 + 280 + 392 + 16 = \mathbf{1092\text{ px}}$$
- **0 Sources + Later + Gear (2 slots)**:
  $$\text{Left Panel} = 24 + 2 \times 44 + 1 \times 4 = 116\text{ px}$$
  $$\text{Total (Single Event)} = 116 + 280 + 304 + 16 = \mathbf{716\text{ px}}$$

### 3.3 Dynamic Tauri Window Constraints & Rust Mirror Layout Synchronization

1. In [`src-tauri/tauri.conf.json:18-22`](file:///d:/Work/PetProjects/attention-hub/src-tauri/tauri.conf.json#L18-L22), `minHeight: 80, maxHeight: 80, minWidth: 744, maxWidth: 1208` are hardcoded.
   - Switching to Compact density ($68\text{ px}$ height, width starting at $716\text{ px}$) will be blocked or clipped by Tauri window manager constraints.
   - Modify `tauri.conf.json` static bounds to `minHeight: 68, maxHeight: 80, minWidth: 716, maxWidth: 1208`.
   - When updating window size in [`src/WidgetView.tsx:769`](file:///d:/Work/PetProjects/attention-hub/src/WidgetView.tsx#L769), compute height dynamically from density (`density === "compact" ? 68 : 80`).
2. Rust DWM mirror thread must receive density or layout metrics via `set_fixed_taskbar_mirror_layout` so `position_widget_destination` switches between Comfortable and Compact offset/size constants.

### 3.4 Later Inbox Due Notification Copy Alignment

In [`src/LaterInboxView.tsx:540-543`](file:///d:/Work/PetProjects/attention-hub/src/LaterInboxView.tsx#L540-L543), the text currently claims:
`"Follow-up time changes sorting and due styling only. It does not create a Windows notification."`

This directly contradicts M9's `dueNotificationsEnabled` feature in [`src/WidgetView.tsx:617-663`](file:///d:/Work/PetProjects/attention-hub/src/WidgetView.tsx#L617-L663).
Update this copy to dynamically track preferences:
- When enabled: `"Follow-up time will trigger a Windows notification at due time while Attention Hub is running."`
- When disabled: `"Follow-up time changes sorting and styling. Enable due notifications in Later Inbox settings to receive alerts while Attention Hub is running."`

### 3.5 Primary Timezone Converter Coupling

In [`src/WidgetView.tsx:1035-1049`](file:///d:/Work/PetProjects/attention-hub/src/WidgetView.tsx#L1035-L1049), the time converter uses the system resolved timezone as the "Local" endpoint.
When `primaryTimeZone` is overridden, the converter's primary endpoint must use that same overridden timezone so that converting between the primary clock and secondary clock produces results consistent with the clock display directly above it.

---

## 4. Reject / Defer

1. **Continuous Mouse Drag Resize (Alternative A3)** — **REJECT for M10**:
   - High risk. Continuous resizing causes subpixel rounding jitter during live dragging, IPC flooding across Tauri/Win32 bounds, and live DWM HWND repositioning artifacts. Two discrete, tested presets (Comfortable + Compact) solve the physical footprint complaints cleanly.
2. **Arbitrary Taskbar App Enumeration / Pinning (M10-009 wide form)** — **REJECT**:
   - Violates the non-negotiable fixed-catalog baseline. Introduces private window title leakage into UI state, unpredictable UIA hierarchies, and unbounded process tracking.
3. **Dedicated Timezone Popover Window (Alternative B3)** and **Inline Reminder Editor / Dedicated Reminder Window (Alternatives C2, C3)** — **DEFER**:
   - Avoids creating new window lifecycles, focus-return traps, and duplicated validation forms. B2 and C1 leverage existing proven infrastructure.
4. **Classic Outlook Unread Parsing without Validated Probe** — **REJECT for unverified release**:
   - Classic Outlook (`outlook.exe`) uses Win32 legacy controls whose UIA tree differs fundamentally from `olk.exe`. Gate semantic unread parsing strictly behind the sanitized probe.
5. **DWM Pixel Inspection, OCR, or Screenshot Badge Parsing** — **REJECT**:
   - Explicitly forbidden by baseline architecture and privacy invariants.

---

## 5. Defect Analysis

### 5.1 Teams Dual-Taskbar Mirroring (M10-002)

- **Root Cause Confirmed**:
  In [`src-tauri/src/teams_mirror/windows_adapter.rs:840-856`](file:///d:/Work/PetProjects/attention-hub/src-tauri/src/teams_mirror/windows_adapter.rs#L840-L856), `ordered_taskbars_for_source` sorts taskbars by:
  1. Monitor containing the active/usable Teams window (`preferred_source_window`)
  2. Primary monitor
  3. Secondary monitors
  `select_taskbar_for_source` ([`:781-838`](file:///d:/Work/PetProjects/attention-hub/src-tauri/src/teams_mirror/windows_adapter.rs#L781-L838)) picks the **first** surface with an unambiguous Teams button.
  When Teams is displayed on Monitor 2, but Windows 11 only renders the badge overlay on the primary taskbar (or vice versa), the adapter selects Monitor 2 without evaluating badge state, mirroring an unbadged or generic dot button.

- **Non-Pixel UIA Candidate Signal**:
  In Windows 10/11, `discover_taskbar_button` queries `IUIAutomationElement::CurrentName`. When an overlay icon/badge is active, Windows often updates the accessibility `Name` (e.g., `"Microsoft Teams - 2 unread chats"` vs `"Microsoft Teams"`).
  - **Sanitized Probe Action**: Test on the colleague's machine whether `button.CurrentName()` or `CurrentItemStatus()` contains a numeric badge indicator. Record boolean facts only (`has_digit_in_name: bool`, `name_length: usize`).
  - **Deterministic Fallback**: If UIA properties are identical between displays or localized unpredictably, implement a user-facing setting in Advanced:
    `Teams Taskbar Surface: Automatic (default) | Display 1 (Primary) | Display 2`.
    This allows immediate user control without guessing or inspecting DWM pixels.

### 5.2 Classic Outlook Integration (M10-004)

- **Capability Decomposition**:
  1. **Presence**: Safe to include immediately. Add `"outlook.exe"` to process detection in [`src-tauri/src/attention_signals/windows_adapter.rs`](file:///d:/Work/PetProjects/attention-hub/src-tauri/src/attention_signals/windows_adapter.rs).
  2. **Activation**: Safe to include with window filtering. Classic Outlook creates auxiliary dialogs (`#32770`), reminder windows, and main windows (`rctrl_renwnd32`). The window enumerator in [`src-tauri/src/teams_mirror/windows_adapter.rs`](file:///d:/Work/PetProjects/attention-hub/src-tauri/src/teams_mirror/windows_adapter.rs) must target the main top-level window class and avoid activating minimized background stubs.
  3. **Unread Semantics**: Must report `state: NotExposed` until a sanitized UIA probe confirms the exact folder tree automation contract on Classic Outlook.
  4. **Coexistence Precedence**: When both `olk.exe` and `outlook.exe` are running simultaneously, prioritize `olk.exe` (New Outlook) for unread parsing, and log the presence of both in diagnostics.

---

## 6. UI Alternatives Selection

```
+---------------------------------------------------------------------------------------------------+
| Component         | Selection          | Key Dimensions / Parameters                              |
+---------------------------------------------------------------------------------------------------+
| A. Footprint      | A2 (Comfortable &  | Compact: 68px window, 60px zone, 44px hit targets,      |
|                   | Compact Presets)   | 36px mirror (4px inset), 4px app gap, 12px padding.      |
|                   |                    | Widths: 812px (2-app single) / 1092px (6-app dual).     |
+---------------------------------------------------------------------------------------------------+
| B. Timezone       | B2 (Compact Widget | 20x20 globe icon beside Local label; quick native select |
|                   | Select + Advanced) | (System + curated zones); full validated picker in Adv.  |
+---------------------------------------------------------------------------------------------------+
| C. Reminder Entry | C1 (Later Inbox    | 20x20 bell in clock zone; opens 360x420 Later Inbox in   |
|                   | Create Focus)      | create mode with next quarter-hour prefilled.            |
+---------------------------------------------------------------------------------------------------+
```

---

## 7. Missing Acceptance Evidence

In addition to the brief's automated and manual checks, the following evidence items must be required:

1. **Legacy Migration Trio Invariant Test**:
   - A unit test asserting that an unversioned legacy configuration with `["teams", "telegram", "outlook"]` migrates to all 6 historical sources (`HISTORICAL_CATALOG_SOURCES`), while a `null` / fresh configuration normalizes to `["teams", "outlook"]`.
2. **DPI Multiple-of-4 Arithmetic Assertions**:
   - Automated unit test verifying that every Compact and Comfortable layout constant (sizes, insets, gaps, paddings, top offsets, strides) is evenly divisible by 4.
3. **Runtime Density Transition Validation**:
   - Verification that switching between Comfortable and Compact in Advanced settings immediately updates the Tauri window size (`LogicalSize`), updates min/max bounds, and repositions native DWM mirror HWNDs without requiring an application restart.
4. **Timezone Converter Parity Test**:
   - Unit test ensuring that when `primaryTimeZone` is overridden (e.g., to `"Asia/Tokyo"`), the converter's local endpoint uses Tokyo time rather than machine local time, and handles DST transition boundaries truthfully.
5. **Later Inbox Prefill & Notification Copy Smoke Check**:
   - Verification that clicking the clock bell opens Later Inbox with a properly rounded future timestamp (e.g. 10:02 $\to$ 10:15; 23:55 $\to$ 00:00 next day) and that helper text accurately reflects `dueNotificationsEnabled`.
6. **Classic & New Outlook Side-by-Side Verification**:
   - Manual test with both `olk.exe` and `outlook.exe` running simultaneously to verify deterministic precedence, activation, and diagnostic logging.

---

## 8. Unresolved Questions for the User

1. **Reset Source Defaults Behavior**:
   When clicking "Reset source defaults" in Advanced Settings, should it reset to the new **Quiet Default** (`teams` + `outlook` — recommended, accompanied by an "Enable all 6 sources" button) or restore the **Historical 6-source set**?
2. **Dual-Outlook Process Priority**:
   When both New Outlook (`olk.exe`) and Classic Outlook (`outlook.exe`) are running concurrently, should New Outlook take precedence for unread signal capture and activation (recommended), or should the user configure an explicit preference?
3. **Compact Density Default for Fresh Installs**:
   Should fresh installations immediately default to **Compact Density** once screenshot acceptance passes (as proposed in the brief), or should M10 ship with **Comfortable Density** as the default and offer Compact as an opt-in preset for one beta milestone?
4. **Low-Opacity Warning Threshold**:
   Is **60% opacity** the agreed threshold below which the UI displays the readability warning notice?
