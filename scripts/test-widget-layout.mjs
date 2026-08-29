import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { compileAppStyles } from "./app-styles.mjs";

const sourceUrl = new URL("../src/widget-layout.ts", import.meta.url);
const sourceText = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(sourceText, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourceUrl.pathname,
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const layout = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`
);

assert.equal(layout.widgetHeight("recommended"), 55);
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
assert.equal(layout.widgetClockWidth("recommended"), 144);
assert.equal(layout.widgetClockWidth("slim"), 168);
assert.equal(layout.widgetClockPanelWidth("recommended", 5, "horizontal"), 360);
assert.equal(layout.widgetClockPanelWidth("recommended", 5, "vertical"), 144);
assert.equal(layout.widgetClockPanelWidth("slim", 5, "horizontal"), 420);
assert.equal(layout.widgetClockPanelWidth("slim", 5, "vertical"), 420);
assert.equal(layout.widgetZoneGap("recommended"), 0);
assert.equal(layout.widgetZoneGap("slim"), 0);

assert.equal(layout.widgetLeftWidth(0), 16);
assert.equal(layout.widgetLeftWidth(1), 48);
assert.equal(layout.widgetLeftWidth(2), 84);
assert.equal(layout.widgetLeftWidth(3), 120);
assert.equal(layout.widgetLeftWidth(6), 228);
assert.equal(layout.widgetLeftWidth(0, "recommended"), 16);
assert.equal(layout.widgetLeftWidth(2, "recommended"), 84);
assert.equal(layout.widgetLeftWidth(6, "recommended"), 228);
assert.equal(layout.widgetLeftWidth(0, "slim"), 0);
assert.equal(layout.widgetLeftWidth(2, "slim"), 64);
assert.equal(layout.widgetLeftWidth(6, "slim"), 192);
assert.equal(layout.widgetCalendarWidth("recommended", false), 260);
assert.equal(layout.widgetCalendarWidth("recommended", true), 392);
assert.equal(layout.widgetCalendarWidth("slim", false), 260);
assert.equal(layout.widgetCalendarWidth("slim", true), 520);
assert.equal(layout.widgetCalendarWidth("slim", false, 68), 420);
assert.equal(layout.widgetCalendarWidth("slim", false, 200), 600);
assert.equal(layout.widgetCalendarWidth("slim", true, 100), 616);
assert.equal(layout.widgetCalendarWidth("slim", true, 200), 800);
assert.equal(layout.widgetUtilityWidth("recommended"), 20);
assert.equal(layout.widgetUtilityWidth("slim"), 64);
assert.equal(layout.widgetWidth(0, "recommended"), 424);
assert.equal(layout.widgetWidth(2, "recommended"), 508);
assert.equal(layout.widgetWidth(6, "recommended"), 652);
assert.equal(layout.widgetWidth(0, "recommended", true), 556);
assert.equal(layout.widgetWidth(2, "recommended", true), 640);
assert.equal(layout.widgetWidth(6, "recommended", true), 784);
assert.equal(layout.widgetWidth(2), 508);
assert.equal(layout.widgetWidth(2, "recommended", false, 5, "horizontal"), 724);
assert.equal(layout.widgetWidth(2, "recommended", false, 5, "vertical"), 508);
assert.equal(layout.widgetWidth(2, "slim"), 574);
assert.equal(layout.widgetWidth(2, "slim", true), 834);
assert.equal(layout.widgetWidth(2, "slim", false, 5, "horizontal"), 826);
assert.equal(layout.widgetWidth(2, "slim", false, 5, "vertical"), 826);
assert.equal(
  layout.widgetWidth(2, "recommended", false, 2, "horizontal", false, true),
  424,
);
assert.equal(
  layout.widgetWidth(2, "recommended", false, 2, "horizontal", true, false),
  364,
);
assert.equal(
  layout.widgetWidth(2, "recommended", false, 2, "horizontal", false, false),
  280,
);
assert.equal(
  layout.widgetWidth(2, "slim", false, 2, "horizontal", false, false),
  342,
);
assert.equal(
  layout.widgetWidth(2, "slim", false, 2, "horizontal", true, true, 68),
  734,
);

const [
  appSource,
  widgetSource,
  todayPopupSource,
  todayPopupWindowSource,
  styleEntrySource,
  tauriConfigSource,
  capabilitiesSource,
  rustSource,
] = await Promise.all([
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/WidgetView.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/TodayPopupView.tsx", import.meta.url), "utf8"),
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
assert.match(widgetSource, /\{appsPanelVisible && \(/);
assert.match(widgetSource, /\{clocksPanelVisible && \(/);
assert.match(widgetSource, /className="widget-drag-handle"/);
assert.doesNotMatch(
  widgetSource,
  /className="widget-shell"\s+data-tauri-drag-region/,
);
assert.match(widgetSource, /onPointerDownCapture=\{\(event\) => \{/);
assert.match(widgetSource, /reposition_taskbar_mirrors/);
assert.match(widgetSource, /Menu\.new\(\{ items \}\)/);
assert.match(widgetSource, /onContextMenu=\{handleWidgetContextMenu\}/);
assert.match(widgetSource, /text: "Size preset"/);
assert.doesNotMatch(widgetSource, /text: "Larger"/);
assert.match(widgetSource, /text: "Visible panels"/);
assert.match(widgetSource, /text: "Appearance"/);
assert.match(widgetSource, /text: "Keep above other windows"/);
assert.match(widgetSource, /text: "App shortcuts"/);
assert.match(widgetSource, /text: "Clock layout"/);
assert.match(widgetSource, /import\.meta\.env\.DEV/);
assert.match(widgetSource, /text: "Inspect"/);
assert.match(widgetSource, /invoke\("open_main_panel_devtools"\)/);
assert.match(widgetSource, /function formatClockDay\(now: Date, timeZone\?: string\)/);
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
assert.match(todayPopupWindowSource, /new WebviewWindow\(TODAY_POPUP_WINDOW_LABEL/);
assert.match(capabilitiesSource, /"today"/);
assert.doesNotMatch(rustSource, /transition_widget_panel_at_upper_edge/);
assert.match(rustSource, /fn open_main_panel_devtools\(window: tauri::WebviewWindow\)/);
assert.match(rustSource, /window\.open_devtools\(\)/);
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
const tauriConfig = JSON.parse(tauriConfigSource);
const mainWindow = tauriConfig.app.windows.find(({ label }) => label === "main");
assert.equal(mainWindow.visible, false);
assert.equal(mainWindow.width, 548);
assert.equal(mainWindow.height, 60);
assert.ok(
  widgetSource.indexOf('className="widget-close-control"') <
    widgetSource.indexOf('className="widget-reminder-control"'),
  "Close must be the first utility control",
);
assert.doesNotMatch(widgetSource, /Pin Attention Hub always on top/);
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
assert.match(cssSource, /--widget-slim-control-size: 20px/);
assert.match(
  cssSource,
  /grid-template-columns: repeat\(3, var\(--widget-slim-control-size\)\)/,
);
assert.match(cssSource, /grid-template-columns: minmax\(0, 1fr\)/);
assert.match(cssSource, /grid-template-rows: repeat\(3, minmax\(0, 1fr\)\)/);
assert.match(cssSource, /\.widget-shell\[data-width-mode="slim"\] \.widget-close-control \{\s*order: 3;/);
assert.match(cssSource, /\.widget-shell\[data-width-mode="recommended"\] \.widget-apps \{\s*top: 9px;\s*left: 8px;\s*gap: 2px;/);
assert.match(cssSource, /--radius-panel: 3px;/);
assert.match(
  cssSource,
  /\.widget-calendar-day-panel \{[\s\S]*?border-radius: var\(--radius-panel\);/,
);
assert.match(
  cssSource,
  /\.event-settings-shell,[\s\S]*?\.project-stash-shell \{[\s\S]*?border-radius: var\(--radius-panel\);/,
);
assert.match(
  cssSource,
  /\.widget-utility button:hover:not\(:disabled\),\s*\.widget-utility button:focus-visible,/,
);
assert.match(cssSource, /\.widget-calendar:hover \.widget-calendar__hover-actions/);
assert.match(cssSource, /\.widget-calendar__hover-actions \{\s*position: absolute;\s*z-index: 6;/);
assert.match(cssSource, /--widget-calendar-surface: #fef2f2/);
assert.match(cssSource, /transform: translateY\(-50%\)/);
assert.match(cssSource, /background-image: radial-gradient/);
assert.match(cssSource, /widget-visible-panels > label/);
assert.match(cssSource, /widget-app-badge\[data-tone="attention"\]/);
assert.match(cssSource, /var\(--widget-calendar-day-panel-height, 216px\)/);
assert.match(cssSource, /widget-calendar-day-panel ol \{[\s\S]*align-content: start/);
assert.match(cssSource, /widget-calendar-day-panel li \+ li \{\s*margin-top: 0/);
assert.match(todayPopupSource, /data-finished=\{finished \|\| undefined\}/);
assert.match(todayPopupSource, /data-live=\{live \|\| undefined\}/);
assert.match(todayPopupSource, /data-cancelled=\{selection\.cancelled \|\| undefined\}/);
assert.match(todayPopupSource, /No meetings today\./);
assert.match(cssSource, /widget-calendar-day-panel__empty/);
assert.match(cssSource, /widget-calendar-day-panel li\[data-finished\]/);
assert.match(cssSource, /widget-calendar-day-panel li\[data-cancelled\]/);
assert.match(cssSource, /grid-template-columns: 64px minmax\(0, 1fr\) auto/);
assert.match(cssSource, /widget-calendar-day-panel li\[data-live\]/);
assert.match(cssSource, /widget-calendar-day-panel__actions/);
assert.match(cssSource, /white-space: nowrap/);
assert.match(cssSource, /overflow: visible/);
assert.match(todayPopupSource, /open_event_workspace_link/);
assert.match(todayPopupSource, /widget-calendar-day-panel__settings/);
assert.ok(
  todayPopupSource.indexOf('widget-calendar-day-panel__link') <
    todayPopupSource.indexOf('widget-calendar-day-panel__settings'),
  "Event settings must remain last after the direct actions",
);
assert.match(
  cssSource,
  /top: calc\(var\(--widget-height, 68px\) \+ 5px\)/,
);
assert.match(
  cssSource,
  /bottom: calc\(var\(--widget-height, 68px\) \+ 5px\)/,
);

console.log("responsive widget layout tests passed");
