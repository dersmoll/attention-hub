import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { compileAppStyles } from "./app-styles.mjs";

const modelUrl = new URL("../src/sticky-note-model.ts", import.meta.url);
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

assert.equal(model.STICKY_NOTE_WINDOW_LABEL, "sticky-note");
assert.equal(model.STICKY_NOTE_MAX_CHARACTERS, 4_000);
assert.deepEqual(model.STICKY_NOTE_WINDOW_GEOMETRY, {
  width: 320,
  height: 240,
  minWidth: 240,
  minHeight: 160,
});

const [view, windowSource, widget, app, capability, rust, css] = await Promise.all([
  readFile(new URL("../src/StickyNoteView.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/sticky-note-window.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/WidgetView.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/src/sticky_note.rs", import.meta.url), "utf8"),
  Promise.resolve(compileAppStyles()),
]);

assert.match(windowSource, /alwaysOnTop:\s*true/);
assert.match(windowSource, /resizable:\s*true/);
assert.match(windowSource, /skipTaskbar:\s*true/);
assert.match(windowSource, /reachableStoredPosition/);
assert.match(view, /await saveLatest\(\)/);
assert.match(view, /writeStoredFloatingGeometry/);
assert.match(view, /open_sticky_note_url/);
assert.match(widget, /widget-destinations__sticky-note/);
assert.match(app, /windowLabel === "sticky-note"/);
assert.ok(JSON.parse(capability).windows.includes("sticky-note"));
assert.match(rust, /sticky-note\.json/);
assert.match(rust, /expected_revision/);
assert.match(rust, /That link is no longer present in the saved sticky note/);
assert.match(css, /\.sticky-note\s*\{/);
assert.match(css, /\.widget-destinations\[data-segments="4"\]/);

console.log("sticky note contract tests passed");
