import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { compileAppStyles } from "./app-styles.mjs";

const modelUrl = new URL("../src/event-workspace-model.ts", import.meta.url);
const modelSource = await readFile(modelUrl, "utf8");
const compiled = ts.transpileModule(modelSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: modelUrl.pathname,
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const model = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`);

assert.deepEqual(model.EVENT_SETTINGS_WINDOW_GEOMETRY, { width: 350, height: 260, minWidth: 300, minHeight: 210 });
assert.deepEqual(model.PROJECT_PANEL_WINDOW_GEOMETRY, { width: 420, height: 480, minWidth: 360, minHeight: 360 });
assert.deepEqual(model.PROJECT_NOTES_WINDOW_GEOMETRY, { width: 360, height: 240, minWidth: 320, minHeight: 180 });
assert.deepEqual(model.PROJECT_TODOS_WINDOW_GEOMETRY, { width: 380, height: 360, minWidth: 320, minHeight: 220 });
assert.deepEqual(model.TODO_DETAIL_WINDOW_GEOMETRY, { width: 360, height: 280, minWidth: 320, minHeight: 220 });
assert.match(modelSource, /view\?: "project" \| "notes" \| "todos" \| "todo"/);

const [app, widget, today, eventActions, settings, manager, projectPanel, calendarModel, nativeWorkspace, nativeLib, nativeExternalUrl, nativeCalendar, capabilities, css, popupTheme] = await Promise.all([
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/WidgetView.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/TodayPopupView.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/EventWorkspaceActions.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/EventSettingsView.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/ManagerView.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/ProjectPanelWindow.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/work-calendar-model.ts", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/src/workspace.rs", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/src/external_url.rs", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/src/work_calendar/mod.rs", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8"),
  Promise.resolve(compileAppStyles()),
  readFile(new URL("../src/use-widget-panel-style.ts", import.meta.url), "utf8"),
]);

assert.match(app, /windowLabel === "event-settings"/);
assert.match(app, /windowLabel === "project-panel"/);
assert.match(app, /<ProjectPanelWindow/);
assert.doesNotMatch(app, /ProjectStashView/);
assert.match(calendarModel, /eventToken: string \| null/);
assert.match(calendarModel, /eventWorkspace: WorkCalendarEventWorkspaceSummary \| null/);
assert.match(calendarModel, /meetingProvider: "teams" \| "zoom" \| null/);
assert.match(today, /className="widget-calendar-day-panel__actions"/);
assert.match(today, /className="today-popup-todos"/);
assert.match(today, /complete_action_item/);
assert.match(today, /restore_action_item/);
assert.match(today, /deferActionItemToTomorrow/);
assert.match(today, /view: "todo"/);
assert.match(today, /className="today-popup-todos__defer"/);
assert.match(today, /isVisibleInToday/);
assert.match(today, /pendingTodoCount=\{pendingProjectTodos/);
assert.match(today, /openProjectPanel\(selection, "notes"\)/);
assert.match(today, /openProjectPanel\(selection, "todos"\)/);
assert.match(eventActions, /event-workspace-actions__settings/);
assert.match(eventActions, /event-workspace-actions__stash/);
assert.match(eventActions, /event-workspace-actions__notes/);
assert.match(today, /open_event_workspace_link_from_workspace/);
assert.match(eventActions, /workspace\.linkUrl/);
assert.match(today, /data-live=\{live \|\| undefined\}/);
assert.match(today, /style=\{panelStyle\}/);
assert.match(settings, /Today link <em>optional<\/em>/);
assert.match(settings, /projectLinkId/);
assert.match(settings, /No project/);
assert.match(settings, /get_event_workspace/);
assert.match(settings, /save_event_workspace/);
assert.match(settings, /WORKSPACE_CHANGED_EVENT/);
assert.match(settings, /startDragging\(\)/);
assert.match(settings, /onResized/);
assert.match(settings, /style=\{panelStyle\}/);
assert.match(projectPanel, /PROJECT_PANEL_OPEN_EVENT/);
assert.match(projectPanel, /className="project-quick-view"/);
assert.match(projectPanel, /className="project-quick-view todo-detail-view"/);
assert.match(projectPanel, /open_action_item_note_url/);
assert.match(projectPanel, /No pending to-dos/);
assert.match(projectPanel, /No project notes/);
assert.match(projectPanel, /open_project_note_url/);
assert.match(projectPanel, /complete_action_item/);
assert.match(projectPanel, /projectPanelGeometryLabel\(view\)/);
assert.match(manager, /Open in Project Hub/);
assert.match(manager, /startDragging\(\)/);
assert.match(manager, /onResized/);
assert.match(manager, /style=\{panelStyle\}/);
assert.doesNotMatch(manager, /onCloseRequested/);
assert.doesNotMatch(manager, /currentWindow\.destroy\(\)/);
assert.match(manager, /todo\.id === item\.id && <form className="manager-todo-editor manager-todo-editor--inline"/);
assert.match(manager, /todoDetails\(!compact\)/);
assert.match(manager, /\{!todo\.id && <form className="manager-todo-editor"/);
assert.match(manager, /managerSection === "all-todos"/);
assert.match(manager, /className="manager-todos manager-todos--all"/);
assert.equal((manager.match(/item\.completedAt \? "↺" : null/g) ?? []).length, 2);
assert.doesNotMatch(manager, /item\.completedAt \? "↺" : "✓"/);
assert.match(manager, /manager-todo-columns manager-todo-columns--all"><span><\/span><span>To-do<\/span>/);
assert.match(manager, /ownerLabel\(item\)/);
assert.ok(manager.indexOf('<nav aria-label="Projects">') < manager.indexOf('<input aria-label="New project name"'));
assert.ok(manager.indexOf('<ol className="manager-todos">') < manager.lastIndexOf('<input aria-label="To-do title"'));
assert.match(css, /manager-todo-editor__details \{\s*grid-template-columns: minmax\(110px, 0\.75fr\) minmax\(190px, 1\.25fr\)/);
assert.match(css, /\.manager-todo-columns--all/);
assert.match(css, /--manager-all-todos-columns: 24px minmax\(130px, 1fr\) 150px 110px 145px 78px/);
assert.match(css, /> \.manager-todo-owner \{[\s\S]*?grid-column: 3;[\s\S]*?grid-row: 1;/);
assert.match(css, /> \.manager-row-actions \{[\s\S]*?grid-column: 6;[\s\S]*?grid-row: 1;/);
assert.match(css, /\.manager-row-actions \.manager-icon-action \{[\s\S]*?width: 22px;[\s\S]*?padding: 0;[\s\S]*?border: 0;/);
assert.match(popupTheme, /WIDGET_PREFERENCES_CHANGED_EVENT/);
assert.match(popupTheme, /widgetPanelStyle\(preferences\)/);
assert.match(nativeWorkspace, /workspace\.json/);
assert.match(nativeWorkspace, /external_url::normalize_url/);
assert.match(nativeWorkspace, /snapshot\.overlapping_selections\.iter_mut\(\)/);
assert.match(nativeExternalUrl, /must use HTTP or HTTPS/);
assert.match(nativeLib, /workspace::enrich_calendar_snapshot/);
assert.doesNotMatch(nativeLib, /meeting_workspace::enrich_calendar_snapshot/);
assert.match(nativeCalendar, /attention-hub-recurring-series-v1/);
assert.match(nativeCalendar, /attention-hub-calendar-event-v1/);
assert.match(nativeCalendar, /#\[serde\(skip_serializing\)\][\s\S]*workspace_key/);
assert.match(nativeCalendar, /pub link_url: Option<String>/);
assert.match(nativeCalendar, /pub event_token: Option<String>/);
assert.match(widget, /className="widget-calendar__workspace-actions"/);
assert.match(widget, /className="widget-destinations widget-zone"/);
assert.match(widget, /openManagerWindow\("projects"\)/);
assert.match(widget, /openManagerWindow\("todos"\)/);
assert.match(capabilities, /"event-settings"/);
assert.match(capabilities, /"project-panel"/);
assert.doesNotMatch(capabilities, /"project-stash"/);
assert.match(capabilities, /"core:window:allow-close"/);
assert.match(css, /grid-template-columns: 64px minmax\(0, 1fr\) auto/);
assert.match(css, /white-space: nowrap/);
assert.match(css, /Bahnschrift SemiCondensed/);
assert.match(css, /widget-calendar-day-panel li\[data-live\]/);
assert.match(css, /--radius-panel: 3px/);
assert.match(css, /\.manager-shell\[data-compact\] \{[\s\S]*?border-radius: var\(--radius-panel\)/);
assert.match(today, /<HubCloseIcon \/>/);
assert.match(settings, /<HubCloseIcon \/>/);
assert.match(manager, /<HubCloseIcon \/>/);
assert.match(css, /html\[data-window="event-settings"\]/);
assert.match(css, /html\[data-window="project-panel"\]/);
assert.match(css, /background: transparent/);
assert.match(css, /background: var\(--widget-panel-solid\)/);
assert.match(css, /\.project-quick-view/);
assert.match(css, /\.manager-todo-editor--inline/);

console.log("event workspace contract tests passed");
