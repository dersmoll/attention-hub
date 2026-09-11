import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { compileAppStyles } from "./app-styles.mjs";

const sourceUrl = new URL("../src/widget-layout.ts", import.meta.url);
const sourceText = await readFile(sourceUrl, "utf8");
const slimStyleSource = await readFile(
  new URL("../src/styles/_widget-slim.scss", import.meta.url),
  "utf8",
);
const standardStyleSource = await readFile(
  new URL("../src/styles/_widget-standard.scss", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(sourceText, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourceUrl.pathname,
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const layout = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`
);

assert.equal(layout.widgetHeight("recommended"), 48);
assert.equal(layout.widgetHeight("slim"), 38);
assert.equal(layout.CALENDAR_DAY_PANEL_ROW_HEIGHT, 216);
assert.equal(layout.CALENDAR_DAY_PANEL_WINDOW_EXTRA_HEIGHT, 224);
assert.equal(layout.calendarDayPanelHeight(1), 76);
assert.equal(layout.calendarDayPanelHeight(8), 230);
assert.equal(layout.calendarDayPanelHeight(24), 582);
assert.equal(layout.calendarDayPanelHeight(99), 582);
assert.equal(layout.calendarDayPanelWindowExtraHeight(8), 235);
assert.equal(layout.calendarDayPanelDirection(40, 68, 0, 1080), "below");
assert.equal(layout.calendarDayPanelDirection(980, 68, 0, 1080), "above");
assert.equal(layout.calendarDayPanelPhysicalOffset(1), 216);
assert.equal(layout.calendarDayPanelPhysicalOffset(1.25), 270);
assert.equal(layout.calendarDayPanelPhysicalOffset(1.5), 324);
assert.equal(layout.calendarDayPanelPhysicalOffset(1.25, 248), 310);
assert.equal(layout.widgetClockWidth("recommended"), 126);
assert.equal(layout.widgetClockWidth("slim"), 160);
assert.equal(layout.widgetClockPanelWidth("recommended", 1, "horizontal"), 72);
assert.equal(layout.widgetClockPanelWidth("recommended", 1, "vertical"), 72);
assert.equal(layout.widgetClockPanelWidth("slim", 1, "horizontal"), 84);
assert.equal(layout.widgetClockPanelWidth("slim", 1, "vertical"), 84);
assert.equal(layout.widgetClockPanelWidth("recommended", 5, "horizontal"), 324);
assert.equal(layout.widgetClockPanelWidth("recommended", 5, "vertical"), 135);
assert.equal(layout.widgetClockPanelWidth("slim", 5, "horizontal"), 404);
assert.equal(layout.widgetClockPanelWidth("slim", 5, "vertical"), 404);
assert.equal(layout.widgetClockPanelWidth("recommended", 5, "timeFocus"), 240);
assert.equal(layout.widgetClockPanelWidth("slim", 5, "timeFocus"), 192);
assert.equal(layout.widgetZoneGap("recommended"), 0);
assert.equal(layout.widgetZoneGap("slim"), 0);

assert.equal(layout.widgetLeftWidth(0), 16);
assert.equal(layout.widgetLeftWidth(1), 46);
assert.equal(layout.widgetLeftWidth(2), 78);
assert.equal(layout.widgetLeftWidth(3), 110);
assert.equal(layout.widgetLeftWidth(6), 206);
assert.equal(layout.widgetLeftWidth(7), 238);
assert.equal(layout.widgetLeftWidth(0, "recommended"), 16);
assert.equal(layout.widgetLeftWidth(2, "recommended"), 78);
assert.equal(layout.widgetLeftWidth(6, "recommended"), 206);
assert.equal(layout.widgetLeftWidth(7, "recommended"), 238);
assert.equal(layout.widgetLeftWidth(0, "slim"), 0);
assert.equal(layout.widgetLeftWidth(2, "slim"), 64);
assert.equal(layout.widgetLeftWidth(6, "slim"), 192);
assert.equal(layout.widgetLeftWidth(7, "slim"), 224);
assert.equal(layout.widgetCalendarWidth("recommended", false), 220);
assert.equal(layout.widgetCalendarWidth("recommended", true), 340);
assert.equal(layout.widgetCalendarWidth("slim", false), 260);
assert.equal(layout.widgetCalendarWidth("slim", true), 440);
assert.equal(layout.widgetCalendarWidth("slim", false, 68), 420);
assert.equal(layout.widgetCalendarWidth("slim", false, 200), 600);
assert.equal(layout.widgetCalendarWidth("slim", true, 100), 536);
assert.equal(layout.widgetCalendarWidth("slim", true, 200), 800);
assert.equal(layout.widgetCalendarWidth("recommended", false, 0, 444), 444);
assert.equal(layout.widgetCalendarWidth("recommended", true, 0, 300), 340);
assert.equal(layout.widgetCalendarWidth("slim", false, 200, 460), 460);
assert.equal(layout.todayPopupHeight(0, 0), 76);
assert.equal(layout.todayPopupHeight(0, 0, 1), 136);
assert.equal(layout.todayPopupHeight(2, 0, 3), 218);
assert.equal(layout.todayPopupHeight(2, 0, 99), 368);
assert.equal(layout.todayPopupHeight(0, 1, 0), 136);
assert.equal(layout.todayPopupHeight(0, 8, 0), 346);
// Eight doses plus the overflow link; crossing the bound must grow the window.
assert.equal(layout.todayPopupHeight(0, 9, 0), 376);
assert.equal(layout.todayPopupHeight(0, 99, 0), 376);
assert.equal(layout.todayPopupHeight(0, 9, 1), 436);
assert.equal(layout.todayPopupHeight(0, 0, 0, true), 100);
assert.equal(layout.todayPopupHeight(0, 0, 0, false, true), 136);
assert.equal(layout.todayPopupHeight(0, 1, 0, false, true), 166);
assert.equal(layout.TODAY_POPUP_MIN_WIDTH, 300);
assert.equal(layout.todayPopupWidth(220), 300);
assert.equal(layout.todayPopupWidth(300), 300);
assert.equal(layout.todayPopupWidth(419.6), 420);
assert.equal(layout.todayPopupWidth(Number.NaN), 300);
assert.equal(layout.widgetUtilityWidth("recommended"), 20);
assert.equal(layout.widgetUtilityWidth("slim"), 50);
assert.equal(layout.widgetDestinationsWidth("recommended"), 48);
assert.equal(layout.widgetDestinationsWidth("slim"), 66);
assert.equal(layout.widgetDestinationsWidth("recommended", true, false), 24);
assert.equal(layout.widgetDestinationsWidth("recommended", false, true), 24);
assert.equal(layout.widgetDestinationsWidth("slim", true, false), 33);
assert.equal(layout.widgetDestinationsWidth("recommended", false, false), 0);

// M19 destination segment. The medicine segment is opt-in and defaults off, so
// every pre-M19 caller signature must keep its exact width.
assert.equal(layout.widgetDestinationsWidth("recommended", true, true), 48);
assert.equal(layout.widgetDestinationsWidth("recommended", true, true, false), 48);
assert.equal(layout.widgetDestinationsWidth("slim", true, true), 66);
assert.equal(layout.widgetDestinationsWidth("slim", true, true, false), 66);
assert.equal(layout.widgetDestinationsWidth("slim", true, false), 33);
assert.equal(layout.widgetDestinationsWidth("slim", false, true), 33);
// Compact is a flat 33 px per visible segment, so one and two are unchanged
// and three is exactly 99 px.
assert.equal(layout.widgetDestinationsWidth("slim", false, false, true), 33);
assert.equal(layout.widgetDestinationsWidth("slim", true, false, true), 66);
assert.equal(layout.widgetDestinationsWidth("slim", true, true, true), 99);
// Recommended uses one shared 24 px width for every icon destination.
assert.equal(layout.widgetDestinationsWidth("recommended", false, false, true), 24);
assert.equal(layout.widgetDestinationsWidth("recommended", true, false, true), 48);
assert.equal(layout.widgetDestinationsWidth("recommended", false, true, true), 48);
assert.equal(layout.widgetDestinationsWidth("recommended", true, true, true), 72);
// Enabling the segment must widen the widget by exactly the segment width and
// disabling it must restore the previous width.
for (const [mode, delta] of [["recommended", 24], ["slim", 33]]) {
  const without = layout.widgetWidth(2, mode, false, 2, "horizontal", true, true, 0, null, true, true, true);
  const withMedicine = layout.widgetWidth(2, mode, false, 2, "horizontal", true, true, 0, null, true, true, true, true);
  assert.equal(withMedicine - without, delta);
}
assert.equal(layout.widgetFixedWidth(2, "recommended"), 299);
assert.equal(layout.widgetFixedWidth(2, "slim"), 362);
assert.equal(layout.widgetWidth(0, "recommended"), 441);
assert.equal(layout.widgetWidth(2, "recommended"), 519);
assert.equal(layout.widgetWidth(6, "recommended"), 647);
assert.equal(layout.widgetWidth(0, "recommended", true), 561);
assert.equal(layout.widgetWidth(2, "recommended", true), 639);
assert.equal(layout.widgetWidth(6, "recommended", true), 767);
assert.equal(layout.widgetWidth(2), 519);
assert.equal(layout.widgetWidth(2, "recommended", false, 5, "horizontal"), 708);
assert.equal(layout.widgetWidth(2, "recommended", false, 5, "vertical"), 519);
assert.equal(layout.widgetWidth(2, "slim"), 622);
assert.equal(layout.widgetWidth(2, "slim", true), 802);
assert.equal(layout.widgetWidth(2, "slim", false, 5, "horizontal"), 862);
assert.equal(layout.widgetWidth(2, "slim", false, 5, "vertical"), 862);
assert.equal(
  layout.widgetWidth(2, "recommended", false, 2, "horizontal", false, true),
  441,
);
assert.equal(
  layout.widgetWidth(2, "recommended", false, 2, "horizontal", true, false),
  384,
);
assert.equal(
  layout.widgetWidth(2, "recommended", false, 2, "horizontal", false, false),
  306,
);
assert.equal(
  layout.widgetWidth(2, "slim", false, 2, "horizontal", false, false),
  394,
);
assert.equal(
  layout.widgetWidth(2, "slim", false, 2, "horizontal", true, true, 68),
  782,
);
assert.equal(
  layout.widgetWidth(2, "recommended", false, 2, "horizontal", true, true, 0, 444),
  743,
);
assert.equal(
  layout.widgetWidth(
    2,
    "recommended",
    false,
    1,
    "timeFocus",
    true,
    true,
    0,
    null,
    false,
    false,
    false,
  ),
  356,
);

assert.equal(
  layout.widgetDestinationsWidth("recommended", true, true, true),
  72,
);
assert.equal(
  layout.widgetDestinationsWidth("slim", true, true, true),
  99,
);

const [
  appSource,
  widgetSource,
  todayPopupSource,
  eventWorkspaceActionsSource,
  todayPopupWindowSource,
  styleEntrySource,
  tauriConfigSource,
  capabilitiesSource,
  rustSource,
] = await Promise.all([
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/WidgetView.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/TodayPopupView.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/EventWorkspaceActions.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/today-popup-window.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/App.scss", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8"),
]);
assert.match(appSource, /value="slim">Compact single-line/);
assert.doesNotMatch(appSource, /option value="larger"/);
assert.match(appSource, /import "\.\/App\.scss"/);
const cssSource = compileAppStyles();
assert.match(styleEntrySource, /@use "styles\/base"/);
assert.match(appSource, /<legend>Appearance<\/legend>/);
assert.match(appSource, /Keep Attention Hub above other windows/);
assert.match(appSource, /widget-preference-card widget-visible-panels/);
assert.match(appSource, /Show app shortcuts/);
assert.match(appSource, /Show clocks/);
assert.match(appSource, /Show secondary clock/);
assert.match(appSource, /showSecondaryClock: event\.target\.checked/);
assert.match(appSource, /htmlFor="meeting-start-sound">Reminder sound/);
assert.match(appSource, /MEETING_START_SOUND_OPTIONS\.map/);
assert.match(
  appSource,
  /invoke\("play_meeting_start_sound", \{\s*sound: widgetPreferences\.meetingStartSound/,
);
assert.match(
  widgetSource,
  /invoke\("play_meeting_start_sound", \{\s*sound: preferences\.meetingStartSound/,
);
assert.match(
  cssSource,
  /calendar-attention-settings__sound-controls \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;/,
);
const tauriConfig = JSON.parse(tauriConfigSource);
assert.deepEqual(tauriConfig.bundle.resources, {
  "../sounds/meeting-start.wav": "sounds/meeting-start.wav",
  "../sounds/new/game-bonus.wav": "sounds/reminders/game-bonus.wav",
  "../sounds/new/laughing-sound.wav": "sounds/reminders/laugh.wav",
  "../sounds/new/school-bell.wav": "sounds/reminders/school-bell.wav",
  "../sounds/new/sound-effect-thriller.wav":
    "sounds/reminders/thriller.wav",
  "../sounds/new/surprise-sound-effect.wav":
    "sounds/reminders/surprise.wav",
  "../sounds/new/wistle.wav": "sounds/reminders/whistle.wav",
});
assert.match(rustSource, /enum MeetingStartSound/);
assert.match(rustSource, /fn resource_path\(self\)/);
assert.match(widgetSource, /\{appsPanelVisible && \(/);
assert.match(widgetSource, /\{clocksPanelVisible && \(/);
assert.match(widgetSource, /className="widget-drag-handle"/);
assert.match(widgetSource, /className="widget-resize-edge"/);
assert.match(widgetSource, /startResizeDragging\(direction\)/);
assert.match(widgetSource, /WIDGET_HEIGHT_SNAP_THRESHOLD/);
assert.match(widgetSource, /Reset width to automatic/);
assert.doesNotMatch(
  widgetSource,
  /className="widget-shell"\s+data-tauri-drag-region/,
);
assert.match(widgetSource, /onPointerDownCapture=\{\(event\) => \{/);
assert.match(widgetSource, /reposition_taskbar_mirrors/);
assert.match(widgetSource, /set_taskbar_mirror_layout/);
assert.match(widgetSource, /getBoundingClientRect\(\)/);
assert.match(widgetSource, /new ResizeObserver\(updateLayout\)/);
assert.match(widgetSource, /VITE_ATTENTION_HUB_TEST_VISUAL_SOURCE/);
assert.doesNotMatch(widgetSource, /set_fixed_taskbar_mirror_layout/);
assert.match(widgetSource, /Menu\.new\(\{ items \}\)/);
assert.match(widgetSource, /onContextMenu=\{handleWidgetContextMenu\}/);
assert.match(widgetSource, /text: "Size preset"/);
assert.doesNotMatch(widgetSource, /text: "Larger"/);
assert.match(widgetSource, /text: "Visible panels"/);
assert.match(widgetSource, /text: "Show Today"/);
assert.match(widgetSource, /text: "Show To-dos"/);
assert.match(widgetSource, /text: "Open Project Hub"/);
assert.match(widgetSource, /text: "Appearance"/);
assert.match(widgetSource, /text: "Keep above other windows"/);
assert.match(widgetSource, /text: "App shortcuts"/);
assert.match(widgetSource, /get_zoom_meeting_snapshot/);
assert.match(widgetSource, /activate_zoom_meeting/);
assert.match(widgetSource, /data-source="zoom"/);
assert.match(widgetSource, /text: "Clock layout"/);
assert.match(widgetSource, /text: "Time Focus"/);
assert.match(widgetSource, /const timeFocusMode = preferences\.clockLayout === "timeFocus"/);
assert.match(widgetSource, /calendarPanelVisible && <section/);
assert.match(widgetSource, /className="widget-clock__focus"/);
assert.equal(
  widgetSource.match(/className="widget-clock__seconds"/g)?.length,
  2,
  "Seconds should render only in the primary clock and its Time Focus variant",
);
assert.match(widgetSource, /import\.meta\.env\.DEV/);
assert.match(widgetSource, /text: "Inspect"/);
assert.match(widgetSource, /invoke\("open_main_panel_devtools"\)/);
assert.match(widgetSource, /function formatClockDay\(now: Date, timeZone\?: string\)/);
assert.match(widgetSource, /function MeetingProviderGlyph\(/);
assert.match(widgetSource, /data-meeting-provider=\{provider\}/);
assert.match(widgetSource, /provider === "teams"/);
assert.doesNotMatch(widgetSource, /provider === "googleMeet"/);
assert.match(widgetSource, /className="widget-clock__day"/);
assert.match(widgetSource, /className="widget-clock-converter__close"/);
assert.match(
  widgetSource,
  /data-clock-conversion-source=\{clockConversionSource \?\? undefined\}/,
);
assert.doesNotMatch(widgetSource, /widget-clock__offset/);
assert.match(widgetSource, /await existing\.unminimize\(\)/);
assert.match(widgetSource, /\? calendarDayPanelOpen/);
assert.match(widgetSource, /data-day-summary=\{workCalendar\?\.configured \|\| undefined\}/);
assert.match(widgetSource, /!workCalendar\?\.configured \|\|/);
assert.match(widgetSource, /createTodayPopupWindow\(/);
assert.doesNotMatch(widgetSource, /calendarDayPanelOffsetLogicalHeight/);
assert.match(todayPopupSource, /className="today-popup-shell widget-calendar-day-panel"/);
assert.match(widgetSource, /width: todayPopupWidth\(/);
assert.match(cssSource, /\.today-popup-shell \{\s*min-width: 300px;/);
assert.match(todayPopupWindowSource, /new WebviewWindow\(TODAY_POPUP_WINDOW_LABEL/);
assert.match(capabilitiesSource, /"today"/);
assert.doesNotMatch(rustSource, /transition_widget_panel_at_upper_edge/);
assert.match(rustSource, /fn open_main_panel_devtools\(window: tauri::WebviewWindow\)/);
assert.match(rustSource, /window\.open_devtools\(\)/);
assert.match(rustSource, /fn set_taskbar_mirror_layout\(/);
assert.doesNotMatch(rustSource, /set_fixed_taskbar_mirror_layout/);
assert.match(widgetSource, /event\.key !== "Enter" && event\.key !== " "/);
assert.match(widgetSource, /WIDGET_NOTICE_MS = 4_500/);
assert.doesNotMatch(widgetSource, /findSignal\(telegram, "unreadChats"\)/);
assert.match(widgetSource, /badgeTone="neutral"/);
assert.match(widgetSource, /data-tone=\{badgeTone\}/);
assert.match(appSource, /getVersion\(\)/);
assert.doesNotMatch(appSource, /get_notification_snapshot/);
assert.doesNotMatch(appSource, /start_notification_listener/);
assert.doesNotMatch(rustSource, /get_notification_snapshot/);
assert.doesNotMatch(rustSource, /start_notification_listener/);
const mainWindow = tauriConfig.app.windows.find(({ label }) => label === "main");
assert.equal(mainWindow.visible, false);
assert.equal(mainWindow.width, 548);
assert.equal(mainWindow.height, 60);
assert.equal(mainWindow.resizable, true);
assert.match(capabilitiesSource, /allow-start-resize-dragging/);
assert.match(capabilitiesSource, /allow-set-size-constraints/);
assert.ok(
  widgetSource.indexOf('className="widget-close-control"') <
    widgetSource.indexOf('className="widget-pin-control"'),
  "Close must be the first utility control",
);
assert.match(widgetSource, /Pin Attention Hub always on top/);
assert.doesNotMatch(widgetSource, /className="widget-reminder-control"/);
assert.match(cssSource, /data-width-mode="slim"/);
assert.match(cssSource, /\.widget-clock__day \{\s*display: none;/);
assert.match(
  cssSource,
  /data-width-mode="recommended"\][\s\S]*?\.widget-clock__day \{\s*display: block;/,
);
assert.match(cssSource, /grid-template-columns: minmax\(0, 1fr\) auto;/);
assert.match(cssSource, /\.widget-shell\[data-width-mode="slim"\] \.widget-clock time \{\s*font-size: 20px/);
assert.match(cssSource, /widget-clock-picker-filter/);
assert.match(cssSource, /\.widget-clock-converter__close \{\s*position: absolute;/);
assert.match(cssSource, /data-clock-conversion-source="secondary"/);
assert.match(cssSource, /data-clock-layout="timeFocus"/);
assert.match(cssSource, /font-size: 49px/);
assert.match(cssSource, /font-size: 28px/);
assert.match(cssSource, /--widget-slim-control-size: 16px/);
assert.match(
  cssSource,
  /grid-template-columns: repeat\(3, var\(--widget-slim-control-size\)\)/,
);
assert.match(cssSource, /grid-template-columns: minmax\(0, 1fr\)/);
assert.match(cssSource, /grid-template-rows: repeat\(3, minmax\(0, 1fr\)\)/);
assert.match(widgetSource, /className="widget-destinations widget-zone"/);
assert.match(widgetSource, /data-first-zone=/);
assert.match(widgetSource, /data-calendar-selection=/);
assert.match(widgetSource, /data-clock-count=\{visibleClockCount\}/);
assert.match(widgetSource, /preferences\.showSecondaryClock && <div data-tauri-drag-region>/);
assert.match(widgetSource, /className="widget-calendar__health"/);
assert.match(widgetSource, /data-calendar-health=\{calendarHealthNotice\?\.tone\}/);
assert.match(
  widgetSource,
  /data-calendar-health-cached=\{\s*calendarHealthNotice && calendarSelection \? true : undefined\s*\}/,
);
assert.match(widgetSource, /data-calendar-health-only=\{calendarHealthOnly \|\| undefined\}/);
assert.match(widgetSource, /workCalendarCheckSlow && !calendarSelection/);
assert.match(widgetSource, /workCalendarRefreshing && !calendarSelection/);
assert.match(widgetSource, /readWorkCalendarDisplayCache/);
assert.match(widgetSource, /writeWorkCalendarDisplayCache\(snapshot\)/);
assert.match(widgetSource, /data-calendar-retrying=\{calendarAwaitingFirstSync \|\| undefined\}/);
assert.match(widgetSource, /calendarRecoveringWithoutSelection && !calendarRetryNotice/);
assert.doesNotMatch(widgetSource, /tone: "error" as const/);
assert.match(slimStyleSource, /&\[data-first-zone="apps"\] > \.widget-left/);
assert.match(widgetSource, /aria-label="Open Today"/);
assert.match(widgetSource, /className="widget-destinations__todos"/);
assert.doesNotMatch(widgetSource, /widget-destinations__projects/);
assert.match(widgetSource, /openManagerWindow\("todos"\)/);
assert.doesNotMatch(widgetSource, />Today<|>TODO<|>Meds</);
for (const icon of ["📅", "✅", "💊"]) {
  assert.match(widgetSource, new RegExp(`className="widget-destinations__emoji">${icon}<\\/span>`));
}
assert.match(cssSource, /font-family: "Segoe UI Emoji", "Apple Color Emoji", sans-serif;/);
assert.match(widgetSource, /events left/);
assert.doesNotMatch(widgetSource, /todo left/);
assert.doesNotMatch(widgetSource, /className="widget-projects-control"/);
assert.match(cssSource, /\.widget-shell\[data-width-mode="slim"\] \.widget-close-control \{\s*order: 3;/);
assert.match(
  standardStyleSource,
  /\.widget-apps \{[\s\S]*?top: 50%;[\s\S]*?left: 8px;[\s\S]*?gap: 2px;[\s\S]*?transform: translateY\(-50%\);/,
);
assert.match(
  standardStyleSource,
  /grid-template-columns: max-content minmax\(72px, 1fr\);\s*grid-template-rows: repeat\(2, minmax\(0, 1fr\)\);/,
);
assert.match(
  standardStyleSource,
  /grid-template-columns: max-content minmax\(72px, 1fr\) 16px;[\s\S]*?> \.widget-calendar__workspace-actions \{[\s\S]*?grid-column: 3;/,
);
assert.match(
  standardStyleSource,
  /&__countdown \{\s*grid-row: 2;\s*grid-column: 1;/,
);
assert.match(
  standardStyleSource,
  /&__metadata \{\s*grid-row: 2;\s*grid-column: 2;/,
);
assert.match(
  standardStyleSource,
  /> div \{[\s\S]*?width: 63px;[\s\S]*?flex: 0 0 63px;[\s\S]*?> div:first-child \{\s*width: 72px;\s*flex-basis: 72px;/,
);
assert.match(
  standardStyleSource,
  /\.widget-utility \{\s*grid-template-rows: repeat\(3, 16px\);\s*gap: 0;[\s\S]*?button \{\s*place-items: center;/,
);
assert.match(
  cssSource,
  /\.widget-calendar__workspace-actions button:only-child \{\s*grid-row: 1\s*\/\s*-1;\s*align-self: center;/,
);
assert.match(
  cssSource,
  /\.widget-calendar\[data-calendar-health-cached\]::after \{[\s\S]*?top: 1px;[\s\S]*?height: 2px;[\s\S]*?background: var\(--color-warning\);[\s\S]*?pointer-events: none;/,
);
assert.doesNotMatch(cssSource, /\.widget-calendar__health \{\s*position: absolute;/);
assert.match(
  cssSource,
  /\.widget-calendar__event\[data-calendar-health-only\] \.widget-calendar__health \{[\s\S]*?grid-column: 1\s*\/\s*-1;[\s\S]*?align-self: center;/,
);
assert.match(widgetSource, /calendarHealthOnly && calendarHealthNotice && \(/);
assert.doesNotMatch(widgetSource, /calendarHealthNotice && !calendarAwaitingFirstSync && \(/);
assert.match(
  widgetSource,
  /Calendar refresh delayed\. Showing the latest cached event\./,
);
assert.match(cssSource, /--radius-panel: 3px;/);
assert.match(
  cssSource,
  /\.widget-calendar-day-panel \{[\s\S]*?border-radius: var\(--radius-panel\);/,
);
assert.match(
  cssSource,
  /\.manager-shell\[data-compact\] \{[\s\S]*?border-radius: var\(--radius-panel\);/,
);
assert.match(
  cssSource,
  /\.widget-utility button:hover:not\(:disabled\),\s*\.widget-utility button:focus-visible,/,
);
assert.doesNotMatch(cssSource, /\.widget-calendar:hover \.widget-calendar__hover-actions/);
assert.match(cssSource, /\.widget-calendar__event:hover > \.widget-calendar__hover-actions/);
assert.match(cssSource, /\.widget-calendar__hover-actions \{\s*position: absolute;\s*z-index: 6;/);
assert.match(
  cssSource,
  /--widget-calendar-surface: color-mix\([\s\S]*?--color-danger-strong[\s\S]*?16%[\s\S]*?--widget-panel-solid/,
);
assert.match(cssSource, /--widget-panel-accent/);
assert.match(cssSource, /data-resize-direction="west"/);
assert.match(cssSource, /widget-calendar__meeting-provider/);
assert.match(cssSource, /transform: translateY\(-50%\)/);
assert.match(cssSource, /background-image: radial-gradient/);
assert.match(cssSource, /widget-visible-panels > label/);
assert.match(cssSource, /widget-app-badge\[data-tone="attention"\]/);
assert.match(cssSource, /\.widget-app-live/);
assert.match(cssSource, /var\(--widget-calendar-day-panel-height, 216px\)/);
assert.match(cssSource, /widget-calendar-day-panel ol \{[\s\S]*align-content: start/);
assert.match(cssSource, /widget-calendar-day-panel li \+ li \{\s*margin-top: 0/);
assert.match(todayPopupSource, /data-finished=\{finished \|\| undefined\}/);
assert.match(todayPopupSource, /data-live=\{live \|\| undefined\}/);
assert.match(todayPopupSource, /data-cancelled=\{selection\.cancelled \|\| undefined\}/);
// The empty-day wording is mode-dependent and lives in calendar-vocabulary.ts.
// It is also state-dependent: an empty list only means an empty day when the
// day was actually read. scripts/test-school-day-model.mjs asserts the strings
// and the state rules.
assert.match(todayPopupSource, /payload\.dayState === "verified"/);
assert.match(todayPopupSource, /vocabulary\.emptyDay/);
assert.match(todayPopupSource, /vocabulary\.unknownDay/);
assert.match(cssSource, /widget-calendar-day-panel__empty/);
assert.match(cssSource, /widget-calendar-day-panel li\[data-finished\]/);
assert.match(cssSource, /widget-calendar-day-panel li\[data-cancelled\]/);
assert.match(cssSource, /grid-template-columns: 64px minmax\(0, 1fr\) auto/);
assert.match(cssSource, /widget-calendar-day-panel li\[data-live\]/);
assert.match(cssSource, /widget-calendar-day-panel__actions/);
assert.match(cssSource, /widget-calendar-day-panel__actions > \.event-workspace-actions \{\s*display: flex;/);
assert.match(cssSource, /widget-calendar-day-panel__skip \{[\s\S]*?opacity: 0;[\s\S]*?pointer-events: none;/);
assert.match(cssSource, /\.today-popup-shell li:hover \.widget-calendar-day-panel__skip/);
assert.match(cssSource, /white-space: nowrap/);
assert.match(cssSource, /overflow: visible/);
assert.match(todayPopupSource, /open_event_workspace_link_from_workspace/);
assert.match(todayPopupSource, /className="widget-calendar-day-panel__actions"/);
assert.ok(
  eventWorkspaceActionsSource.indexOf('event-workspace-actions__link') <
    eventWorkspaceActionsSource.indexOf('event-workspace-actions__settings'),
  "Event settings must remain last after the direct actions",
);
assert.match(widgetSource, /className="widget-calendar__workspace-actions"/);
assert.doesNotMatch(widgetSource, /vocabulary\.onlineEvent/);
assert.match(cssSource, /grid-template-columns: auto minmax\(72px, 1fr\) max-content;\s*grid-template-rows: repeat\(2, minmax\(0, 1fr\)\);/);
assert.match(slimStyleSource, /&__event > \.widget-calendar__detail:not\(\.widget-calendar__setup\),[\s\S]*?display: contents;/);
assert.match(slimStyleSource, /&__title--compact \{[\s\S]*?grid-row: 1 \/ span 2;[\s\S]*?align-self: center;/);
assert.match(slimStyleSource, /&__countdown \{[\s\S]*?grid-row: 1;[\s\S]*?grid-column: 3;/);
assert.match(slimStyleSource, /&__metadata \{[\s\S]*?grid-row: 2;[\s\S]*?grid-column: 3;/);
assert.match(
  slimStyleSource,
  /grid-template-columns: auto minmax\(72px, 1fr\) max-content 34px;[\s\S]*?> \.widget-calendar__workspace-actions \{[\s\S]*?grid-column: 4;/,
);
assert.doesNotMatch(
  widgetSource,
  /className="widget-calendar__workspace-actions"[\s\S]*?onOpenSettings=/,
);
assert.match(widgetSource, /openCalendarProjectPanel/);
assert.match(cssSource, /grid-template-rows: repeat\(2, 14px\)/);
assert.match(cssSource, /grid-template-columns: repeat\(2, 16px\)/);
assert.match(
  cssSource,
  /top: calc\(var\(--widget-height, 68px\) \+ 5px\)/,
);
assert.match(
  cssSource,
  /bottom: calc\(var\(--widget-height, 68px\) \+ 5px\)/,
);

console.log("responsive widget layout tests passed");
