import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

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

assert.equal(layout.widgetHeight("recommended"), 68);
assert.equal(layout.widgetHeight("larger"), 80);
assert.equal(layout.widgetHeight("slim"), 44);
assert.equal(layout.CALENDAR_DAY_PANEL_ROW_HEIGHT, 216);
assert.equal(layout.CALENDAR_DAY_PANEL_WINDOW_EXTRA_HEIGHT, 224);
assert.equal(layout.calendarDayPanelHeight(1), 85);
assert.equal(layout.calendarDayPanelHeight(8), 232);
assert.equal(layout.calendarDayPanelHeight(24), 568);
assert.equal(layout.calendarDayPanelHeight(99), 568);
assert.equal(layout.calendarDayPanelWindowExtraHeight(8), 237);
assert.equal(layout.calendarDayPanelDirection(40, 68, 0, 1080), "below");
assert.equal(layout.calendarDayPanelDirection(980, 68, 0, 1080), "above");
assert.equal(layout.calendarDayPanelPhysicalOffset(1), 216);
assert.equal(layout.calendarDayPanelPhysicalOffset(1.25), 270);
assert.equal(layout.calendarDayPanelPhysicalOffset(1.5), 324);
assert.equal(layout.calendarDayPanelPhysicalOffset(1.25, 248), 310);
assert.equal(layout.widgetClockWidth("recommended"), 208);
assert.equal(layout.widgetClockWidth("larger"), 240);
assert.equal(layout.widgetClockWidth("slim"), 176);
assert.equal(layout.widgetClockPanelWidth("recommended", 5, "horizontal"), 520);
assert.equal(layout.widgetClockPanelWidth("recommended", 5, "vertical"), 208);
assert.equal(layout.widgetClockPanelWidth("larger", 5, "horizontal"), 600);
assert.equal(layout.widgetClockPanelWidth("slim", 5, "horizontal"), 440);
assert.equal(layout.widgetClockPanelWidth("slim", 5, "vertical"), 440);
assert.equal(layout.widgetZoneGap("recommended"), 6);
assert.equal(layout.widgetZoneGap("larger"), 8);
assert.equal(layout.widgetZoneGap("slim"), 0);

assert.equal(layout.widgetLeftWidth(0), 16);
assert.equal(layout.widgetLeftWidth(1), 56);
assert.equal(layout.widgetLeftWidth(2), 100);
assert.equal(layout.widgetLeftWidth(3), 144);
assert.equal(layout.widgetLeftWidth(6), 276);
assert.equal(layout.widgetLeftWidth(0, "recommended"), 16);
assert.equal(layout.widgetLeftWidth(2, "recommended"), 100);
assert.equal(layout.widgetLeftWidth(6, "recommended"), 276);
assert.equal(layout.widgetLeftWidth(0, "slim"), 0);
assert.equal(layout.widgetLeftWidth(2, "slim"), 74);
assert.equal(layout.widgetLeftWidth(6, "slim"), 210);
assert.equal(layout.widgetCalendarWidth("recommended", false), 272);
assert.equal(layout.widgetCalendarWidth("recommended", true), 392);
assert.equal(layout.widgetCalendarWidth("larger", false), 416);
assert.equal(layout.widgetCalendarWidth("larger", true), 416);
assert.equal(layout.widgetCalendarWidth("slim", false), 260);
assert.equal(layout.widgetCalendarWidth("slim", true), 520);
assert.equal(layout.widgetCalendarWidth("slim", false, 68), 420);
assert.equal(layout.widgetCalendarWidth("slim", false, 200), 600);
assert.equal(layout.widgetCalendarWidth("slim", true, 100), 616);
assert.equal(layout.widgetCalendarWidth("slim", true, 200), 800);
assert.equal(layout.widgetUtilityWidth("slim"), 112);
assert.equal(layout.widgetWidth(0, "recommended"), 560);
assert.equal(layout.widgetWidth(2, "recommended"), 666);
assert.equal(layout.widgetWidth(6, "recommended"), 842);
assert.equal(layout.widgetWidth(0, "recommended", true), 680);
assert.equal(layout.widgetWidth(2, "recommended", true), 786);
assert.equal(layout.widgetWidth(6, "recommended", true), 962);
assert.equal(layout.widgetWidth(2), 666);
assert.equal(layout.widgetWidth(2, "larger"), 876);
assert.equal(layout.widgetWidth(6, "larger"), 1100);
assert.equal(layout.widgetWidth(99, "larger"), 1100);
assert.equal(layout.widgetWidth(2, "recommended", false, 5, "horizontal"), 978);
assert.equal(layout.widgetWidth(2, "recommended", false, 5, "vertical"), 666);
assert.equal(layout.widgetWidth(2, "slim"), 640);
assert.equal(layout.widgetWidth(2, "slim", true), 900);
assert.equal(layout.widgetWidth(2, "slim", false, 5, "horizontal"), 904);
assert.equal(layout.widgetWidth(2, "slim", false, 5, "vertical"), 904);
assert.equal(
  layout.widgetWidth(2, "recommended", false, 2, "horizontal", false, true),
  560,
);
assert.equal(
  layout.widgetWidth(2, "recommended", false, 2, "horizontal", true, false),
  452,
);
assert.equal(
  layout.widgetWidth(2, "recommended", false, 2, "horizontal", false, false),
  346,
);
assert.equal(
  layout.widgetWidth(2, "slim", false, 2, "horizontal", false, false),
  390,
);
assert.equal(
  layout.widgetWidth(2, "slim", false, 2, "horizontal", true, true, 68),
  800,
);

const [appSource, widgetSource, cssSource, tauriConfigSource, rustSource] = await Promise.all([
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/WidgetView.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/App.css", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8"),
]);
assert.match(appSource, /value="slim">Compact single-line/);
assert.match(appSource, /<legend>Visible panels<\/legend>/);
assert.match(appSource, /widget-preference-card widget-visible-panels/);
assert.match(appSource, /Show app shortcuts/);
assert.match(appSource, /Show clocks/);
assert.match(widgetSource, /\{appsPanelVisible && \(/);
assert.match(widgetSource, /\{clocksPanelVisible && \(/);
assert.match(widgetSource, /className="widget-drag-handle"/);
assert.match(widgetSource, /reposition_taskbar_mirrors/);
assert.match(widgetSource, /Menu\.new\(\{ items \}\)/);
assert.match(widgetSource, /onContextMenu=\{handleWidgetContextMenu\}/);
assert.match(widgetSource, /text: "Size preset"/);
assert.match(widgetSource, /text: "Visible panels"/);
assert.match(widgetSource, /text: "App shortcuts"/);
assert.match(widgetSource, /text: "Clock layout"/);
assert.match(widgetSource, /await existing\.unminimize\(\)/);
assert.match(widgetSource, /\? "calendar-day-summary"/);
assert.match(widgetSource, /\? calendarDayPanelOpen/);
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
assert.equal(mainWindow.width, 666);
assert.equal(mainWindow.height, 68);
assert.ok(
  widgetSource.indexOf('className="widget-advanced-control"') <
    widgetSource.indexOf('className="widget-close-control"'),
  "Close must remain the last utility control",
);
assert.match(cssSource, /data-width-mode="slim"/);
assert.match(cssSource, /grid-template-columns: repeat\(4, 26px\)/);
assert.match(cssSource, /--widget-calendar-surface: #fef2f2/);
assert.match(cssSource, /transform: translateY\(-50%\)/);
assert.match(cssSource, /background-image: radial-gradient/);
assert.match(cssSource, /widget-visible-panels > label/);
assert.match(cssSource, /widget-app-badge\[data-tone="attention"\]/);
assert.match(cssSource, /var\(--widget-calendar-day-panel-height, 216px\)/);
assert.match(cssSource, /widget-calendar-day-panel ol \{[\s\S]*align-content: start/);
assert.match(cssSource, /widget-calendar-day-panel li \+ li \{\s*margin-top: 0/);
assert.match(widgetSource, /data-finished=\{finished \|\| undefined\}/);
assert.match(cssSource, /widget-calendar-day-panel li\[data-finished\]/);
assert.match(
  cssSource,
  /top: calc\(var\(--widget-height, 68px\) \+ 5px\)/,
);
assert.match(
  cssSource,
  /bottom: calc\(var\(--widget-height, 68px\) \+ 5px\)/,
);

console.log("responsive widget layout tests passed");
