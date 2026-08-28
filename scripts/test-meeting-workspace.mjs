import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const modelUrl = new URL("../src/event-workspace-model.ts", import.meta.url);
const modelSource = await readFile(modelUrl, "utf8");
const compiled = ts.transpileModule(modelSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: modelUrl.pathname,
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const model = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`
);

assert.deepEqual(model.EVENT_SETTINGS_WINDOW_GEOMETRY, {
  width: 350,
  height: 260,
  minWidth: 300,
  minHeight: 210,
});
assert.deepEqual(model.PROJECT_STASH_WINDOW_GEOMETRY, {
  width: 360,
  height: 280,
  minWidth: 300,
  minHeight: 200,
});
assert.equal(model.MAX_PROJECT_NOTE_CHARACTERS, 4_000);

const [
  app,
  widget,
  today,
  settings,
  stash,
  calendarModel,
  nativeWorkspace,
  nativeCalendar,
  capabilities,
  css,
  popupTheme,
] =
  await Promise.all([
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/WidgetView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/TodayPopupView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/EventSettingsView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/ProjectStashView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/work-calendar-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../src-tauri/src/meeting_workspace.rs", import.meta.url), "utf8"),
    readFile(new URL("../src-tauri/src/work_calendar/mod.rs", import.meta.url), "utf8"),
    readFile(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
    readFile(new URL("../src/use-widget-panel-style.ts", import.meta.url), "utf8"),
  ]);

assert.match(app, /windowLabel === "event-settings"/);
assert.match(app, /windowLabel === "project-stash"/);
assert.match(calendarModel, /eventToken: string \| null/);
assert.match(calendarModel, /eventWorkspace: WorkCalendarEventWorkspaceSummary \| null/);
assert.match(today, /widget-calendar-day-panel__settings/);
assert.match(today, /widget-calendar-day-panel__stash/);
assert.match(today, /open_event_workspace_link/);
assert.match(today, /eventWorkspace\.linkUrl/);
assert.match(today, /data-live=\{live \|\| undefined\}/);
assert.match(today, /style=\{panelStyle\}/);
assert.match(settings, /Event link <em>optional<\/em>/);
assert.match(settings, /No project stash/);
assert.match(settings, /startDragging\(\)/);
assert.match(settings, /onResized/);
assert.match(settings, /style=\{panelStyle\}/);
assert.match(stash, /Project stash/);
assert.match(stash, /Saving locally/);
assert.match(stash, /startDragging\(\)/);
assert.match(stash, /project-stash-toolbar/);
assert.match(stash, /onResized/);
assert.match(stash, /style=\{panelStyle\}/);
assert.match(popupTheme, /WIDGET_PREFERENCES_CHANGED_EVENT/);
assert.match(popupTheme, /widgetPanelStyle\(preferences\)/);
assert.match(nativeWorkspace, /meeting-workspaces\.json/);
assert.match(nativeWorkspace, /URL must use HTTP or HTTPS/);
assert.match(nativeWorkspace, /write_store\(&path, &loaded\.store, false\)/);
assert.match(nativeCalendar, /attention-hub-recurring-series-v1/);
assert.match(nativeCalendar, /attention-hub-calendar-event-v1/);
assert.match(nativeCalendar, /#\[serde\(skip_serializing\)\][\s\S]*workspace_key/);
assert.match(nativeCalendar, /pub link_url: Option<String>/);
assert.match(capabilities, /"event-settings"/);
assert.match(capabilities, /"project-stash"/);
assert.match(capabilities, /"core:window:allow-close"/);
assert.match(css, /grid-template-columns: 64px minmax\(0, 1fr\) auto/);
assert.match(css, /white-space: nowrap/);
assert.match(css, /opacity: 0\.3/);
assert.match(css, /Bahnschrift SemiCondensed/);
assert.match(css, /widget-calendar-day-panel li\[data-live\]/);
assert.match(css, /\.widget-calendar-day-panel \{[\s\S]*border-radius: 8px/);
assert.match(css, /\.event-settings-shell,[\s\S]*border-radius: 8px/);
assert.match(today, /<HubCloseIcon \/>/);
assert.match(settings, /<HubCloseIcon \/>/);
assert.match(stash, /<HubCloseIcon \/>/);
assert.match(css, /html\[data-window="event-settings"\]/);
assert.match(css, /background: transparent/);
assert.match(css, /background: var\(--widget-panel-solid, #f8fafc\)/);

console.log("event workspace contract tests passed");
